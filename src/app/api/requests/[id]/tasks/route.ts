import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  addNote, addTask, applyConfirmedUpdate, approveSuggestions, assignTask, canUpdateTask,
  dismissSuggestions, editTask, generateSuggestions, recordPartnerAnswer, removeTask, reviewTask,
  TaskError, type Actor,
} from "@/lib/tasks";
import { proposeTaskUpdate, PROPOSED_STATES } from "@/lib/ai/taskUpdate";
import { detectSafety, resourcesFor, SAFETY_RESOURCES } from "@/lib/safety";
import { flagSafety } from "@/lib/actions";
import { NEEDS } from "@/lib/types";

const text = (max: number) => z.string().trim().min(1).max(max);
const actorShape = { actorName: text(120), actorOrg: text(120), actorPartnerId: z.string().max(120).optional() };

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve_suggestions"), ...actorShape,
    items: z.array(z.object({ id: z.string(), title: text(120), description: z.string().trim().max(400), category: z.enum(NEEDS) })).min(1).max(8) }),
  z.object({ action: z.literal("dismiss_suggestions"), ...actorShape }),
  // Draft tasks for a ticket that has none. Explicit, coordinator-only, one model call.
  z.object({ action: z.literal("generate_suggestions"), ...actorShape }),
  z.object({ action: z.literal("add_task"), ...actorShape, title: text(120), description: z.string().trim().max(400), category: z.enum(NEEDS) }),
  z.object({ action: z.literal("edit_task"), ...actorShape, taskId: z.string(), title: text(120), description: z.string().trim().max(400) }),
  z.object({ action: z.literal("remove_task"), ...actorShape, taskId: z.string() }),
  z.object({ action: z.literal("assign"), ...actorShape, taskId: z.string(), to: z.object({ kind: z.enum(["person", "partner"]), id: text(120), name: text(120) }) }),
  z.object({ action: z.literal("partner_answer"), ...actorShape, taskId: z.string(), accepted: z.boolean(), reason: z.string().max(240).optional() }),
  // Stage A: ask what the update means. Writes NOTHING.
  z.object({ action: z.literal("propose_update"), ...actorShape, updateText: text(1000) }),
  // Stage B: persist exactly what the volunteer confirmed.
  z.object({ action: z.literal("confirm_update"), ...actorShape, taskId: z.string(),
    doneItems: z.array(z.string().max(200)).max(8), remainingItems: z.array(z.string().max(200)).max(8),
    outOfScopeItems: z.array(z.string().max(200)).max(8).optional(),
    blocker: z.string().max(240).optional(), proposedState: z.enum(PROPOSED_STATES), noteText: z.string().trim().max(1000),
    idempotencyKey: z.string().min(6).max(120) }),
  z.object({ action: z.literal("review"), ...actorShape, taskId: z.string(), outcome: z.enum(["done", "partly", "not_done"]), reason: z.string().max(240).optional() }),
  z.object({ action: z.literal("note"), ...actorShape, taskId: z.string(), noteText: text(500) }),
]);

/** Tasks + suggestions for one ticket. Contact details never leave the server. */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const req = await db.getRequest(id);
  if (!req) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ tasks: req.tasks ?? [], taskSuggestions: req.taskSuggestions ?? null });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const a = parsed.data;
  const actor: Actor = { name: a.actorName, org: a.actorOrg, partnerId: a.actorPartnerId };

  try {
    switch (a.action) {
      case "approve_suggestions": await approveSuggestions(id, actor, a.items); break;
      case "dismiss_suggestions": await dismissSuggestions(id, actor); break;
      case "generate_suggestions": await generateSuggestions(id, actor); break;
      case "add_task": await addTask(id, actor, { title: a.title, description: a.description, category: a.category }); break;
      case "edit_task": await editTask(id, actor, a.taskId, { title: a.title, description: a.description }); break;
      case "remove_task": await removeTask(id, actor, a.taskId); break;
      case "assign": await assignTask(id, actor, a.taskId, a.to); break;
      case "partner_answer": await recordPartnerAnswer(id, actor, a.taskId, a.accepted, a.reason); break;
      case "review": await reviewTask(id, actor, a.taskId, a.outcome, a.reason); break;
      case "note": await addNote(id, actor, a.taskId, a.noteText); break;

      case "propose_update": {
        const req = await db.getRequest(id);
        if (!req) return NextResponse.json({ error: "not found" }, { status: 404 });
        // Only tasks this person may actually update are ever shown to the model.
        const mine = (req.tasks ?? []).filter((t) => canUpdateTask(t, actor) && t.state !== "done");
        if (!mine.length) return NextResponse.json({ error: "You have no tasks to update on this ticket." }, { status: 403 });

        // Safety runs on every update, before anything else is considered.
        const level = detectSafety(a.updateText);
        let safety: { level: string; resources: string[] } | null = null;
        if (level) {
          const names = resourcesFor(level, a.updateText).map((k) => SAFETY_RESOURCES.find((r) => r.key === k)?.name ?? k);
          safety = { level, resources: names };
          await flagSafety(id, level, a.updateText, undefined, names);
        }

        const result = await proposeTaskUpdate(a.updateText, mine.map((t) => ({ id: t.id, title: t.title, description: t.description, state: t.state })));
        return NextResponse.json({
          ...result,
          safety,
          // Never auto-advance a task when a danger signal was detected.
          proposals: safety ? [] : result.proposals,
          tasks: mine.map((t) => ({ id: t.id, title: t.title, state: t.state })),
          saved: false,
        });
      }

      case "confirm_update":
        await applyConfirmedUpdate(id, actor, {
          taskId: a.taskId, doneItems: a.doneItems, remainingItems: a.remainingItems,
          outOfScopeItems: a.outOfScopeItems, blocker: a.blocker, proposedState: a.proposedState, noteText: a.noteText,
        }, a.idempotencyKey);
        break;
    }

    const updated = await db.getRequest(id);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ tasks: updated.tasks ?? [], taskSuggestions: updated.taskSuggestions ?? null });
  } catch (e) {
    if (e instanceof TaskError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

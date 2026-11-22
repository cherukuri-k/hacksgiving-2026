// Keeps draft tasks on every open ticket, and tailors their wording with the hosted model.
//
// Both jobs are automatic and neither blocks intake or a coordinator:
//  - ensureDraftsForOpenRequests: an open ticket without tasks gets the local planner's draft,
//    so nobody has to open a ticket and press a button to see what it needs.
//  - refineDraftTasks: in hybrid mode a hosted model tailors a draft's wording to its request.
import { db } from "./db";
import { refineSuggestions } from "./ai/taskRefine";
import { buildSuggestions, plannerSetting } from "./ai/taskSuggest";
import type { HelpRequest } from "./types";

/** A delivered or verified ticket no longer needs a plan drafted for it. */
const OPEN = new Set<HelpRequest["status"]>(["new", "claimed", "in_progress"]);

/** After a failed attempt, how long before the same draft may be sent to the model again. */
const RETRY_AFTER_MS = 60_000;

// Next bundles each route separately, so plain module variables would not be shared between
// intake and the board's routes. Same trick as lib/db/memory.ts.
interface DraftState { backfill: Promise<void> | null; tailoring: Map<string, Promise<boolean>>; tried: Map<string, number> }
const g = globalThis as unknown as { __relayDrafts?: DraftState };
const state = (): DraftState => (g.__relayDrafts ??= { backfill: null, tailoring: new Map(), tried: new Map() });

/**
 * Draft tasks for every open ticket that has none (seeded tickets, tickets older than tasks).
 * Local planner only: a few milliseconds each and no network. Quiet on purpose: no activity
 * entry, `updatedAt` does not move and no safety flag is raised from here, because drafting
 * tasks for an old ticket must not change how that ticket reads on the board.
 *
 * @returns true when at least one ticket was given drafts, so the caller knows to read again
 */
export async function ensureDraftsForOpenRequests(requests: HelpRequest[]): Promise<boolean> {
  // The hosted-only path costs a model call per ticket; that one stays an explicit action.
  if (plannerSetting() === "claude") return false;
  const todo = requests.filter((r) => OPEN.has(r.status) && !r.taskSuggestions && !r.tasks?.length);
  if (!todo.length) return false;
  const s = state();
  s.backfill ??= (async () => {
    for (const r of todo) {
      try {
        const suggestions = await buildSuggestions(r.redactedText, r.needs, r.safety?.level);
        const cur = await db.getRequest(r.id);
        if (suggestions.items.length && cur && !cur.taskSuggestions && !cur.tasks?.length) await db.annotateRequest(r.id, { taskSuggestions: suggestions });
      } catch (err) {
        console.warn(`[tasks] could not draft tasks for ${r.shortCode}:`, (err as Error).message);
      }
    }
  })().finally(() => { s.backfill = null; });
  await s.backfill;
  return true;
}

/**
 * Tailor the draft tasks on a ticket with the hosted model, if hybrid drafting is on.
 *
 * Runs after the planner's draft is already saved. The model takes a few seconds; a coordinator
 * may approve, edit or dismiss the drafts in that time, so the ticket is read again before
 * anything is written and the rewrite is dropped unless the very same draft is still waiting.
 * Safe to call from several places at once: one draft is sent to the model once, and a second
 * caller waits for the first.
 *
 * @param generatedAt identifies the draft this rewrite belongs to
 * @returns true when the ticket was updated
 */
export function refineDraftTasks(requestId: string, generatedAt: string): Promise<boolean> {
  if (plannerSetting() !== "hybrid") return Promise.resolve(false);
  const s = state();
  const key = `${requestId}:${generatedAt}`;
  const running = s.tailoring.get(key);
  if (running) return running;
  if (Date.now() - (s.tried.get(key) ?? 0) < RETRY_AFTER_MS) return Promise.resolve(false);
  s.tried.set(key, Date.now());
  const job = tailor(requestId, generatedAt).finally(() => s.tailoring.delete(key));
  s.tailoring.set(key, job);
  return job;
}

async function tailor(requestId: string, generatedAt: string): Promise<boolean> {
  try {
    const stillWaiting = async () => {
      const req = await db.getRequest(requestId);
      const draft = req?.taskSuggestions;
      return req && draft && draft.status === "draft" && draft.generatedAt === generatedAt && !draft.refinedAt && !req.tasks?.length ? { req, draft } : null;
    };
    const before = await stillWaiting();
    if (!before) return false;
    const refined = await refineSuggestions(before.draft, before.req, await db.listPlaybooks());
    if (!refined || !(await stillWaiting())) return false;
    await db.annotateRequest(requestId, { taskSuggestions: refined }, {
      actor: "ai",
      type: "task",
      text: `AI tailored the wording of ${refined.items.length} draft tasks to this request · the planner's safety and consent steps are unchanged · nothing is assigned until a coordinator approves`,
    });
    return true;
  } catch (err) {
    // The planner's draft is already on the ticket; a failed rewrite costs nothing.
    console.warn("[tasks] could not tailor draft tasks:", (err as Error).message);
    return false;
  }
}

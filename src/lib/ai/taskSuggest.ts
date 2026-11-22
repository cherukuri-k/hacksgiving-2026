// Draft tasks for a new ticket.
//
// Everything here is a SUGGESTION: it assigns nobody, contacts nobody, and never changes the
// ticket's status. A coordinator approves before any of it becomes real work.
//
// The model may only propose services for needs the intake already recorded. The deterministic
// fallback lives in lib/taskRules.ts and is unit-tested there.
import { z } from "zod";
import { complete, llmConfigured, parseJson } from "./llm";
import { redactPII } from "./redact";
import { fallbackSuggestions, suggestionId, SUGGESTION_MAX } from "../taskRules";
import { NEED_LABEL, NEEDS, type Need, type SafetyLevel, type TaskSuggestions } from "../types";

export { fallbackSuggestions } from "../taskRules";

const SYSTEM = `You turn a Milwaukee mutual-aid intake into a short list of concrete coordination tasks.

Rules:
- Only propose tasks for needs the request ALREADY has. Never invent a need.
- One task per distinct service, never more than ${SUGGESTION_MAX}.
- "title": a short action a coordinator performs, 3 to 8 words, e.g. "Arrange water-removal assistance".
- "description": one plain sentence saying what has to happen.
- "category": one of ${NEEDS.join(", ")}.
- Never name a partner organisation, never promise anyone will help, never say anything is already arranged.
- Never include a person's name, phone number or address.

Return JSON: { "tasks": [ { "title": string, "description": string, "category": string } ] }`;

const Schema = z.object({
  tasks: z.array(z.object({
    title: z.string().trim().min(3).max(90),
    description: z.string().trim().min(3).max(240),
    category: z.string(),
  })).max(20),
});

/**
 * Which engine drafts task suggestions.
 * - `local`: the on-disk planner only. No API key, no network call.
 * - `hybrid`: the local planner drafts, then a hosted model tailors the wording (lib/ai/taskRefine.ts).
 * - `claude`: the original hosted-model-only path.
 */
export type PlannerSetting = "local" | "hybrid" | "claude";

/** Explicit `RELAY_PLANNER` wins. Unset: hybrid when a model key is configured, otherwise local. */
export function plannerSetting(): PlannerSetting {
  const v = process.env.RELAY_PLANNER;
  if (v === "claude" || v === "local" || v === "hybrid") return v;
  return llmConfigured() ? "hybrid" : "local";
}

/**
 * Build the suggestion set for a request.
 *
 * `local` and `hybrid` draft with the on-disk planner in lib/planner: no API key, no network.
 * In hybrid mode the caller then runs refineDraftTasks() (lib/taskDrafts.ts) to tailor the
 * wording. `RELAY_PLANNER=claude` keeps the original hosted-model path below, unchanged.
 *
 * Either way: only redacted text reaches the engine, the count is capped, and any category
 * outside the request's own needs is dropped.
 */
export async function buildSuggestions(rawText: string, needs: Need[], knownSafety?: SafetyLevel): Promise<TaskSuggestions> {
  const generatedAt = new Date().toISOString();

  if (plannerSetting() !== "claude") {
    try {
      const { planSuggestions } = await import("../planner/adapter");
      const local = await planSuggestions(rawText, needs, knownSafety);
      if (local.items.length) return local;
    } catch (err) {
      console.warn("[planner] local planner unavailable, using templates:", (err as Error).message);
    }
    // The planner is deterministic and offline; if it still produced nothing, never call out.
    return { status: "draft", items: fallbackSuggestions(needs), generatedAt, aiGenerated: false };
  }

  const fallback: TaskSuggestions = { status: "draft", items: fallbackSuggestions(needs), generatedAt, aiGenerated: false };
  if (!llmConfigured()) return fallback;

  try {
    const safe = redactPII(rawText).redactedText.slice(0, 1200);
    const raw = await complete({
      system: SYSTEM,
      user: `Needs recorded at intake: ${needs.map((n) => NEED_LABEL[n]).join(", ") || "unknown"}\n\nRequest (identifiers removed):\n${safe}`,
      temperature: 0.2,
      json: true,
    });
    const parsed = Schema.safeParse(parseJson(raw));
    if (!parsed.success) return fallback;

    const allowed = new Set<string>(needs.length ? needs : NEEDS);
    const seen = new Set<string>();
    const items = parsed.data.tasks
      // The model may only cover needs the intake already recorded.
      .filter((t) => (NEEDS as readonly string[]).includes(t.category) && allowed.has(t.category))
      .filter((t) => {
        const k = t.title.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, SUGGESTION_MAX)
      .map((t) => ({ id: suggestionId(), title: t.title, description: t.description, category: t.category as Need }));

    return items.length ? { status: "draft", items, generatedAt, aiGenerated: true } : fallback;
  } catch {
    return fallback;
  }
}

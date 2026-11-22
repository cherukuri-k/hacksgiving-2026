// Guardrails for the model that tailors the local planner's draft tasks to one request.
//
// The planner decides WHAT has to happen (which needs, which safety steps, in what order).
// A hosted model may only improve the WORDING of the ordinary tasks, and may add a step for a
// need the request already has. Everything here is deterministic and runs after the model:
// nothing the model returns reaches a coordinator without passing these rules. Pure, so it is
// unit-tested without a network (lib/taskRefineRules.test.mts).
import { z } from "zod";
import { redactPII } from "./ai/redact.ts";
import { isLockedStep } from "./missions.ts";
import type { Need, TaskSuggestionItem } from "./types";

export { isLockedStep };

/** The closing step every plan ends with. The model words it many ways ("Confirm the food box arrived and what is still needed"). */
const FOLLOW_UP = /\bfollow[- ]?up\b|\bcheck back\b|\bconfirm (?:with the resident )?(?:what|that|whether)\b|\bconfirm\b.*\b(?:arriv(?:ed|al)|received|reached|came through|still need(?:s|ed)?|unmet|remaining)\b/i;
const isFollowUp = (item: { title: string; description?: string }) => FOLLOW_UP.test(item.title) || /^\s*follow[- ]?up with\b/i.test(item.description ?? "");

/** A draft is a plan, never a report: a title may not claim that anything has already happened. */
const OUTCOME_CLAIM = /\b(secured|restored|guaranteed?|in place|completed|delivered|accepted|approved|arranged|resolved|confirmed|scheduled|booked)\b/i;
/** A step that checks whether something happened ("Confirm the box was delivered") claims nothing. */
const CHECKING = /^\s*(?:confirm|check|ask|follow[- ]?up|verify|find out|see whether)\b/i;
/** Seven or more digits in a row (allowing separators): a phone number. 911, 211 and 988 are fine. */
const PHONE = /\d[\d\s().-]{5,}\d/g;
const digits = (s: string) => s.replace(/\D/g, "");

// Each task is checked on its own, so one over-long description costs that task, not the whole answer.
const ModelOutput = z.object({ tasks: z.array(z.unknown()).min(1).max(12) });
const ModelTask = z.object({
  id: z.string().nullish(),
  title: z.string().trim().min(3).max(110),
  description: z.string().trim().min(3).max(400),
  category: z.string(),
});

export interface RefinementResult {
  items: TaskSuggestionItem[];
  /** Model tasks that were thrown away, with the reason, for the activity log. */
  rejected: string[];
}

/**
 * Merge the model's rewrite into the planner's draft.
 *
 * @param draft    the planner's tasks, in order
 * @param model    the model's parsed JSON, untrusted
 * @param needs    the needs recorded on the request; tasks may only cover these
 * @param grounding text the model was shown (request + playbooks); a phone number must come from it
 * @param max      how many tasks the plan may hold in total
 * @param onDiscard told why, when the whole answer is thrown away
 * @returns the refined list, or null when nothing usable came back and the draft should stand
 */
export function applyRefinement(draft: TaskSuggestionItem[], model: unknown, needs: Need[], grounding: string, max: number, newId: () => string, onDiscard?: (why: string) => void): RefinementResult | null {
  const parsed = ModelOutput.safeParse(model);
  if (!parsed.success) { onDiscard?.("the answer was not a list of tasks"); return null; }

  const locked = draft.filter(isLockedStep);
  const open = draft.filter((d) => !isLockedStep(d));
  const openById = new Map(open.map((d) => [d.id, d]));
  const lockedIds = new Set(locked.map((d) => d.id));
  const allowed = new Set<string>(needs);
  const known = digits(grounding);

  const rejected: string[] = [];
  const seenTitle = new Set(locked.map((d) => d.title.trim().toLowerCase()));
  const usedIds = new Set<string>();
  let accepted: TaskSuggestionItem[] = [];

  for (const rawTask of parsed.data.tasks) {
    const one = ModelTask.safeParse(rawTask);
    if (!one.success) { rejected.push(`a task was malformed or too long (${one.error.issues[0]?.path.join(".") || "shape"})`); continue; }
    const t = one.data;
    const label = `"${t.title}"`;
    if (t.id && lockedIds.has(t.id)) { rejected.push(`${label}: tried to rewrite a locked safety or consent step`); continue; }
    if (isLockedStep(t)) { rejected.push(`${label}: safety and consent steps are written by the planner only`); continue; }

    const named = t.id ? openById.get(t.id) : undefined;
    // A rewrite keeps the category the planner gave it; only a NEW task chooses one, from the request's needs.
    const wanted = t.category.trim().toLowerCase();
    const category = named ? named.category : (allowed.has(wanted) ? (wanted as Need) : null);
    if (!category) { rejected.push(`${label}: "${t.category}" is not a need on this request`); continue; }
    // Splitting one draft task into two steps is fine: the first keeps the id, the second is a new task for the same need.
    const source = named && !usedIds.has(named.id) ? named : undefined;

    const text = `${t.title}\n${t.description}`;
    // A number from the request or a ComForce playbook is a resource, not an identifier. Anything else is.
    const phones = text.match(PHONE) ?? [];
    if (phones.some((p) => digits(p).length >= 7 && !known.includes(digits(p)))) { rejected.push(`${label}: phone number not found in the request or playbooks`); continue; }
    const withoutKnownNumbers = phones.reduce((s, p) => s.replace(p, " "), text);
    if (redactPII(withoutKnownNumbers).redactions.length) { rejected.push(`${label}: contains a name, number or address`); continue; }
    if (OUTCOME_CLAIM.test(t.title) && !CHECKING.test(t.title)) { rejected.push(`${label}: title claims an outcome`); continue; }

    const key = t.title.trim().toLowerCase();
    if (seenTitle.has(key)) { rejected.push(`${label}: duplicate`); continue; }
    seenTitle.add(key);
    if (source) usedIds.add(source.id);
    accepted.push({ id: source?.id ?? newId(), title: t.title.trim(), description: t.description.trim(), category });
  }
  if (!accepted.length) { onDiscard?.(`no task survived the rules: ${rejected.join(" | ")}`); return null; }

  // Every need the planner gave a task to still has one: put the planner's own task back if the model dropped it.
  for (const d of open) {
    if (isFollowUp(d)) continue;
    if (!accepted.some((a) => a.category === d.category && !isFollowUp(a))) accepted.push(d);
  }

  // Exactly one closing follow-up, last. The planner's is restored if the model left it out.
  // When the model wrote more than one, its last is the closing step.
  const followUps = accepted.filter(isFollowUp);
  const plannerFollowUp = open.find(isFollowUp);
  const closing = followUps.at(-1) ?? plannerFollowUp;
  accepted = accepted.filter((a) => !isFollowUp(a));

  // Trim to the cap from the end, never removing a need's only task.
  const room = Math.max(1, max - locked.length - (closing ? 1 : 0));
  while (accepted.length > room) {
    const i = accepted.findLastIndex((a) => accepted.filter((b) => b.category === a.category).length > 1);
    accepted.splice(i >= 0 ? i : accepted.length - 1, 1);
  }

  return { items: [...locked, ...accepted, ...(closing ? [closing] : [])], rejected };
}

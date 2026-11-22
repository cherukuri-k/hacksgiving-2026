// Ask a model what a volunteer's one-sentence update means.
//
// Nothing here writes anything: the volunteer sees what the AI understood and taps "Looks right"
// before a single byte is persisted. The rules that make the output safe (only your own task ids,
// no path to Done, evidence must be real) live in lib/taskRules.ts and are unit-tested there.
import { complete, llmConfigured, parseJson } from "./llm";
import { redactPII } from "./redact";
import { PROPOSED_STATES, validateProposals, type ProposalResult, type TaskForPrompt } from "../taskRules";

export { PROPOSED_STATES, validateProposals, stateForProposal } from "../taskRules";
export type { ProposedState, TaskProposal, ProposalResult, TaskForPrompt } from "../taskRules";

const SYSTEM = `You read one short field update from a community volunteer and say which of THEIR assigned tasks it refers to.

Hard rules:
- Use ONLY the task ids given to you. Never invent an id, a task, a person, a partner or a resource.
- If the update does not clearly match a task, return proposedState "no_change" for that task.
- Copy "evidence" verbatim (a short phrase) from the update. Never paraphrase it.
- Never output a percentage. Never say a task is approved, verified or confirmed.
- "finished_work" means the volunteer finished their part; a human reviews it afterwards.
- Never include a person's name, phone number or address.

STAY INSIDE EACH TASK'S SCOPE. Judge every task only against its own title and description:
- "doneItems": work this task asked for that is now finished.
- "remainingItems": work THIS TASK asked for that is still outstanding.
- "outOfScopeItems": needs the volunteer mentions that THIS task never covered.
- A need the task never covered is ALWAYS outOfScopeItems, never remainingItems.
- "proposedState" reflects this task's own scope only. If everything this task asked for is done,
  say "finished_work" even when the volunteer mentions other needs.

Example - task is "Bring food to the household", update is "delivered the food but they still need clothing":
  doneItems: ["Delivered the food"], remainingItems: [], outOfScopeItems: ["They still need clothing"],
  proposedState: "finished_work"  (the food task is finished; clothing is a separate need)

proposedState must be one of: ${PROPOSED_STATES.join(", ")}.

Return JSON: { "proposals": [ { "taskId": string, "proposedState": string, "doneItems": string[], "remainingItems": string[], "outOfScopeItems": string[], "blockerReason": string|null, "evidence": string } ] }`;

/**
 * With no key configured, returns `usedFallback` so the UI shows the manual picker and the note is
 * still stored. A model failure degrades the same way rather than guessing.
 */
export async function proposeTaskUpdate(updateText: string, tasks: TaskForPrompt[]): Promise<ProposalResult> {
  if (!tasks.length) return { proposals: [], needsManualPick: true, usedFallback: !llmConfigured() };
  if (!llmConfigured()) return { proposals: [], needsManualPick: true, usedFallback: true };

  // Redact before the model sees it, and only ever send the redacted copy.
  const safe = redactPII(updateText).redactedText.slice(0, 800);
  try {
    const raw = await complete({
      system: SYSTEM,
      user: `My tasks:\n${tasks.map((t) => `- id=${t.id} | ${t.title} | ${t.description} | currently ${t.state}`).join("\n")}\n\nMy update:\n"${safe}"`,
      temperature: 0.1,
      json: true,
    });
    return validateProposals(parseJson(raw), tasks, safe);
  } catch {
    return { proposals: [], needsManualPick: true, usedFallback: true };
  }
}

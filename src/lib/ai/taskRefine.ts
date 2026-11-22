// Hybrid drafting: the local planner decides the plan, a hosted model tailors the wording.
//
// The planner (lib/planner) is fast, offline and safe, but its tasks are templates: "Arrange
// youth support" reads the same on every ticket. This step hands the planner's draft, the
// redacted request and ComForce's own playbooks to a model and asks for tasks a coordinator can
// act on without re-reading the request. What the model returns is untrusted: it is merged by
// the deterministic rules in lib/taskRefineRules.ts, and on any failure the draft stands.
import { complete, llmConfigured, llmModel, parseJson } from "./llm";
import { rankPlaybooks } from "./guide";
import { redactPII } from "./redact";
import { applyRefinement, isLockedStep } from "../taskRefineRules";
import { SUGGESTION_MAX, suggestionId } from "../taskRules";
import { type HelpRequest, type Playbook, type TaskSuggestions } from "../types";

const SYSTEM = `You edit draft tasks for Relay MKE, the intake and coordination system of ComForce MKE, a volunteer-run community organization in Milwaukee. A rule-based planner has drafted tasks for one request. Rewrite them so a coordinator can act without re-reading the request.

ComForce's divisions: P.I. Division (intake, documentation, follow-up), Missing Persons Network, Youth Issues / Outreach, Disaster Relief, Rapid / Incident Response, Legal Policy. You may route a task to a division by name.

What good looks like:
- One concrete next action per task, in the order the work should happen.
- Use the facts in the request: household size, ages, dates and deadlines, the neighborhood, what exactly is missing, what has already been tried. Never state a fact that is not in the request.
- Title: 4 to 10 words, starting with a verb such as Confirm, Ask, Request, Refer, Offer, Arrange, Check or Call.
- Description: one or two short sentences, 30 words at most, saying what to do and what to find out. A coordinator reads these in a narrow side panel. Do not end with "Task is complete when".
- The closing follow-up is the planner's last draft task: rewrite that one, keeping its id. Do not write a second one.
- If a ComForce playbook is provided, follow its steps and its order and use the resources it names.
- Replace a vague task ("Arrange youth support", "Coordinate assistance") with what this household needs, keeping its id.
- If a draft task does not fit what happened (asking about an eviction notice when nobody was told to leave), replace it with a step that fits, keeping its id.
- A rewrite stays under the need of the draft it replaces. A legal step rewrites the legal draft, not the rent one.
- Every need listed under "Needs on this request" keeps at least one task. Rewrite a weak task; do not drop it.
- Add a task only for a need listed under "Needs on this request", and only when the draft misses a step that clearly matters.
- Do not ask for what the request already states; ask only for what a helper still needs to know. If a draft task only gathers facts the request already gives, replace it with the next useful action for that need, keeping its id.
- Each task stands on its own: one need, one action. Do not fold a second need into another task's sentence.
- End with exactly one task that follows up with the resident to confirm what arrived and what is still needed.

Hard rules:
- These are drafts and nothing has happened yet. Never say or imply that help is arranged, approved, delivered or guaranteed.
- Never name an organization, program, phone number, law or deadline that is not in the request or the playbook.
- Never include a person's name, phone number or street address. Identifiers were removed; keep it that way.
- Never describe anyone as dangerous or as a suspect. Never tell a volunteer to enter a home, confront anyone or handle a hazard.
- The "Locked steps" are safety and consent steps. Do not rewrite, repeat or contradict them. Your tasks come after them.
- Medical emergency: your first task confirms emergency services were called.

Return JSON: {"tasks":[{"id": the id of the draft task you rewrote, or null for a new task, "title": string, "description": string, "category": one of the lowercase need keys listed under "Needs on this request", copied exactly}]}`;

const TIMEOUT_MS = 20_000;
const timeout = <T,>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("model timed out")), ms))]);

type RequestFacts = Pick<HelpRequest, "redactedText" | "needs" | "summary" | "neighborhood" | "householdSize" | "urgency" | "language" | "safety">;

/** The prompt body. Exported so a test or a reviewer can see exactly what leaves the server. */
export function refinePrompt(draft: TaskSuggestions, req: RequestFacts, playbooks: Pick<Playbook, "title" | "body" | "tags">[]): { user: string; grounding: string } {
  const text = redactPII(req.redactedText).redactedText.slice(0, 1500);
  const books = rankPlaybooks(`${req.summary} ${text}`, playbooks);
  const facts = [
    req.householdSize ? `household of ${req.householdSize}` : null,
    req.neighborhood && req.neighborhood !== "Unknown" ? req.neighborhood : null,
    `urgency ${req.urgency}`,
    req.language && req.language !== "en" ? `resident's language: ${req.language}` : null,
    req.safety ? `flagged: ${req.safety.kind === "missing_person" ? "missing person" : req.safety.level}` : null,
  ].filter(Boolean).join(" · ");
  const locked = draft.items.filter(isLockedStep);
  const open = draft.items.filter((i) => !isLockedStep(i));
  const playbookText = books.map((p) => `## ${p.title}\n${p.body}`).join("\n\n");
  const user = [
    `Needs on this request: ${req.needs.join(", ")}`,
    `Facts: ${facts}`,
    `Request (identifiers removed):\n${text}`,
    locked.length ? `Locked steps (do not change):\n${locked.map((i) => `- ${i.title}`).join("\n")}` : null,
    `Draft tasks to rewrite:\n${open.map((i) => `- id ${i.id} [${i.category}] ${i.title} — ${i.description}`).join("\n")}`,
    draft.followUpQuestions?.length ? `The planner would still ask the resident: ${draft.followUpQuestions.join(" | ")}` : null,
    playbookText ? `ComForce playbook${books.length > 1 ? "s" : ""}:\n${playbookText}` : "No ComForce playbook covers this request.",
  ].filter(Boolean).join("\n\n");
  return { user, grounding: `${text}\n${playbookText}` };
}

/**
 * Tailor a planner draft to its request. Returns the refined suggestions, or null when there is
 * no model, nothing to tailor, or the model's answer did not survive the rules.
 */
export async function refineSuggestions(draft: TaskSuggestions, req: RequestFacts, playbooks: Pick<Playbook, "title" | "body" | "tags">[]): Promise<TaskSuggestions | null> {
  if (!llmConfigured() || draft.status !== "draft" || !draft.items.some((i) => !isLockedStep(i))) return null;
  // A missing person follows a fixed protocol written in lib/planner/adapter.ts. Its order and
  // its hotline number are not a matter of wording, so no model is asked to improve them.
  if (req.safety?.kind === "missing_person") return null;
  const { user, grounding } = refinePrompt(draft, req, playbooks);
  // Room for six tasks with two-sentence descriptions; a cut-off answer is not valid JSON and is discarded whole.
  const raw = (await timeout(complete({ system: SYSTEM, user, temperature: 0.2, json: true, maxTokens: 1800 }), TIMEOUT_MS)) ?? "";
  // A safety step does not spend an ordinary slot, same as the planner's own cap.
  const max = SUGGESTION_MAX + (draft.items.some((i) => isLockedStep(i) && !/consent/i.test(i.title)) ? 1 : 0);
  const merged = applyRefinement(draft.items, parseJson(raw), req.needs, grounding, Math.max(max, draft.items.length), suggestionId,
    (why) => console.warn(`[tasks] model answer discarded, planner draft kept: ${why} · answer began: ${raw.slice(0, 160).replace(/\s+/g, " ")}`));
  if (!merged) return null;
  if (merged.rejected.length) console.warn("[tasks] model suggestions rejected:", merged.rejected.join(" | "));
  return { ...draft, items: merged.items, aiGenerated: true, refinedAt: new Date().toISOString(), refinedBy: llmModel() ?? undefined };
}

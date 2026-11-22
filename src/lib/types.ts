export const STATUSES = ["new", "claimed", "in_progress", "delivered", "verified"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  claimed: "Claimed",
  in_progress: "In progress",
  delivered: "Delivered",
  verified: "Verified",
};

export const NEEDS = [
  "food",
  "rent",
  "utilities",
  "housing",
  "mediation",
  "safety",
  "health",
  "transport",
  "youth",
  "legal",
  "other",
] as const;
export type Need = (typeof NEEDS)[number];

export const NEED_LABEL: Record<Need, string> = {
  food: "Food",
  rent: "Rent",
  utilities: "Utilities",
  housing: "Housing",
  mediation: "Mediation",
  safety: "Safety",
  health: "Health",
  transport: "Transport",
  youth: "Youth",
  legal: "Legal",
  other: "Other",
};

export const URGENCIES = ["low", "normal", "high", "critical"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const CHANNELS = ["sms", "web", "voice", "partner"] as const;
export type Channel = (typeof CHANNELS)[number];

// Names match City of Milwaukee neighborhood polygons (data.milwaukee.gov, Neighborhood Identification Project).
export const NEIGHBORHOODS = [
  "Sherman Park",
  "Harambee",
  "Metcalfe Park",
  "Amani",
  "Riverwest",
  "Clarke Square",
  "Walker's Point",
  "Washington Park",
  "Garden Homes",
  "Bay View",
  "Historic Mitchell Street",
  "Concordia",
  "Silver City",
  "Midtown",
  "Old North Milwaukee",
  "Silver Spring",
  "Hampton Heights",
  "Franklin Heights",
  "Lincoln Creek",
  "Rufus King",
  "Thurston Woods",
  "Roosevelt Grove",
  "Dineen Park",
  "Uptown",
  "Arlington Heights",
  "McGovern Park",
  "Fairfield",
  "North Division",
  "Lincoln Village",
] as const;

export interface Partner {
  id: string;
  name: string;
  needs: Need[];
  neighborhoods: string[];
  capacity: number; // open slots this week
  phone?: string;
  email?: string;
  /** Who picks up the partner's line, e.g. "Front desk" or a first name */
  contactName?: string;
  address?: string;
  /** [lat, lng] of the pickup location (synthetic demo data) */
  coords?: [number, number];
  hours?: string;
  verifiedAt?: string;
  /** ISO 639 codes staff can take a call in, e.g. ["en","es"] or ["hmn","en"] */
  languages?: string[];
  /** True only for real organizations added from public sources. Never contacted for real; dispatch is simulated. */
  isReal?: boolean;
  /** How strong the public evidence of a tie to ComForce is (real organizations only). */
  relationshipTier?: RelationshipTier;
  /** One-sentence relationship to ComForce, from the public sources. */
  relationship?: string;
  /** Public sources for the facts above. */
  evidence?: EvidenceLink[];
  /** Capacity is a demo value, not reported or confirmed by the organization. */
  capacitySimulated?: boolean;
}

export type RelationshipTier = "confirmed_collaborator" | "affiliated" | "supporter" | "ecosystem" | "to_verify";

export interface EvidenceLink {
  title: string;
  url: string;
}

/** Only these tiers may be described as "ComForce partners" in UI copy. */
export function isComForcePartnerTier(tier?: RelationshipTier): boolean {
  return tier === "confirmed_collaborator" || tier === "affiliated";
}

export type ActivityType =
  | "created"
  | "structured"
  | "claimed"
  | "note"
  | "status"
  | "delivered"
  | "verify_sent"
  | "verified"
  | "partial"
  | "reopened"
  | "reassigned"
  | "nudge"
  | "sms_out"
  | "sms_in"
  | "call"
  | "dispatch"
  | "email_out"
  | "safety"
  | "followup_call"
  /**
   * Every task event. Deliberately ONE type: emitting "delivered"/"verified" for a single task
   * would inflate the request-level totals lib/stats.ts and the Impact page count.
   */
  | "task";

export interface ActivityEvent {
  id: string;
  requestId: string;
  at: string;
  actor: string; // display name, "resident", "system" or "ai"
  type: ActivityType;
  text: string;
  /** Set when the event belongs to one task on the ticket (type "task"). */
  taskId?: string;
}

// ---------------------------------------------------------------------------
// Relay Missions — the ticket IS the mission.
// Tasks live on the request, so there is no second request store and the existing snapshot
// keeps the Board, the drawer and the ticket page in sync through the normal 2s poll.
// ---------------------------------------------------------------------------

export const TASK_STATES = [
  "needs_assignment",
  "awaiting_partner",
  "in_progress",
  "in_review",
  "done",
  "needs_followup",
] as const;
export type TaskState = (typeof TASK_STATES)[number];

/** Plain-words labels. "Waiting on <Partner>" is built in the UI from the assignee. */
export const TASK_STATE_LABEL: Record<TaskState, string> = {
  needs_assignment: "Needs assignment",
  awaiting_partner: "Awaiting partner",
  in_progress: "In progress",
  in_review: "Ready for review",
  done: "Done",
  needs_followup: "Needs follow-up",
};

export interface TaskAssignee {
  kind: "person" | "partner";
  /** Partner id, or the person's display name used as a stable demo identity. */
  id: string;
  name: string;
}

export interface TaskNote {
  at: string;
  by: string;
  text: string;
}

/** The volunteer's last confirmed update. Written only after the human taps "Looks right". */
export interface TaskUpdate {
  doneItems: string[];
  /** Still outstanding WITHIN this task's scope. */
  remainingItems: string[];
  /**
   * Needs the volunteer mentioned that this task never covered. Held separately so an unrelated
   * need never makes a finished task look half-done; a coordinator turns these into their own
   * tasks, or dismisses them.
   */
  outOfScopeItems?: string[];
  blocker?: string;
  at: string;
  by: string;
}

/** A coordinator's verdict on an update. The only route to `done`. */
export interface TaskReview {
  outcome: "done" | "partly" | "not_done";
  reason?: string;
  by: string;
  at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  /** Service category, reusing the existing Need vocabulary. */
  category: Need;
  state: TaskState;
  assignee?: TaskAssignee;
  notes: TaskNote[];
  lastUpdate?: TaskUpdate;
  review?: TaskReview;
  /** Partner referral attempts, newest last. A decline is never deleted. */
  handoffs?: { partnerId: string; partnerName: string; status: "pending" | "accepted" | "declined"; at: string; reason?: string }[];
  createdAt: string;
  updatedAt: string;
}

/** One draft the AI prepared at intake. Assigns nobody and changes no ticket status. */
export interface TaskSuggestionItem {
  id: string;
  title: string;
  description: string;
  category: Need;
}

/** How urgently a coordinator should look at the drafts. Mirrors the local planner's own priority. */
export const SUGGESTION_PRIORITIES = ["normal", "time_sensitive", "safety_review"] as const;
export type SuggestionPriority = (typeof SUGGESTION_PRIORITIES)[number];

export interface TaskSuggestions {
  status: "draft" | "approved";
  items: TaskSuggestionItem[];
  /** Set when generated, so suggestions are produced exactly once per request. */
  generatedAt: string;
  /** True when a model wrote them; false when the deterministic fallback did. */
  aiGenerated: boolean;

  // ---- Local planner extras. All optional: tickets drafted by the Claude path or the
  // deterministic fallback simply leave them unset and behave exactly as before. ----

  /** Which engine drafted these, e.g. "relay-local-planner/1". Absent for the Claude path. */
  engine?: string;
  /** Planner's read on urgency. Advisory only: it never changes the ticket's status or urgency. */
  priority?: SuggestionPriority;
  /**
   * Needs the planner noticed that are NOT on the request. Shown to coordinators as a hint so they
   * can add the need themselves. Never turned into tasks — that is the Missions rule.
   */
  possibleExtraNeeds?: { label: string; confidence: number }[];
  /** What a coordinator should still ask the resident. */
  followUpQuestions?: string[];
  /**
   * Why the planner read the situation the way it did (hazards, deadlines, third-party caller).
   * Crisis detail is deliberately withheld from task cards, so this is the audit trail.
   */
  signalNotes?: string[];
  /** Closest approved past cases, for context only. */
  similarCases?: { id: string; theme: string; similarity: number }[];
  /** The planner's self-check. `passed: false` means a coordinator should read the drafts closely. */
  check?: { passed: boolean; issues: string[] };
  /** Set when a task must wait for a coordinator to clear the ticket (crisis or hazard). */
  heldForCoordinator?: boolean;
  /**
   * What the planner's OWN signals read, independent of lib/safety.ts. Lets intake flag a ticket
   * the keyword screen missed: either side raising a flag wins.
   */
  plannerSafety?: SafetyLevel;

  // ---- Hybrid mode: a hosted model tailored the planner's wording to this request. ----

  /** When the model's rewrite was applied. Absent while the planner's own wording stands. */
  refinedAt?: string;
  /** Which model did it, e.g. "claude-haiku-4-5". */
  refinedBy?: string;
}

export interface HelpRequest {
  id: string;
  shortCode: string; // e.g. R-4F2K, used in SMS
  createdAt: string;
  updatedAt: string;
  status: Status;
  channel: Channel;
  /** Raw message after PII redaction. The original never leaves the intake boundary. */
  redactedText: string;
  summary: string;
  needs: Need[];
  urgency: Urgency;
  neighborhood: string;
  householdSize?: number;
  language?: string;
  consentToShare: boolean;
  ownerName?: string;
  ownerOrg?: string;
  partnerId?: string;
  deliveredAt?: string;
  verifiedAt?: string;
  residentFeedback?: "yes" | "no" | "partial";
  /** ComForce-tier only. Never sent to the AI or shown on the board. */
  contactRef?: string;
  /** Phone-call intake (ElevenLabs agent). Transcript is redacted before storage. */
  call?: CallRecord;
  /** Handoff to a partner: Jordan calls + emails them, records their answer, then the volunteer gets a route. */
  dispatch?: Dispatch;
  /** Set when the resident described risk to themselves or others. Jordan shares crisis resources and the ComForce lead is paged. */
  safety?: SafetyFlag;
  /** After delivery: if the resident doesn't answer the "did it arrive?" text, Jordan calls them back in their language. */
  followUp?: FollowUp;
  /** Approved tasks for this ticket. Absent on legacy tickets, which behave exactly as before. */
  tasks?: Task[];
  /** AI drafts awaiting a coordinator. Present once generated, whatever the outcome. */
  taskSuggestions?: TaskSuggestions;
}

export type SafetyLevel = "concern" | "crisis";
export interface SafetyFlag {
  level: SafetyLevel;
  /** Set for a missing child or adult: the card says so and the resident is pointed to 911, not a crisis line. */
  kind?: "missing_person";
  /** ComForce-tier only: Jordan's one-line note on what was said (already redacted). */
  note?: string;
  /** Resource names Jordan shared on the call, e.g. "988", "211", "Sojourner" */
  resourcesShared: string[];
  at: string;
  leadPagedAt?: string;
}

export type FollowUpStatus = "waiting_sms" | "calling" | "answered" | "confirmed" | "partial" | "reopened" | "no_answer";
export interface FollowUp {
  status: FollowUpStatus;
  /** "live": Jordan rings the resident's phone (/phone) and a real ElevenLabs conversation runs when they answer. "sim": scripted. */
  mode?: "live" | "sim";
  /** Language the callback is made in */
  language: string;
  startedAt: string;
  answeredAt?: string;
  call?: CallRecord;
  /** The resident answered on a live call that is still going: the written receipt is held until they hang up. */
  closingTextPending?: "1" | "2" | "3";
}

export const LANGUAGE_LABEL: Record<string, string> = { en: "English", es: "Español", hmn: "Hmoob · Hmong", other: "Other" };

export type DispatchStatus = "calling" | "accepted" | "declined" | "no_answer" | "ready" | "picked_up";

export interface Dispatch {
  partnerId: string;
  status: DispatchStatus;
  startedAt: string;
  /** live = real outbound phone call via ElevenLabs+Twilio; simulated = partner answers on the /partner-line page */
  mode: "live" | "simulated";
  conversationId?: string;
  answeredAt?: string;
  outcome?: { accepted: boolean; readyBy?: string; notes?: string; contactName?: string; at: string };
  call?: CallRecord;
  emailSentAt?: string;
  emailMocked?: boolean;
  readyAt?: string;
  pickedUpAt?: string;
}

export interface CallTurn {
  role: "agent" | "caller";
  text: string;
  /** seconds into the call */
  t: number;
}

export interface CallRecord {
  conversationId: string;
  durationSec?: number;
  /** Written by the second LLM after the call: 2-3 sentence, name-free summary */
  summary?: string;
  transcript: CallTurn[];
  endedAt?: string;
}

export interface Playbook {
  id: string;
  title: string;
  tags: Need[];
  body: string;
  updatedAt: string;
}

export interface StructuredIntake {
  redactedText: string;
  summary: string;
  needs: Need[];
  urgency: Urgency;
  neighborhood: string;
  householdSize?: number;
  language?: string;
  redactions: { kind: "name" | "phone" | "address" | "email" | "other"; placeholder: string }[];
  /** Whether the LLM produced these fields or the keyword rules did */
  source?: "llm" | "rules";
  safety?: SafetyLevel;
}

export interface Snapshot {
  requests: HelpRequest[];
  partners: Partner[];
  activity: ActivityEvent[];
  generatedAt: string;
}

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
  | "followup_call";

export interface ActivityEvent {
  id: string;
  requestId: string;
  at: string;
  actor: string; // display name, "resident", "system" or "ai"
  type: ActivityType;
  text: string;
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

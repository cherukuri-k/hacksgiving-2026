import type { ActivityEvent, ActivityType, HelpRequest, Partner, Playbook, Snapshot, Status } from "../types";

export interface Store {
  snapshot(): Promise<Snapshot>;
  getRequest(id: string): Promise<HelpRequest | undefined>;
  findByShortCode(code: string): Promise<HelpRequest | undefined>;
  createRequest(req: HelpRequest, events: Omit<ActivityEvent, "id" | "requestId">[]): Promise<HelpRequest>;
  updateRequest(id: string, patch: Partial<HelpRequest>, event?: { actor: string; type: ActivityType; text: string; taskId?: string }): Promise<HelpRequest | undefined>;
  listActivity(requestId: string): Promise<ActivityEvent[]>;
  listPartners(): Promise<Partner[]>;
  listPlaybooks(): Promise<Playbook[]>;
  reset(): Promise<void>;
}

export const nextStatus: Record<Status, Status | null> = {
  new: "claimed",
  claimed: "in_progress",
  in_progress: "delivered",
  delivered: "verified",
  verified: null,
};

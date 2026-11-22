import type { ActivityEvent, ActivityType, HelpRequest, Partner, Playbook, Snapshot, Status } from "../types";

export interface Store {
  snapshot(): Promise<Snapshot>;
  getRequest(id: string): Promise<HelpRequest | undefined>;
  findByShortCode(code: string): Promise<HelpRequest | undefined>;
  createRequest(req: HelpRequest, events: Omit<ActivityEvent, "id" | "requestId">[]): Promise<HelpRequest>;
  updateRequest(id: string, patch: Partial<HelpRequest>, event?: { actor: string; type: ActivityType; text: string; taskId?: string }): Promise<HelpRequest | undefined>;
  /**
   * Attach data Relay derived on its own (draft tasks, their tailored wording). Same as
   * updateRequest except `updatedAt` does not move: a ticket nobody has worked on must not look
   * freshly touched in the Table view because the planner drafted tasks for it.
   */
  annotateRequest(id: string, patch: Partial<HelpRequest>, event?: { actor: string; type: ActivityType; text: string }): Promise<HelpRequest | undefined>;
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

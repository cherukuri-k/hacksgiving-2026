import type { ActivityEvent, HelpRequest, Snapshot } from "../types";
import { SEED_PARTNERS, SEED_PLAYBOOKS, buildSeed } from "./seed";
import type { Store } from "./store";

interface MemState {
  requests: Map<string, HelpRequest>;
  activity: ActivityEvent[];
}

function fresh(): MemState {
  const { requests, activity } = buildSeed();
  return { requests: new Map(requests.map((r) => [r.id, r])), activity };
}

// Survives Next.js hot reloads in dev so the demo state is not wiped on every edit.
const g = globalThis as unknown as { __relayMem?: MemState };
function state(): MemState {
  if (!g.__relayMem) g.__relayMem = fresh();
  return g.__relayMem;
}

let counter = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export const memoryStore: Store = {
  async snapshot(): Promise<Snapshot> {
    const s = state();
    return {
      requests: [...s.requests.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      partners: SEED_PARTNERS,
      activity: s.activity,
      generatedAt: new Date().toISOString(),
    };
  },
  async getRequest(id) {
    return state().requests.get(id);
  },
  async findByShortCode(code) {
    const c = code.trim().toUpperCase();
    return [...state().requests.values()].find((r) => r.shortCode === c);
  },
  async createRequest(req, events) {
    const s = state();
    s.requests.set(req.id, req);
    for (const e of events) s.activity.push({ ...e, id: newId("ev"), requestId: req.id });
    return req;
  },
  async updateRequest(id, patch, event) {
    const s = state();
    const cur = s.requests.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    s.requests.set(id, next);
    if (event) s.activity.push({ ...event, id: newId("ev"), requestId: id, at: next.updatedAt });
    return next;
  },
  async annotateRequest(id, patch, event) {
    const s = state();
    const cur = s.requests.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch, updatedAt: cur.updatedAt };
    s.requests.set(id, next);
    if (event) s.activity.push({ ...event, id: newId("ev"), requestId: id, at: new Date().toISOString() });
    return next;
  },
  async listActivity(requestId) {
    return state().activity.filter((a) => a.requestId === requestId).sort((a, b) => a.at.localeCompare(b.at));
  },
  async listPartners() {
    return SEED_PARTNERS;
  },
  async listPlaybooks() {
    return SEED_PLAYBOOKS;
  },
  async reset() {
    g.__relayMem = fresh();
  },
};

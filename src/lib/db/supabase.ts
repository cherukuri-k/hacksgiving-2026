import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ActivityEvent, HelpRequest, Partner, Playbook, Snapshot } from "../types";
import { REAL_PARTNERS, SEED_PARTNERS, SEED_PLAYBOOKS, buildSeed } from "./seed";
import type { Store } from "./store";

/**
 * Supabase-backed store. Tables hold a `data` jsonb column plus a few indexed scalars
 * so the schema stays trivial for a weekend build (see supabase/schema.sql).
 */
export function makeSupabaseStore(url: string, serviceKey: string): Store {
  const sb: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });

  const rows = <T>(r: { data: unknown; error: { message: string } | null }): T[] => {
    if (r.error) throw new Error(r.error.message);
    return ((r.data as { data: T }[]) ?? []).map((x) => x.data);
  };

  const store: Store = {
    async snapshot(): Promise<Snapshot> {
      const [req, act, partners] = await Promise.all([
        sb.from("requests").select("data").order("created_at", { ascending: false }),
        sb.from("activity").select("data").order("at", { ascending: true }),
        store.listPartners(),
      ]);
      return { requests: rows<HelpRequest>(req), activity: rows<ActivityEvent>(act), partners, generatedAt: new Date().toISOString() };
    },
    async getRequest(id) {
      const r = await sb.from("requests").select("data").eq("id", id).maybeSingle();
      return (r.data?.data as HelpRequest) ?? undefined;
    },
    async findByShortCode(code) {
      const r = await sb.from("requests").select("data").eq("short_code", code.trim().toUpperCase()).maybeSingle();
      return (r.data?.data as HelpRequest) ?? undefined;
    },
    async createRequest(req, events) {
      const { error } = await sb.from("requests").insert({ id: req.id, short_code: req.shortCode, status: req.status, created_at: req.createdAt, data: req });
      if (error) throw new Error(error.message);
      if (events.length) {
        const evs = events.map((e, i) => ({ id: `${req.id}-${Date.now()}-${i}`, request_id: req.id, at: e.at, data: { ...e, id: `${req.id}-${Date.now()}-${i}`, requestId: req.id } }));
        await sb.from("activity").insert(evs);
      }
      return req;
    },
    async updateRequest(id, patch, event) {
      const cur = await store.getRequest(id);
      if (!cur) return undefined;
      const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
      const { error } = await sb.from("requests").update({ status: next.status, data: next }).eq("id", id);
      if (error) throw new Error(error.message);
      if (event) {
        const evId = `${id}-${Date.now()}`;
        await sb.from("activity").insert({ id: evId, request_id: id, at: next.updatedAt, data: { ...event, id: evId, requestId: id, at: next.updatedAt } });
      }
      return next;
    },
    async annotateRequest(id, patch, event) {
      const cur = await store.getRequest(id);
      if (!cur) return undefined;
      const next = { ...cur, ...patch, updatedAt: cur.updatedAt };
      const { error } = await sb.from("requests").update({ status: next.status, data: next }).eq("id", id);
      if (error) throw new Error(error.message);
      if (event) {
        const at = new Date().toISOString();
        const evId = `${id}-${Date.now()}`;
        await sb.from("activity").insert({ id: evId, request_id: id, at, data: { ...event, id: evId, requestId: id, at } });
      }
      return next;
    },
    async listActivity(requestId) {
      return rows<ActivityEvent>(await sb.from("activity").select("data").eq("request_id", requestId).order("at"));
    },
    async listPartners() {
      const r = await sb.from("partners").select("data");
      const p = rows<Partner>(r);
      if (!p.length) return SEED_PARTNERS;
      // A partner list saved before the real organizations were added: merge them in, no reset needed.
      const missing = REAL_PARTNERS.filter((rp) => !p.some((x) => x.id === rp.id));
      if (missing.length) await sb.from("partners").upsert(missing.map((x) => ({ id: x.id, data: x })));
      // Real-organization facts always come from the source-linked seed, never a stale saved copy.
      return [...REAL_PARTNERS, ...p.filter((x) => !REAL_PARTNERS.some((rp) => rp.id === x.id))];
    },
    async listPlaybooks() {
      const r = await sb.from("playbooks").select("data");
      const p = rows<Playbook>(r);
      return p.length ? p : SEED_PLAYBOOKS;
    },
    async reset() {
      await sb.from("activity").delete().neq("id", "");
      await sb.from("requests").delete().neq("id", "");
      await sb.from("partners").delete().neq("id", "");
      await sb.from("playbooks").delete().neq("id", "");
      const { requests, activity } = buildSeed();
      await sb.from("requests").insert(requests.map((r) => ({ id: r.id, short_code: r.shortCode, status: r.status, created_at: r.createdAt, data: r })));
      await sb.from("activity").insert(activity.map((a) => ({ id: a.id, request_id: a.requestId, at: a.at, data: a })));
      await sb.from("partners").insert(SEED_PARTNERS.map((p) => ({ id: p.id, data: p })));
      await sb.from("playbooks").insert(SEED_PLAYBOOKS.map((p) => ({ id: p.id, data: p })));
    },
  };
  return store;
}

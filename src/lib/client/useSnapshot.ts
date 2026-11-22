"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityEvent, HelpRequest, Partner } from "../types";
import type { Attention } from "../attention";

export type SafeRequest = Omit<HelpRequest, "contactRef"> & { hasContact: boolean; attention: Attention };
export interface SnapshotData {
  requests: SafeRequest[];
  partners: Partner[];
  activity: ActivityEvent[];
  generatedAt: string;
  storeKind: "memory" | "supabase";
  /** True when a hosted model tailors the planner's draft tasks (hybrid drafting). */
  tailorsTasks?: boolean;
}

/** Polls /api/snapshot. Simple, works on every host, and 2s is instant enough for a live demo. */
export function useSnapshot(intervalMs = 2000) {
  const [data, setData] = useState<SnapshotData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/snapshot", { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status}`);
      const j: SnapshotData = await r.json();
      const ids = new Set(j.requests.map((x) => x.id));
      if (seen.current) {
        const newly = [...ids].filter((id) => !seen.current!.has(id));
        if (newly.length) {
          setFresh(new Set(newly));
          setTimeout(() => setFresh(new Set()), 6000);
        }
      }
      seen.current = ids;
      setData(j);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, intervalMs);
    return () => clearInterval(t);
  }, [load, intervalMs]);

  return { data, error, reload: load, fresh };
}

export async function act(id: string, body: Record<string, unknown>) {
  const r = await fetch(`/api/requests/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

import { NextResponse } from "next/server";
import { db, storeKind } from "@/lib/db";
import { evaluateAttention } from "@/lib/attention";
import { ensureDraftsForOpenRequests } from "@/lib/taskDrafts";
import { plannerSetting } from "@/lib/ai/taskSuggest";
import type { ActivityEvent } from "@/lib/types";


export async function GET() {
  let snap = await db.snapshot();
  // Every open ticket carries draft tasks, so the board never asks anyone to generate them.
  if (await ensureDraftsForOpenRequests(snap.requests)) snap = await db.snapshot();
  const now = Date.now();
  // Group every request's activity once so attention is O(events), not O(requests * events).
  const eventsByRequest = new Map<string, ActivityEvent[]>();
  for (const e of snap.activity) {
    const list = eventsByRequest.get(e.requestId);
    if (list) list.push(e);
    else eventsByRequest.set(e.requestId, [e]);
  }
  // Strip the ComForce-only tier before anything leaves the server, and attach the
  // server-computed attention verdict so every screen agrees on what is overdue.
  const requests = snap.requests.map(({ contactRef, ...r }) => ({
    ...r,
    hasContact: Boolean(contactRef),
    attention: evaluateAttention(r, eventsByRequest.get(r.id) ?? [], now),
  }));
  return NextResponse.json({ ...snap, requests, storeKind, tailorsTasks: plannerSetting() === "hybrid" });
}

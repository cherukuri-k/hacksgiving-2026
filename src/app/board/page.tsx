"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCcw, Search, LayoutGrid, Table2, AlertTriangle } from "lucide-react";
import { AppShell, Btn, useClock } from "@/components/AppShell";
import { Board } from "@/components/board/Board";
import { RequestTable } from "@/components/board/RequestTable";
import { RequestDrawer } from "@/components/board/RequestDrawer";
import { useSnapshot } from "@/lib/client/useSnapshot";
import { useMe } from "@/lib/client/me";
import { compareAttention } from "@/lib/attention";
import { NEED_LABEL, NEIGHBORHOODS, type Need } from "@/lib/types";

export default function BoardPage() {
  const { data, fresh, reload } = useSnapshot();
  const [me] = useMe();
  const [openId, setOpenId] = useState<string | null>(null);
  const [need, setNeed] = useState<Need | "all">("all");
  const [q, setQ] = useState("");
  const [hood, setHood] = useState("all");
  const [urg, setUrg] = useState("all");
  const [status, setStatus] = useState("all");
  const [attnOnly, setAttnOnly] = useState(false);
  const [view, setView] = useState<"board" | "table">("board");
  const now = useClock();

  // Deep links from the top bar: /board?q=…&status=new
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("q")) setQ(sp.get("q")!);
    if (sp.get("status")) setStatus(sp.get("status")!);
    if (sp.get("view") === "table") setView("table");
  }, []);

  const all = data?.requests ?? [];
  const needCounts = useMemo(() => all.reduce<Record<string, number>>((a, r) => { r.needs.forEach((n) => (a[n] = (a[n] ?? 0) + 1)); return a; }, {}), [all]);
  const topNeeds = Object.entries(needCounts).sort((a, b) => b[1] - a[1]).slice(0, 4) as [Need, number][];

  const filtered = all
    .filter((r) =>
      (need === "all" || r.needs.includes(need)) &&
      (hood === "all" || r.neighborhood === hood) &&
      (urg === "all" || r.urgency === urg) &&
      (status === "all" || r.status === status) &&
      (!attnOnly || r.attention.level !== "none") &&
      (!q || `${r.summary} ${r.redactedText} ${r.neighborhood} ${r.shortCode}`.toLowerCase().includes(q.toLowerCase()))
    )
    // Flagged requests float to the top (most urgent first); the kanban keeps this order
    // inside each status column. compareAttention returns 0 for two unflagged requests,
    // so they keep the snapshot's newest-first order.
    .sort((a, b) => compareAttention(a, b, now));
  const open = all.find((r) => r.id === openId) ?? null;
  const unclaimed = all.filter((r) => r.status === "new").length;
  const overdue = all.filter((r) => r.attention.level === "needs_attention").length;
  const followup = all.filter((r) => r.attention.level === "follow_up").length;

  return (
    <AppShell
      title="ComForce MKE"
      badge={unclaimed}
      me={me.name}
      actions={<>
        <Btn href="/r" variant="solid"><Plus size={15} /> New Request</Btn>
        <span className="seg">
          <button onClick={() => setView("board")} className={`seg-item ${view === "board" ? "active-blue" : ""}`}><LayoutGrid size={13} /> Board</button>
          <button onClick={() => setView("table")} className={`seg-item ${view === "table" ? "active-blue" : ""}`}><Table2 size={13} /> Table</button>
        </span>
        <Btn onClick={async () => { await fetch("/api/reset", { method: "POST" }); reload(); }} title="Reset demo data" ariaLabel="Reset demo data" className="w-[38px] !px-0"><RefreshCcw size={15} /></Btn>
      </>}
    >
      <div className="seg">
        <button onClick={() => setNeed("all")} className={`seg-item ${need === "all" ? "active-blue" : ""}`}>All Needs <span className="count">{all.length}</span></button>
        {topNeeds.map(([n, c]) => <button key={n} onClick={() => setNeed(n)} className={`seg-item ${need === n ? "active-blue" : ""}`}>{NEED_LABEL[n]} <span className="count">{c}</span></button>)}
      </div>

      <div className="mt-3 card flex items-center gap-2.5 p-2.5">
        <div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} className="input" placeholder="Search requests, neighborhoods, codes..." /></div>
        <select value={hood} onChange={(e) => setHood(e.target.value)} className="select"><option value="all">All Neighborhoods</option>{NEIGHBORHOODS.map((h) => <option key={h}>{h}</option>)}</select>
        <select value={urg} onChange={(e) => setUrg(e.target.value)} className="select"><option value="all">All Urgencies</option><option value="critical">Critical</option><option value="high">Urgent</option><option value="normal">Normal</option><option value="low">Low</option></select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="select"><option value="all">All Statuses</option><option value="new">Unclaimed</option><option value="claimed">Claimed</option><option value="in_progress">In progress</option><option value="delivered">Delivered</option><option value="verified">Verified</option></select>
        <button onClick={() => setAttnOnly((v) => !v)} aria-pressed={attnOnly} className={`inline-flex h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[13px] font-medium ${attnOnly ? "border-[#f0a3a3] bg-red-soft text-red" : "border-line bg-surface text-ink-2 hover:bg-surface-2"}`}><AlertTriangle size={14} /> Needs attention only{(overdue + followup) > 0 && <span className="count !bg-red">{overdue + followup}</span>}</button>
      </div>

      <div className="mt-4 overflow-x-auto pb-2">
        {data && (view === "board" ? <Board requests={filtered} fresh={fresh} onOpen={setOpenId} now={now} /> : <RequestTable requests={filtered} onOpen={setOpenId} now={now} />)}
      </div>
      <RequestDrawer request={open} partners={data?.partners ?? []} onClose={() => setOpenId(null)} me={me} tailorsTasks={data?.tailorsTasks ?? false} onChanged={reload} />
    </AppShell>
  );
}

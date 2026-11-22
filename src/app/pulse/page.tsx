"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { AppShell, Btn, useClock } from "@/components/AppShell";
import { SectionCard } from "@/components/ui/StatCard";
import { useSnapshot } from "@/lib/client/useSnapshot";
import { useMe } from "@/lib/client/me";
import { timeAgo } from "@/lib/stats";
import { NEED_LABEL, type Need } from "@/lib/types";

const PulseMap = dynamic(() => import("@/components/board/PulseMap"), { ssr: false, loading: () => <div className="h-full w-full bg-surface-2 rounded-[10px]" /> });

const needsText = (needs: Need[]) => needs.map((n) => NEED_LABEL[n]).join(" · ");
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

function Figure({ label, value, sub, tone = "text-ink" }: { label: string; value: React.ReactNode; sub: string; tone?: string }) {
  return (
    <div className="px-5 py-4">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={`num mt-1.5 text-[28px] font-semibold leading-none tracking-tight ${tone}`}>{value}</div>
      <div className="mt-1.5 text-[12px] text-muted">{sub}</div>
    </div>
  );
}

export default function PulsePage() {
  const { data } = useSnapshot();
  const [me] = useMe();
  const now = useClock();
  const [selected, setSelected] = useState<string | null>(null);
  const requests = data?.requests ?? [];
  const unclaimed = requests.filter((r) => r.status === "new").length;

  const rows = useMemo(() => {
    const m = new Map<string, { open: number; total: number; critical: number; needs: Map<Need, number>; last: string }>();
    for (const r of requests) {
      if (r.neighborhood === "Unknown") continue;
      const h = m.get(r.neighborhood) ?? { open: 0, total: 0, critical: 0, needs: new Map(), last: r.createdAt };
      h.total++;
      if (r.status !== "verified") h.open++;
      if (r.urgency === "critical") h.critical++;
      r.needs.forEach((n) => h.needs.set(n, (h.needs.get(n) ?? 0) + 1));
      if (r.createdAt > h.last) h.last = r.createdAt;
      m.set(r.neighborhood, h);
    }
    return [...m.entries()]
      .map(([neighborhood, v]) => ({ neighborhood, ...v, topNeeds: [...v.needs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n) }))
      .sort((a, b) => b.open - a.open || b.total - a.total);
  }, [requests]);

  const topNeed = useMemo(() => {
    const m = new Map<Need, number>();
    requests.forEach((r) => r.needs.forEach((n) => m.set(n, (m.get(n) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [requests]);
  const last24 = requests.filter((r) => now && now - new Date(r.createdAt).getTime() < 86_400_000).length;
  const hotspots = rows.filter((r) => r.critical > 0).length;
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));
  const sel = rows.find((r) => r.neighborhood === selected) ?? rows[0];
  const selReqs = sel ? requests.filter((r) => r.neighborhood === sel.neighborhood).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];

  // Plain counts from the board, each with the one fact a coordinator would want next to it.
  const notes = useMemo(() => {
    const out: { n: number; head: string; detail: string; tone?: string }[] = [];
    const partners = data?.partners ?? [];
    const slots = (need: Need) => {
      // Real organizations carry a made-up demo capacity; never state it as a fact about them.
      const p = partners.filter((x) => x.needs.includes(need) && x.capacity > 0 && !x.capacitySimulated).sort((a, b) => b.capacity - a.capacity)[0];
      return p ? `${p.name} has ${p.capacity} open ${plural(p.capacity, "slot")} this week.` : "No partner has open slots for this right now.";
    };
    const hot = rows.filter((r) => r.critical > 0);
    if (hot.length) out.push({ n: hot.length, head: `${plural(hot.length, "neighborhood")} with a critical request`, detail: `${hot.map((r) => r.neighborhood).join(", ")}.`, tone: "text-red" });
    const food = requests.filter((r) => r.needs.includes("food") && r.status === "new").length;
    if (food) out.push({ n: food, head: `food ${plural(food, "request")} nobody has claimed yet`, detail: slots("food") });
    const med = requests.filter((r) => r.needs.includes("mediation") && r.status !== "verified");
    if (med.length) {
      const where = [...new Set(med.map((r) => r.neighborhood))].filter((h) => h !== "Unknown").slice(0, 3);
      out.push({ n: med.length, head: `open mediation ${plural(med.length, "request")}`, detail: `${where.length ? `In ${where.join(", ")}. ` : ""}${slots("mediation")}` });
    }
    const utilities = requests.filter((r) => r.needs.includes("utilities")).length;
    if (utilities >= 2) out.push({ n: utilities, head: "utility shutoff requests", detail: "Worth sending partners a reminder about the winter shutoff moratorium." });
    return out;
  }, [requests, rows, data?.partners]);

  return (
    <AppShell
      title="Neighborhood Pulse"
      subtitle="Where help is being asked for, by neighborhood and need. Counts only: never names, never addresses."
      badge={unclaimed}
      me={me.name}
      actions={<><Btn variant="solid" onClick={() => window.print()} title="Print or save this page as a PDF"><Download size={15} /> Weekly brief (PDF)</Btn><Btn href="/impact">Full report</Btn></>}
    >
      <div className="card mb-3.5 grid grid-cols-5 divide-x divide-line">
        <Figure label="Neighborhoods active" value={rows.length} sub="with at least one request" />
        <Figure label="Open requests" value={rows.reduce((s, r) => s + r.open, 0)} sub="not yet confirmed by the resident" />
        <Figure label="New in 24 hours" value={last24} sub="phone, text and web" />
        <Figure label="Hotspots" value={hotspots} sub="neighborhoods with a critical request" tone={hotspots ? "text-red" : "text-ink"} />
        <Figure label="Top need citywide" value={topNeed ? NEED_LABEL[topNeed] : "—"} sub="by number of requests" />
      </div>

      <div className="grid grid-cols-3 gap-3.5 mb-3.5">
        <SectionCard title="Where requests are coming from" className="col-span-2" action={
          <span className="flex items-center gap-4 text-[11.5px] text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand" /> Requests</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red" /> Includes a critical request</span>
            <span>Size = all requests · number = still open</span>
          </span>}>
          <div className="h-[420px] p-2"><PulseMap rows={rows} selected={sel?.neighborhood ?? null} onSelect={setSelected} /></div>
        </SectionCard>

        <SectionCard title="Open requests by neighborhood" action={<span className="text-[11.5px] text-muted">open / all</span>}>
          <ol className="max-h-[436px] divide-y divide-line overflow-auto">
            {rows.map((r, i) => {
              const on = sel?.neighborhood === r.neighborhood;
              return (
                <li key={r.neighborhood}>
                  <button onClick={() => setSelected(r.neighborhood)} aria-pressed={on} className={`grid w-full grid-cols-[18px_1fr_72px_44px] items-center gap-x-3 px-4 py-2.5 text-left hover:bg-surface-2 ${on ? "bg-surface-2" : ""}`}>
                    <span className="num text-[11.5px] text-muted">{i + 1}</span>
                    <span className="min-w-0">
                      <span className={`block truncate text-[13px] ${on ? "font-semibold" : "font-medium"}`}>{r.neighborhood}</span>
                      <span className="block truncate text-[11.5px] text-muted">{r.critical > 0 && <span className="font-medium text-red">{r.critical} critical · </span>}{needsText(r.topNeeds)}</span>
                    </span>
                    <span className="block" title={`${r.open} open of ${r.total}`}>
                      <span className="flex h-1.5 overflow-hidden rounded-full bg-surface-3" style={{ width: `${Math.max(14, (r.total / maxTotal) * 100)}%` }}>
                        <span className="bg-ink" style={{ width: `${(r.open / r.total) * 100}%` }} />
                      </span>
                    </span>
                    <span className="num text-right text-[13px]"><b className="font-semibold">{r.open}</b><span className="text-muted"> / {r.total}</span></span>
                  </button>
                </li>
              );
            })}
          </ol>
        </SectionCard>
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        <SectionCard title="This week" action={<span className="text-[11.5px] text-muted">counted from the board</span>}>
          <ul className="divide-y divide-line">
            {notes.map((s) => (
              <li key={s.head} className="grid grid-cols-[40px_1fr] gap-x-3 px-4 py-3">
                <span className={`num text-[24px] font-semibold leading-none tracking-tight ${s.tone ?? "text-ink"}`}>{s.n}</span>
                <span>
                  <span className="block text-[13px] font-medium">{s.head}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{s.detail}</span>
                </span>
              </li>
            ))}
            {!notes.length && <li className="px-4 py-3 text-[13px] text-muted">Nothing unusual this week.</li>}
          </ul>
        </SectionCard>

        <SectionCard title={sel ? `${sel.neighborhood}: recent requests` : "Select a neighborhood"} className="col-span-2" action={sel && <span className="num text-[11.5px] text-muted">{sel.open} open of {sel.total}</span>}>
          <ul className="divide-y divide-line">
            {selReqs.slice(0, 6).map((r) => (
              <li key={r.id} className="grid grid-cols-[56px_1fr_auto_64px] items-baseline gap-x-4 px-4 py-2.5 text-[13px]">
                <span className={`text-[11.5px] font-medium capitalize ${r.urgency === "critical" ? "text-red" : r.urgency === "high" ? "text-ink" : "text-muted"}`}>{r.urgency}</span>
                <span className="truncate">{r.summary}</span>
                <span className="text-[12px] text-muted">{needsText(r.needs.slice(0, 2))}</span>
                <span className="num text-right text-[11.5px] text-muted">{timeAgo(r.createdAt, now)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </AppShell>
  );
}

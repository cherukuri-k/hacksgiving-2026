"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, Plus } from "lucide-react";
import { AppShell, Btn } from "@/components/AppShell";
import { Figure, SectionCard } from "@/components/ui/StatCard";
import { useSnapshot } from "@/lib/client/useSnapshot";
import { useMe } from "@/lib/client/me";
import { NEED_LABEL, type Need, type Playbook } from "@/lib/types";

const SUGGESTED = ["What do I do if a neighbor dispute mentions a weapon?", "Can We Energies shut off heat in November?", "A tenant got a 5-day notice, what's the first step?", "Family displaced by fire tonight, who do I call first?"];

const needsText = (needs: Need[]) => needs.map((n) => NEED_LABEL[n]).join(" · ");
/** Playbook dates are plain "YYYY-MM-DD"; build the date locally so it never slips a day across time zones. */
const day = (iso: string, withYear = false) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
};

export default function GuidePage() {
  const { data } = useSnapshot(5000);
  const [me] = useMe();
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<Need | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState<{ role: "you" | "guide"; text: string; sources?: string[] }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/playbooks").then((r) => r.json()).then((j) => { setPlaybooks(j.playbooks); setOpenId(j.playbooks[0]?.id ?? null); });
  }, []);

  const tags = useMemo(() => [...new Set(playbooks.flatMap((p) => p.tags))], [playbooks]);
  const list = playbooks.filter((p) => tag === "all" || p.tags.includes(tag)).filter((p) => !q || (p.title + p.body).toLowerCase().includes(q.toLowerCase()));
  const open = playbooks.find((p) => p.id === openId) ?? list[0];
  const unclaimed = (data?.requests ?? []).filter((r) => r.status === "new").length;
  const newest = playbooks.map((p) => p.updatedAt).sort().at(-1);

  const ask = async (text = question) => {
    if (!text.trim()) return;
    setThread((t) => [...t, { role: "you", text }]);
    setQuestion("");
    setBusy(true);
    try {
      const r = await fetch("/api/guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text }) });
      const j = await r.json();
      setThread((t) => [...t, { role: "guide", text: j.answer, sources: j.sources }]);
      if (j.sources?.[0]) setOpenId(j.sources[0]);
    } finally {
      setBusy(false);
    }
  };

  const filter = (on: boolean) => `rounded-md border px-2.5 py-1 text-[12px] font-medium ${on ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:bg-surface-2"}`;

  return (
    <AppShell
      title="Volunteer Guide"
      subtitle="How ComForce actually does the work, written down once so it survives staff turnover. Ask in plain English."
      badge={unclaimed}
      me={me.name}
      actions={<><Btn variant="solid" href="mailto:TeamComForceMKE@gmail.com?subject=New%20Relay%20playbook"><Plus size={15} /> New playbook</Btn><Btn href="mailto:TeamComForceMKE@gmail.com?subject=Playbook%20edit%20suggestion">Suggest an edit</Btn></>}
    >
      <div className="card mb-3.5 grid grid-cols-3 divide-x divide-line">
        <Figure label="Playbooks" value={playbooks.length} sub="procedures written by the team" />
        <Figure label="Need types covered" value={<>{tags.length}<span className="text-[16px] font-medium text-muted"> of {Object.keys(NEED_LABEL).length}</span></>} sub="at least one playbook each" />
        <Figure label="Last edited" value={newest ? day(newest) : "—"} sub="most recent change to any playbook" />
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        <div className="space-y-3.5">
          <div className="card p-3 space-y-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} className="input" placeholder="Search playbooks..." />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setTag("all")} aria-pressed={tag === "all"} className={filter(tag === "all")}>All</button>
              {tags.map((t) => <button key={t} onClick={() => setTag(t)} aria-pressed={tag === t} className={filter(tag === t)}>{NEED_LABEL[t]}</button>)}
            </div>
          </div>
          <SectionCard title="Playbooks" action={<span className="num text-[11.5px] text-muted">{list.length} of {playbooks.length}</span>}>
            <ul className="divide-y divide-line">
              {list.map((p) => {
                const on = open?.id === p.id;
                return (
                  <li key={p.id}>
                    <button onClick={() => setOpenId(p.id)} aria-pressed={on} className={`grid w-full grid-cols-[1fr_auto] items-baseline gap-x-3 px-4 py-3 text-left hover:bg-surface-2 ${on ? "bg-surface-2" : ""}`}>
                      <span className={`text-[13.5px] ${on ? "font-semibold" : "font-medium"}`}>{p.title}</span>
                      <span className="num text-[11.5px] text-muted">{day(p.updatedAt)}</span>
                      <span className="col-span-2 mt-0.5 text-[11.5px] text-muted">{needsText(p.tags)}</span>
                    </button>
                  </li>
                );
              })}
              {!list.length && <li className="px-4 py-3 text-[13px] text-muted">No playbook matches that search.</li>}
            </ul>
          </SectionCard>
        </div>

        <SectionCard title={open?.title ?? "Select a playbook"} action={open && <span className="text-[11.5px] text-muted">Edited {day(open.updatedAt, true)}</span>}>
          {open && (
            <div className="px-5 pb-5 pt-4">
              <div className="text-[12px] text-muted">{needsText(open.tags)}</div>
              <ol className="mt-3 divide-y divide-line border-y border-line">
                {open.body.split("\n").map((line, i) => {
                  const m = line.match(/^(\d+)\.\s*(.*)$/);
                  return (
                    <li key={i} className="grid grid-cols-[22px_1fr] gap-x-2 py-2.5 text-[13.5px] leading-relaxed">
                      <span className="num font-semibold text-muted">{m ? m[1] : i + 1}</span>
                      <span>{m ? m[2] : line}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-4 text-[12.5px] leading-relaxed text-ink-2"><span className="font-semibold text-red">Every visit.</span> Go in pairs, never alone. If weapons are present or someone is in immediate danger, leave and call 911, then notify the on-call lead.</p>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Ask the Guide" action={<span className="text-[11.5px] text-muted">answers only from these playbooks</span>}>
          <div className="flex flex-col h-[560px]">
            <div className="flex-1 overflow-auto">
              {!thread.length && (
                <div>
                  <div className="px-4 pb-1.5 pt-3 text-[12px] text-muted">Questions volunteers ask</div>
                  <ul className="divide-y divide-line border-y border-line">
                    {SUGGESTED.map((s) => <li key={s}><button onClick={() => ask(s)} className="block w-full px-4 py-2.5 text-left text-[13px] hover:bg-surface-2">{s}</button></li>)}
                  </ul>
                </div>
              )}
              <div className="space-y-4 p-4">
                {thread.map((m, i) => m.role === "you" ? (
                  <p key={i} className="text-[13.5px] font-semibold leading-snug">{m.text}</p>
                ) : (
                  <div key={i} className="border-l-2 border-line pl-3">
                    <p className="whitespace-pre-line text-[13px] leading-relaxed">{m.text}</p>
                    {m.sources && m.sources.length > 0 && (
                      <p className="mt-2 text-[12px] text-muted">From:{" "}
                        {m.sources.map((s, k) => { const p = playbooks.find((x) => x.id === s); return p ? <span key={s}>{k > 0 && ", "}<button onClick={() => setOpenId(s)} className="font-medium text-ink underline decoration-line underline-offset-2 hover:decoration-ink">{p.title}</button></span> : null; })}
                      </p>
                    )}
                  </div>
                ))}
                {busy && <p className="text-[13px] text-muted"><span className="blink">Reading the playbooks…</span></p>}
              </div>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="border-t border-line p-3 flex gap-2">
              <input value={question} onChange={(e) => setQuestion(e.target.value)} className="input !pl-3" placeholder="Ask how we handle something…" aria-label="Your question" />
              <button disabled={busy || !question.trim()} className="rounded-lg bg-brand px-4 text-[13px] font-medium text-white disabled:opacity-40">Ask</button>
            </form>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}

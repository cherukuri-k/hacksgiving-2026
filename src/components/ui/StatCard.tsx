import type { ReactNode } from "react";

export type Tint = "none" | "blue" | "green" | "purple" | "orange" | "red";

const TINT: Record<Tint, string> = {
  none: "",
  blue: "!bg-brand-soft !border-[#bfe0f3]",
  green: "!bg-green-soft !border-[#bfe7cf]",
  purple: "!bg-purple-soft !border-[#dccbf7]",
  orange: "!bg-orange-soft !border-[#f8dcae]",
  red: "!bg-red-soft !border-[#f5c2c2]",
};
const NUM: Record<Tint, string> = { none: "text-ink", blue: "text-brand", green: "text-green", purple: "text-purple", orange: "text-orange", red: "text-red" };

export function StatCard({ icon, label, value, sub, tint = "none", bar, valueClass = "" }: { icon: ReactNode; label: string; value: ReactNode; sub?: string; tint?: Tint; bar?: number; valueClass?: string }) {
  return (
    <div className={`card p-4 ${TINT[tint]}`}>
      <div className="flex items-center gap-1.5 text-[12.5px] text-ink-2">{icon}{label}</div>
      <div className={`num mt-2 text-[26px] font-bold leading-none ${NUM[tint]} ${valueClass}`}>{value}</div>
      {bar !== undefined ? <div className="bar mt-3"><span style={{ width: `${bar}%` }} /></div> : sub ? <div className="mt-2 text-[12px] text-muted">{sub}</div> : null}
    </div>
  );
}

/** One figure in a plain strip: label, number, one line of context. No icon, no tint. Wrap several in `card grid divide-x divide-line`. */
export function Figure({ label, value, sub, tone = "text-ink" }: { label: string; value: ReactNode; sub: string; tone?: string }) {
  return (
    <div className="px-5 py-4">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={`num mt-1.5 text-[28px] font-semibold leading-none tracking-tight ${tone}`}>{value}</div>
      <div className="mt-1.5 text-[12px] text-muted">{sub}</div>
    </div>
  );
}

export function SectionCard({ title, action, children, className = "" }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

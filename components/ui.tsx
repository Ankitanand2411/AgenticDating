import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line/80 bg-plum/70 ${className}`}>{children}</div>;
}

export function H2({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`font-display text-2xl tracking-tight text-paper ${className}`}>{children}</h2>;
}

export function H3({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h3 className={`font-display text-lg text-paper ${className}`}>{children}</h3>;
}

const statusStyle: Record<string, string> = {
  pending: "bg-surface text-muted",
  scraping: "bg-gold/15 text-gold",
  analyzing: "bg-gold/15 text-gold",
  ready: "bg-mint/15 text-mint",
  done: "bg-mint/15 text-mint",
  running: "bg-rose/15 text-rose",
  error: "bg-red-500/15 text-red-300",
};
const statusLabel: Record<string, string> = {
  pending: "waiting",
  scraping: "reading profiles",
  analyzing: "agent thinking",
  ready: "ready",
  done: "done",
  running: "on a date",
  error: "needs attention",
};

export function Status({ status, live }: { status: string; live?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${statusStyle[status] ?? statusStyle.pending}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${live || status === "scraping" || status === "analyzing" || status === "running" ? "live-dot" : ""}`} />
      {statusLabel[status] ?? status}
    </span>
  );
}

export function Button({
  children,
  onClick,
  href,
  variant = "primary",
  disabled,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
  const styles = {
    primary: "bg-rose text-ink hover:bg-roseDeep hover:text-paper",
    secondary: "border border-line bg-surface text-paper hover:border-rose/60",
    ghost: "text-muted hover:text-paper",
    danger: "border border-red-500/40 text-red-300 hover:bg-red-500/10",
  }[variant];
  if (href) {
    return (
      <Link href={href} className={`${base} ${styles} ${className} no-underline`}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} aria-hidden />;
}

export function Score({ value, label, tone = "gold" }: { value: number; label?: string; tone?: "gold" | "rose" | "mint" }) {
  const color = { gold: "bg-gold", rose: "bg-rose", mint: "bg-mint" }[tone];
  return (
    <div className="min-w-[7rem]">
      {label && <div className="mb-1 flex justify-between text-xs text-muted"><span>{label}</span><span className="text-paper">{value}/10</span></div>}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / 10) * 100}%` }} />
      </div>
    </div>
  );
}

export function Chips({ items, tone = "surface" }: { items: string[]; tone?: "surface" | "rose" | "gold" | "mint" }) {
  const style = {
    surface: "bg-surface text-paper/90",
    rose: "bg-rose/15 text-rose",
    gold: "bg-gold/15 text-gold",
    mint: "bg-mint/15 text-mint",
  }[tone];
  if (!items.length) return <span className="text-sm text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span key={i} className={`rounded-md px-2 py-0.5 text-sm ${style}`}>
          {it}
        </span>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-display text-lg text-paper">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{message}</p>;
}

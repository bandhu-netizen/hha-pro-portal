import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Field({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg outline-none placeholder:text-faint",
        "focus:border-accent focus:ring-4 focus:ring-accent-soft",
        className,
      )}
      {...props}
    />
  );
}

export function SelectField({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 rounded-md border border-line-strong bg-surface px-2.5 font-mono text-xs text-fg outline-none",
        "focus:border-accent focus:ring-4 focus:ring-accent-soft",
        className,
      )}
      {...props}
    />
  );
}

export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-faint",
        "focus:border-accent focus:ring-4 focus:ring-accent-soft",
        className,
      )}
      {...props}
    />
  );
}

export function Kpi({
  n,
  label,
  tone = "fg",
  on,
  onClick,
}: {
  n: number | string;
  label: string;
  tone?: "fg" | "accent" | "crit" | "ok" | "high";
  on?: boolean;
  onClick?: () => void;
}) {
  const color = {
    fg: "text-fg",
    accent: "text-accent",
    crit: "text-crit",
    ok: "text-ok",
    high: "text-high",
  }[tone];
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "rounded-xl border border-line bg-surface px-4 py-4 text-left transition-[transform,border-color,box-shadow] duration-150",
          "hover:-translate-y-px hover:border-line-strong",
          on && "border-accent shadow-[0_0_0_4px_var(--color-accent-soft)]",
        )}
      >
        <div className={cn("font-display text-4xl font-medium leading-none tabular-nums tracking-tight", color)}>
          {n}
        </div>
        <div className="mt-2 text-xs font-medium text-muted">{label}</div>
      </button>
    );
  }
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface px-4 py-4 text-left",
        on && "border-accent shadow-[0_0_0_4px_var(--color-accent-soft)]",
      )}
    >
      <div className={cn("font-display text-4xl font-medium leading-none tabular-nums tracking-tight", color)}>
        {n}
      </div>
      <div className="mt-2 text-xs font-medium text-muted">{label}</div>
    </div>
  );
}

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface shadow-[var(--shadow-panel)]", className)}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11px] font-semibold uppercase tracking-[0.08em] text-faint", className)}>
      {children}
    </div>
  );
}

import { useState } from "react";
import { cn } from "@/lib/utils";

export function Dropzone({
  onFiles,
  compact,
  label = "Drop Referrals-by-Status exports",
}: {
  onFiles: (files: File[]) => void;
  compact?: boolean;
  label?: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface-2 text-center transition-[border-color,background-color] duration-150",
        compact ? "px-4 py-5" : "px-5 py-8",
        over && "border-accent bg-accent-soft",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files || []));
      }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
        CSV · Excel · multiple files
      </div>
      <strong className="mt-1 text-sm font-medium">{label}</strong>
      <div className="mt-1 max-w-md text-xs text-muted">
        Maryland, New York, and the rest sort themselves. Nested notes flatten on ingest.
      </div>
      <input
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,.xls"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
    </label>
  );
}

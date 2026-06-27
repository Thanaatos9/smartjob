"use client";

import { useState } from "react";
import { STATUS_LABELS } from "@/lib/offer-status";
import { cn } from "@/lib/utils";

const DOT: Record<string, string> = {
  found: "bg-muted-foreground",
  letter_generated: "bg-secondary-foreground",
  applied: "bg-primary",
  interview: "bg-warning",
  rejected: "bg-destructive",
  accepted: "bg-success",
};

export function StatusSelect({
  offerId,
  status,
  onChanged,
  className,
}: {
  offerId: string;
  status: string;
  onChanged?: (next: string) => void;
  className?: string;
}) {
  const [value, setValue] = useState(status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function change(next: string) {
    const prev = value;
    setValue(next);
    setSaving(true);
    setError(false);

    const res = await fetch(`/api/offers/${offerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setSaving(false);

    if (!res.ok) {
      setValue(prev);
      setError(true);
      return;
    }
    onChanged?.(next);
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={cn("size-2 shrink-0 rounded-full", DOT[value] ?? "bg-muted-foreground")}
        aria-hidden
      />
      <select
        value={value}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
        aria-label="Statut de la candidature"
        aria-invalid={error}
        className={cn(
          "h-9 cursor-pointer appearance-none rounded-md border bg-card pl-2 pr-7 text-sm font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
          error ? "border-destructive" : "border-input",
          className,
        )}
      >
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = "primary",
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "primary" | "warning" | "success" | "muted";
}) {
  const tones: Record<string, string> = {
    primary: "bg-secondary text-secondary-foreground",
    warning: "bg-warning/15 text-warning",
    success: "bg-success/15 text-success",
    muted: "bg-muted text-muted-foreground",
  };

  return (
    <Card className="flex items-center gap-4 p-4">
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-lg",
          tones[accent],
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums leading-tight">{value}</p>
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}

import { Badge } from "@/components/ui/badge";
import { statusLabels, statusVariant } from "@/lib/forms";
import type { RecordStatus } from "@/types";

export function StatusBadge({ status, className }: { status: RecordStatus | string; className?: string }) {
  const key = status as RecordStatus;
  const label = statusLabels[key] ?? String(status);
  const variant = statusVariant[key] ?? "secondary";
  return (
    <Badge variant={variant} className={`rounded-full px-2.5 ${className || ""}`}>
      {label}
    </Badge>
  );
}

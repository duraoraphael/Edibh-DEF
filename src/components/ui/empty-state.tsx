import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  className,
}: {
  icon?: LucideIcon;
  title?: string;
  text: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full flex-col items-center justify-center gap-2 p-8 text-center", className)}>
      {Icon && <Icon className="h-8 w-8 text-muted-foreground" aria-hidden />}
      {title && <p className="text-sm font-medium text-foreground">{title}</p>}
      <p className="text-sm text-muted-foreground">{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

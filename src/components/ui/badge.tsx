import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary-100 text-primary-800",
        secondary: "border-transparent bg-muted text-muted-foreground",
        destructive: "border-transparent bg-destructive/10 text-destructive",
        outline: "border-border text-foreground",
        success: "border-transparent bg-primary-100 text-primary-700",
        warning: "border-transparent bg-warning/10 text-warning",
        statusAnalysis: "border-slate-300 bg-white text-slate-900 dark:border-slate-400 dark:bg-white dark:text-slate-950",
        statusProgress: "border-amber-300 bg-amber-200 text-amber-950 dark:border-amber-300 dark:bg-amber-300 dark:text-amber-950",
        statusComplete: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-300 dark:bg-emerald-200 dark:text-emerald-950",
        statusDirect: "border-green-900 bg-green-800 text-white dark:border-green-600 dark:bg-green-800 dark:text-white",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

"use client";

import { cn } from "@/lib/utils";

export function Tooltip({
  label,
  children,
  side = "right",
}: {
  label: string;
  children: React.ReactNode;
  side?: "right" | "bottom";
}) {
  return (
    <div className="group/tooltip relative flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tooltip:opacity-100",
          side === "right" && "left-full top-1/2 ml-2 -translate-y-1/2",
          side === "bottom" && "left-1/2 top-full mt-2 -translate-x-1/2"
        )}
      >
        {label}
      </span>
    </div>
  );
}

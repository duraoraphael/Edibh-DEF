import { CalendarDays, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const HISTORY_FILTER_SELECT_CLASS = "h-12 rounded-xl border-[#E2E8F0] bg-white px-3.5 text-xs shadow-none [&>span]:line-clamp-2 [&>span]:whitespace-normal [&>span]:text-left";

export function HistoryFilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="mb-2 block text-xs font-semibold tracking-wide text-[#243247]">{label}</span>
      {children}
    </div>
  );
}

export const HISTORY_SEARCH_CLASS = "h-12 rounded-xl border-[#E2E8F0] bg-white pl-11 pr-4 shadow-sm placeholder:text-[#64748B] focus-visible:border-primary focus-visible:ring-primary/20";

/** Search box shared by the flows table and the chart drill-down panel. */
export function HistorySearchInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, "type">) {
  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
      <Input className={HISTORY_SEARCH_CLASS} {...props} />
    </div>
  );
}

/** "Período" box (data inicial / até / data final) shared by the flows table and the drill-down panel. */
export function HistoryDateRange({ idPrefix, from, to, onFromChange, onToChange }: { idPrefix: string; from: string; to: string; onFromChange: (value: string) => void; onToChange: (value: string) => void }) {
  const field = "h-11 rounded-xl border-[#E2E8F0] bg-white pl-10 shadow-none";
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-[#E2E8F0] bg-[#F6F8FA] p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#243247]">
        <CalendarDays className="h-4 w-4 text-primary" />
        <span>Período</span>
      </div>
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3">
        <div className="relative min-w-0">
          <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <Input id={`${idPrefix}-date-from`} aria-label="Data inicial do período" lang="pt-BR" type="date" value={from} onChange={(e) => onFromChange(e.target.value)} title="Período de" className={field} />
        </div>
        <span className="text-center text-sm text-[#64748B]">até</span>
        <div className="relative min-w-0">
          <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
          <Input id={`${idPrefix}-date-to`} aria-label="Data final do período" lang="pt-BR" type="date" value={to} onChange={(e) => onToChange(e.target.value)} title="Período até" className={field} />
        </div>
      </div>
    </div>
  );
}

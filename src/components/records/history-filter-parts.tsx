export const HISTORY_FILTER_SELECT_CLASS = "h-12 rounded-xl border-[#E2E8F0] bg-white px-3.5 text-xs shadow-none [&>span]:line-clamp-2 [&>span]:whitespace-normal [&>span]:text-left";

export function HistoryFilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="mb-2 block text-xs font-semibold tracking-wide text-[#243247]">{label}</span>
      {children}
    </div>
  );
}

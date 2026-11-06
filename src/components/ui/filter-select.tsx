import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const FILTER_ALL = "todos";

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  labels,
  allLabel = "Todos",
  includeLabelInAllOption = true,
  className,
  hideAll = false,
  children,
}: {
  /** Omit the "all" option (for selectors that must always hold a value, e.g. year). */
  hideAll?: boolean;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options?: string[];
  labels?: Record<string, string>;
  allLabel?: string;
  includeLabelInAllOption?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {!hideAll && (
          <SelectItem value={FILTER_ALL}>
            {includeLabelInAllOption ? `${label}: ${allLabel}` : allLabel}
          </SelectItem>
        )}
        {options
          ? options.map((o) => (
              <SelectItem key={o} value={o}>
                {labels?.[o] || o}
              </SelectItem>
            ))
          : children}
      </SelectContent>
    </Select>
  );
}

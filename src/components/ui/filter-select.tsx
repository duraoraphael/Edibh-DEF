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
  disabled,
  title,
  children,
}: {
  /** Omit the "all" option (for selectors that must always hold a value, e.g. year). */
  hideAll?: boolean;
  disabled?: boolean;
  title?: string;
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
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className} aria-label={label} title={title}>
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

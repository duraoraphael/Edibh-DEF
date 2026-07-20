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
  className,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options?: string[];
  labels?: Record<string, string>;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={FILTER_ALL}>{label}: Todos</SelectItem>
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

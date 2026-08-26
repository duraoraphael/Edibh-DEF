"use client";

import { Checkbox } from "@/components/ui/checkbox";

export function CaseCheckbox({
  checked,
  disabled,
  recordLabel,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  recordLabel: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
      <Checkbox
        checked={checked}
        disabled={disabled}
        aria-label={`Case do fluxo ${recordLabel}`}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span>Case</span>
    </label>
  );
}

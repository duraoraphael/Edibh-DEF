import { TableCell, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { fieldValue } from "@/lib/forms";
import type { AppRecord } from "@/types";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

export function RecordRow({
  record,
  onClick,
  selectable,
  selected,
  onToggleSelected,
  actions,
  dense,
  caseControl,
}: {
  record: AppRecord;
  onClick?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  actions?: React.ReactNode;
  dense?: boolean;
  caseControl?: React.ReactNode;
}) {
  const cell = dense ? "py-2" : "py-4";
  return (
    <TableRow
      className={cn("cursor-pointer hover:bg-muted/35", record.isCase && "bg-primary-50/35 shadow-[inset_2px_0_0_var(--primary)]")}
      onClick={onClick}
    >
      {selectable && (
        <TableCell className={cell} onClick={(e) => e.stopPropagation()}>
          <Checkbox
            aria-label={`Selecionar registro ${record.recordNumber || record.id}`}
            checked={!!selected}
            onCheckedChange={() => onToggleSelected?.()}
          />
        </TableCell>
      )}
      <TableCell className={`font-semibold tabular-nums ${cell}`}>{record.recordNumber || "—"}</TableCell>
      <TableCell className={cell}>{fieldValue(record, "instalacao") || "—"}</TableCell>
      <TableCell className={cell}>{fieldValue(record, "sistema") || "—"}</TableCell>
      <TableCell className={`min-w-64 whitespace-normal leading-relaxed ${cell}`}>{fieldValue(record, "equipamento") || "—"}</TableCell>
      <TableCell className={cell}>{fieldValue(record, "gerencia") || "—"}</TableCell>
      <TableCell className={cell}>
        {record.createdAt ? new Date(record.createdAt).toLocaleDateString("pt-BR") : "—"}
      </TableCell>
      <TableCell className={cell}>
        <StatusBadge status={record.status} />
      </TableCell>
      <TableCell className={cell}>{record.authorName || "—"}</TableCell>
      {caseControl && (
        <TableCell className={cell} onClick={(e) => e.stopPropagation()}>
          {caseControl}
        </TableCell>
      )}
      {actions && (
        <TableCell className={`text-center ${cell}`} onClick={(e) => e.stopPropagation()}>
          {actions}
        </TableCell>
      )}
    </TableRow>
  );
}

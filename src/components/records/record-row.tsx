import { TableCell, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { fieldValue } from "@/lib/forms";
import type { AppRecord } from "@/types";

export function RecordRow({
  record,
  onClick,
  selectable,
  selected,
  onToggleSelected,
  actions,
  dense,
}: {
  record: AppRecord;
  onClick?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;
  actions?: React.ReactNode;
  dense?: boolean;
}) {
  const cell = dense ? "py-1.5" : "";
  return (
    <TableRow
      className="cursor-pointer even:bg-muted/30 hover:bg-primary-50"
      onClick={onClick}
    >
      {selectable && (
        <TableCell className={cell} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={`Selecionar registro ${record.recordNumber || record.id}`}
            checked={!!selected}
            onChange={onToggleSelected}
          />
        </TableCell>
      )}
      <TableCell className={`font-medium ${cell}`}>{record.recordNumber || "—"}</TableCell>
      <TableCell className={cell}>{fieldValue(record, "instalacao") || "—"}</TableCell>
      <TableCell className={cell}>{fieldValue(record, "sistema") || "—"}</TableCell>
      <TableCell className={cell}>{fieldValue(record, "equipamento") || "—"}</TableCell>
      <TableCell className={cell}>{fieldValue(record, "gerencia") || "—"}</TableCell>
      <TableCell className={cell}>
        {record.createdAt ? new Date(record.createdAt).toLocaleDateString() : "—"}
      </TableCell>
      <TableCell className={cell}>
        <StatusBadge status={record.status} />
      </TableCell>
      <TableCell className={cell}>{record.authorName || "—"}</TableCell>
      {actions && (
        <TableCell className={`text-right ${cell}`} onClick={(e) => e.stopPropagation()}>
          {actions}
        </TableCell>
      )}
    </TableRow>
  );
}

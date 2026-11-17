import type { AppRecord, FormField } from "@/types";
import { findDataSourceField, normalizeDataSource, recordDataSources } from "@/lib/data-source";
export { normalizeDataSource as normalizeDistributionSource } from "@/lib/data-source";

export const DISTRIBUTION_KEYS = ["gerencia", "instalacao", "sistema", "sistemaMacro", "responsavel", "fonteDados"] as const;
export type DistributionKey = (typeof DISTRIBUTION_KEYS)[number];
export const distributionLabels: Record<DistributionKey, string> = {
  gerencia: "Gerência",
  instalacao: "Instalação",
  sistema: "Sistema",
  sistemaMacro: "Sistema Macro",
  responsavel: "Responsável",
  fonteDados: "Fonte de Dados",
};

export interface DistributionDatum {
  name: string;
  total: number;
  percentage: number;
}

function normalizedName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchesField(value: string, dimension: DistributionKey) {
  const name = normalizedName(value.replace(/_\d+$/, ""));
  return dimension === "fonteDados"
    ? name === "fontededados" || name === "fontedados"
    : name === normalizedName(dimension) || (dimension === "sistemaMacro" && name === "sistemasmacro");
}

function distributionField(dimension: DistributionKey, fields: FormField[]) {
  if (dimension === "fonteDados") return findDataSourceField(fields);
  return dimension === "sistemaMacro" ? fields.find((item) => matchesField(item.label, dimension) || matchesField(item.key, dimension)) : undefined;
}

/**
 * Category names a record contributes to for one dimension. Shared by the chart aggregation and the
 * drill-down so that a bar's count and the records listed behind it can never diverge.
 * Only "Fonte de Dados" can return more than one name (a flow may list several sources).
 */
export function recordDistributionNames(record: AppRecord, dimension: DistributionKey, fields: FormField[] = [], field = distributionField(dimension, fields)): string[] {
  if (dimension === "fonteDados") return recordDataSources(record, fields);
  const key = dimension === "sistemaMacro" ? field?.key ?? Object.keys(record.data ?? {}).find((name) => matchesField(name, dimension)) : dimension;
  const raw = dimension === "responsavel" ? record.authorName : key ? record.data?.[key] : undefined;
  return [(Array.isArray(raw) ? raw.join(", ") : raw == null ? "" : String(raw)) || "N/D"];
}

/** Records behind one category of a distribution chart. */
export function recordsForDistribution(records: AppRecord[], dimension: DistributionKey, category: string, fields: FormField[] = []): AppRecord[] {
  const field = distributionField(dimension, fields);
  return records.filter((record) => recordDistributionNames(record, dimension, fields, field).includes(category));
}

/** Pure display aggregation: callers supply the dashboard's already-filtered records. */
export function buildDistributionData(records: AppRecord[], dimension: DistributionKey, fields: FormField[] = []): DistributionDatum[] {
  if (!records.length) return [];
  const field = distributionField(dimension, fields);
  const counts = new Map<string, number>();
  // Keep configured source options visible, including options with zero selections.
  if (dimension === "fonteDados") {
    field?.options?.forEach((option) => {
      const name = normalizeDataSource(option);
      if (name) counts.set(name, 0);
    });
  }
  for (const record of records) {
    // Equivalent aliases selected on one record still represent one record.
    for (const name of recordDistributionNames(record, dimension, fields, field)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts, ([name, total]) => ({ name, total, percentage: total / records.length * 100 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));
}

export const formatDistributionPercentage = (value: number) => `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** Rounded integer ticks with headroom for the two-line labels. */
export function distributionScale(data: DistributionDatum[]) {
  const maximum = data.reduce((max, item) => Math.max(max, item.total), 0);
  const targetStep = Math.max(1, maximum * 1.2 / 5);
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const step = ([1, 2, 5, 10].find((factor) => factor * magnitude >= targetStep) ?? 10) * magnitude;
  const ceiling = Math.max(step, Math.ceil(maximum * 1.2 / step) * step);
  return { ceiling, ticks: Array.from({ length: Math.round(ceiling / step) + 1 }, (_, index) => index * step) };
}

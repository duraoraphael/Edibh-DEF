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

/** Pure display aggregation: callers supply the dashboard's already-filtered records. */
export function buildDistributionData(records: AppRecord[], dimension: DistributionKey, fields: FormField[] = []): DistributionDatum[] {
  if (!records.length) return [];
  const dynamic = dimension === "fonteDados" || dimension === "sistemaMacro";
  const field = dimension === "fonteDados" ? findDataSourceField(fields) : dynamic ? fields.find((item) => matchesField(item.label, dimension) || matchesField(item.key, dimension)) : undefined;
  const counts = new Map<string, number>();
  // Keep configured source options visible, including options with zero selections.
  if (dimension === "fonteDados") {
    field?.options?.forEach((option) => {
      const name = normalizeDataSource(option);
      if (name) counts.set(name, 0);
    });
  }

  for (const record of records) {
    const key = dynamic
      ? field?.key ?? Object.keys(record.data ?? {}).find((name) => matchesField(name, dimension))
      : dimension;
    const raw = dimension === "responsavel" ? record.authorName : key ? record.data?.[key] : undefined;
    if (dimension === "fonteDados") {
      // Equivalent aliases selected on one record still represent one record.
      const selections = recordDataSources(record, fields);
      selections.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
    } else {
      const name = (Array.isArray(raw) ? raw.join(", ") : raw == null ? "" : String(raw)) || "N/D";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
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

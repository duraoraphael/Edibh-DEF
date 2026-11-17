import type { AppRecord, FormField, RecordStatus } from "@/types";
import { statusLabels } from "@/lib/forms";
import { distributionLabels, recordDistributionNames, type DistributionKey } from "@/lib/dashboard-distributions";

export const ALL = "todos";
export const DASHBOARD_PATH = "/dashboard";
export const DETAIL_PATH = "/dashboard/detalhamento";

/** Dimensions a flow can be drilled by: the six distribution dimensions plus status. */
export const DETAIL_DIMENSIONS = ["fonteDados", "instalacao", "gerencia", "sistema", "sistemaMacro", "status", "responsavel"] as const;
export type DetailDimension = (typeof DETAIL_DIMENSIONS)[number];
export const detailDimensionLabels: Record<DetailDimension, string> = { ...distributionLabels, status: "Status" };

export interface DetailStep { dim: DetailDimension; value: string }

/** Dashboard-wide filters, carried to the detail page (and back) through the URL. */
export interface GlobalFilters {
  gerencia: string; instalacao: string; sistema: string; equipamento: string; responsavel: string;
  status: string; ano: string; mes: string; dateFrom: string; dateTo: string;
}
export const DEFAULT_GLOBALS: GlobalFilters = {
  gerencia: ALL, instalacao: ALL, sistema: ALL, equipamento: ALL, responsavel: ALL, status: ALL, ano: ALL, mes: ALL, dateFrom: "", dateTo: "",
};
const GLOBAL_KEYS = Object.keys(DEFAULT_GLOBALS) as (keyof GlobalFilters)[];

/** `day` is a "d/m" label from the evolution chart (same criterion as that chart, so no year is implied). */
export interface DetailQuery { steps: DetailStep[]; globals: GlobalFilters; search: string; dateFrom: string; dateTo: string; day: string }

type ParamReader = { get(name: string): string | null; getAll(name: string): string[] };

const isDimension = (value: string): value is DetailDimension => (DETAIL_DIMENSIONS as readonly string[]).includes(value);
const isIsoDate = (value: string | null) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Display text of a step value (status keys are shown with their label). */
export function stepLabel(step: DetailStep): string {
  return step.dim === "status" ? statusLabels[step.value as RecordStatus] ?? step.value : step.value;
}

/** Turns a chart category (a display name) into the stable value stored in the URL. */
export function stepFromCategory(dim: DetailDimension, category: string): DetailStep {
  if (dim !== "status") return { dim, value: category };
  const key = (Object.keys(statusLabels) as RecordStatus[]).find((status) => statusLabels[status] === category);
  return { dim, value: key ?? category };
}

/** Appends a step; a dimension can only appear once, so a repeated one replaces the earlier step. */
export function addStep(steps: DetailStep[], step: DetailStep): DetailStep[] {
  return [...steps.filter((item) => item.dim !== step.dim), step];
}
export const removeStep = (steps: DetailStep[], dim: DetailDimension): DetailStep[] => steps.filter((item) => item.dim !== dim);

/** Reads and sanitises everything from the URL: unknown dimensions, empty values and repeats are dropped. */
export function parseDetailQuery(params: ParamReader): DetailQuery {
  const steps: DetailStep[] = [];
  for (const raw of params.getAll("f")) {
    const at = raw.indexOf(":");
    const dim = raw.slice(0, at);
    const value = raw.slice(at + 1).trim();
    if (at < 1 || !isDimension(dim) || !value || steps.some((step) => step.dim === dim)) continue;
    if (dim === "status" && !(value in statusLabels)) continue;
    steps.push({ dim, value });
  }
  const globals = { ...DEFAULT_GLOBALS };
  for (const key of GLOBAL_KEYS) globals[key] = params.get(`g_${key}`) || DEFAULT_GLOBALS[key];
  for (const key of ["dateFrom", "dateTo"] as const) if (!isIsoDate(globals[key])) globals[key] = "";
  const de = params.get("de");
  const ate = params.get("ate");
  const day = params.get("dia") ?? "";
  return { steps, globals, search: params.get("q")?.slice(0, 200) ?? "", dateFrom: isIsoDate(de) ? de! : "", dateTo: isIsoDate(ate) ? ate! : "", day: day === "N/D" || /^\d{1,2}\/\d{1,2}$/.test(day) ? day : "" };
}

export function globalParams(globals: GlobalFilters): [string, string][] {
  return GLOBAL_KEYS.filter((key) => globals[key] !== DEFAULT_GLOBALS[key]).map((key) => [`g_${key}`, globals[key]]);
}

export function buildDetailHref(query: Partial<DetailQuery> & { steps: DetailStep[] }): string {
  const params = new URLSearchParams();
  query.steps.forEach((step) => params.append("f", `${step.dim}:${step.value}`));
  globalParams(query.globals ?? DEFAULT_GLOBALS).forEach(([key, value]) => params.set(key, value));
  if (query.search?.trim()) params.set("q", query.search.trim());
  if (query.dateFrom) params.set("de", query.dateFrom);
  if (query.dateTo) params.set("ate", query.dateTo);
  if (query.day) params.set("dia", query.day);
  return `${DETAIL_PATH}?${params.toString()}`;
}

/** Dashboard URL that restores the global filters (used by "Voltar ao Dashboard"). */
export function buildDashboardHref(globals: GlobalFilters): string {
  const params = new URLSearchParams(globalParams(globals));
  return params.size ? `${DASHBOARD_PATH}?${params.toString()}` : DASHBOARD_PATH;
}

export function recordMatchesStep(record: AppRecord, step: DetailStep, fields: FormField[]): boolean {
  return step.dim === "status" ? record.status === step.value : recordDistributionNames(record, step.dim as DistributionKey, fields).includes(step.value);
}

/** Names a record contributes to for a dimension (status is reported by key). */
export function recordDimensionValues(record: AppRecord, dim: DetailDimension, fields: FormField[]): string[] {
  return dim === "status" ? [record.status] : recordDistributionNames(record, dim, fields);
}

/** Human-readable list of the dashboard-wide filters in effect (for "active filters" chips). */
export function describeGlobals(g: GlobalFilters): string[] {
  const iso = (value: string) => value.split("-").reverse().join("/");
  return [
    g.gerencia !== ALL && `Gerência: ${g.gerencia}`,
    g.instalacao !== ALL && `Instalação: ${g.instalacao}`,
    g.sistema !== ALL && `Sistema: ${g.sistema}`,
    g.equipamento !== ALL && `Equipamento: ${g.equipamento}`,
    g.responsavel !== ALL && `Responsável: ${g.responsavel}`,
    g.status !== ALL && `Status: ${statusLabels[g.status as RecordStatus] ?? g.status}`,
    g.ano !== ALL && `Ano: ${g.ano}`,
    g.mes !== ALL && `Mês: ${new Date(2000, Number(g.mes) - 1, 1).toLocaleDateString("pt-BR", { month: "long" })}`,
    g.dateFrom && `De: ${iso(g.dateFrom)}`,
    g.dateTo && `Até: ${iso(g.dateTo)}`,
  ].filter((item): item is string => !!item);
}

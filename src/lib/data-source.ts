import type { AppRecord, FormField } from "@/types";

function normalizedName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeDataSource(value: string): string {
  const name = normalizedName(value);
  if (!name || ["null", "undefined", "naoinformado", "objectobject"].includes(name)) return "";
  if (name === "rdo" || name === "rdoinstalacao") return "RDO-INSTALAÇÃO";
  if (name === "iot" || name === "supervisorioiot") return "IOT";
  return value.trim();
}

function isSourceName(value: string) {
  return ["fontededados", "fontedados", "tiposdedados"].includes(normalizedName(value.replace(/_\d+$/, "")));
}

export function isDataSourceField(key: string, fields: FormField[] = []): boolean {
  return isSourceName(key) || fields.some(field => field.key === key && isSourceName(field.label));
}

export function findDataSourceField(fields: FormField[] = []): FormField | undefined {
  return fields.find(field => isSourceName(field.label) || isSourceName(field.key));
}

/** Read the configured field (currently tipos_de_dados_9), with legacy key fallback. */
export function recordDataSources(record: Pick<AppRecord, "data">, fields: FormField[] = []): string[] {
  const data = record.data ?? {};
  const configured = findDataSourceField(fields)?.key;
  const keys = [...new Set([...(configured ? [configured] : []), ...Object.keys(data).filter(isSourceName)])];
  for (const key of keys) {
    const raw = data[key];
    const values = (Array.isArray(raw) ? raw : [raw])
      .filter((value): value is string => typeof value === "string")
      .map(normalizeDataSource).filter(Boolean);
    if (values.length) return [...new Set(values)];
  }
  return [];
}

export function formatRecordDataSource(record: Pick<AppRecord, "data">, fields: FormField[] = []): string {
  return recordDataSources(record, fields).join(", ") || "Não informado";
}

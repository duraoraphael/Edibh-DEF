/**
 * Technician ("responsável") names are free text copied onto each record (`authorName`), so the same
 * person shows up as "João Silva", "joao silva" or "João  Silva " depending on who typed it. These
 * helpers group such variants under one canonical label.
 */

/** Comparison key: accents, case and repeated/edge whitespace are ignored. */
export function normalizePersonName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function samePerson(a: string | null | undefined, b: string | null | undefined): boolean {
  const key = normalizePersonName(a);
  return key !== "" && key === normalizePersonName(b);
}

const cleanWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

/** Variants that look hand-typed correctly (accents, capitals) win a tie over sloppy lowercase/ASCII ones. */
function richness(value: string): number {
  let score = 0;
  for (const char of value) {
    if (char !== char.toLowerCase()) score += 1;
    if (char.charCodeAt(0) > 127) score += 1;
  }
  return score;
}

/** Maps every name variant's key to the canonical label (the most frequent variant, ties broken by richness). */
export function buildPersonNameMap(names: Iterable<string | null | undefined>): Map<string, string> {
  const groups = new Map<string, Map<string, number>>();
  for (const raw of names) {
    const label = cleanWhitespace(raw ?? "");
    const key = normalizePersonName(label);
    if (!key) continue;
    const variants = groups.get(key) ?? new Map<string, number>();
    variants.set(label, (variants.get(label) ?? 0) + 1);
    groups.set(key, variants);
  }
  const canonical = new Map<string, string>();
  for (const [key, variants] of groups) {
    const best = Array.from(variants).sort(
      (a, b) => b[1] - a[1] || richness(b[0]) - richness(a[0]) || a[0].localeCompare(b[0], "pt-BR")
    )[0][0];
    canonical.set(key, best);
  }
  return canonical;
}

/** Distinct canonical names, sorted for display. */
export function uniquePersonNames(names: Iterable<string | null | undefined>): string[] {
  return Array.from(buildPersonNameMap(names).values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Returns the records with `authorName` replaced by its canonical label. In-memory only; nothing is written back. */
export function canonicalizeAuthorNames<T extends { authorName?: string | null }>(records: T[]): T[] {
  const canonical = buildPersonNameMap(records.map((record) => record.authorName));
  return records.map((record) => {
    if (!record.authorName) return record;
    const label = canonical.get(normalizePersonName(record.authorName));
    return label && label !== record.authorName ? { ...record, authorName: label } : record;
  });
}

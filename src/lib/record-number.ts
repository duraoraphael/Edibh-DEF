const RECORD_NUMBER_PATTERN = /^(\d+)(?:\/(\d{4}))?$/;

/** Numeric ordering for both "NNN/YYYY" and legacy bare numbers. */
export function compareRecordNumbers(a?: string, b?: string): number {
  const parse = (value?: string) => {
    const raw = value?.trim() || "";
    const match = RECORD_NUMBER_PATTERN.exec(raw);
    return match
      ? { valid: true, sequence: Number(match[1]), year: match[2] ? Number(match[2]) : 0, raw }
      : { valid: false, sequence: 0, year: 0, raw };
  };
  const left = parse(a);
  const right = parse(b);
  if (left.valid && right.valid) {
    return left.year - right.year || left.sequence - right.sequence || left.raw.localeCompare(right.raw);
  }
  if (left.valid !== right.valid) return left.valid ? -1 : 1;
  return left.raw.localeCompare(right.raw, "pt-BR", { numeric: true, sensitivity: "base" });
}

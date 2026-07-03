import { createHash } from 'node:crypto';

export function stableSortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableSortValue(item));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return entries.reduce<Record<string, unknown>>((acc, [key, nested]) => {
      acc[key] = stableSortValue(nested);
      return acc;
    }, {});
  }

  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableSortValue(value), null, 2);
}

export function computeVersion(value: unknown): string {
  const digest = createHash('sha256').update(stableStringify(value)).digest('hex');
  return digest.slice(0, 16);
}

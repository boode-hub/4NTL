/**
 * Defensive readers for third-party JSON. API responses are untrusted input:
 * every field is type-checked before use, and missing fields degrade to "absent".
 */
import type { Fact } from '../core/result';

export function obj(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const MAX_FACT_LENGTH = 160;

/** Builds the fact list, dropping empty values and truncating overlong ones. */
export function facts(
  ...pairs: readonly (readonly [label: string, value: string | undefined])[]
): Fact[] {
  return pairs.flatMap(([label, value]) => {
    if (!value) return [];
    const trimmed =
      value.length > MAX_FACT_LENGTH ? `${value.slice(0, MAX_FACT_LENGTH - 1)}…` : value;
    return [{ label, value: trimmed }];
  });
}

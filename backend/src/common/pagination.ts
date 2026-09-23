import { BadRequestException } from '@nestjs/common';

// One page of a collection. The echoed limit and offset let a caller see what
// was actually applied, which matters because an oversized limit is clamped
// rather than refused.
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface PageParams {
  limit?: string;
  offset?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Reads limit and offset from the query string. A collection that grows with
// use (audit entries, notifications) would otherwise be returned whole on every
// read, so the cap is the point: a caller cannot ask for everything at once,
// and asking for too much quietly gets the maximum instead of an error.
export function parsePage(
  params: PageParams,
  defaults: { limit?: number; max?: number } = {},
): { limit: number; offset: number } {
  const max = defaults.max ?? MAX_LIMIT;
  const limit = positiveInt(
    params.limit,
    defaults.limit ?? DEFAULT_LIMIT,
    'limit',
  );
  const offset = positiveInt(params.offset, 0, 'offset');
  return { limit: Math.min(limit, max), offset };
}

export function pageOf<T>(
  items: T[],
  total: number,
  page: { limit: number; offset: number },
): Page<T> {
  return { items, total, limit: page.limit, offset: page.offset };
}

function positiveInt(
  raw: string | undefined,
  fallback: number,
  field: string,
): number {
  // Trimmed first: Number(' ') is 0, so a whitespace-only value would otherwise
  // read as a deliberate zero and return an empty page.
  const trimmed = raw?.trim();
  if (trimmed === undefined || trimmed === '') {
    return fallback;
  }
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestException(
      `${field} must be a whole number of zero or more.`,
    );
  }
  return value;
}

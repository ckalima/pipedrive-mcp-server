/**
 * Pagination utilities for Pipedrive API responses
 */

export interface PaginationInfo {
  next_cursor?: string;
  has_more: boolean;
}

/**
 * Extracts pagination info from Pipedrive v2 API response
 */
export function extractPaginationV2(response: {
  additional_data?: {
    next_cursor?: string;
  };
  data?: unknown; // extractor only uses additional_data; data shape varies (array for list, object for search)
}): PaginationInfo {
  return {
    next_cursor: response.additional_data?.next_cursor,
    has_more: !!response.additional_data?.next_cursor,
  };
}

/** The v1 pagination fields, which arrive in one of two shapes (see below). */
interface PaginationFieldsV1 {
  more_items_in_collection?: boolean;
  next_start?: number;
  start?: number;
  limit?: number;
}

/**
 * Extracts pagination info from Pipedrive v1 API response.
 *
 * v1 has TWO pagination shapes and this repo calls endpoints of both kinds:
 *   - wrapped: `additional_data.pagination.{start,limit,more_items_in_collection,next_start}`
 *     (notes, mail) — the shape most of v1 uses.
 *   - flat: `additional_data.{start,limit,more_items_in_collection}` with NO wrapper
 *     and NO next_start (GET /leads, per docs/api/openapi-v1.yaml).
 * Reading only the wrapped shape left every leads list reporting `has_more: false`
 * with no cursor, so a collection larger than one page was silently truncated.
 *
 * When the shape omits `next_start` it is synthesized as `start + limit` — the same
 * offset the wrapped shape reports, and exactly what `buildPaginationParamsV1` sends
 * back as `start`. It is synthesized only when there IS a next page and both operands
 * are present, so a missing field can never fabricate a cursor.
 */
export function extractPaginationV1(response: {
  additional_data?: PaginationFieldsV1 & { pagination?: PaginationFieldsV1 };
}): PaginationInfo {
  const fields: PaginationFieldsV1 | undefined =
    response.additional_data?.pagination ?? response.additional_data;
  const has_more = fields?.more_items_in_collection ?? false;
  const next_start = fields?.next_start ?? synthesizeNextStart(fields, has_more);

  return {
    next_cursor: next_start?.toString(),
    has_more,
  };
}

/** `start + limit`, but only when there is a next page and both values are numbers. */
function synthesizeNextStart(
  fields: PaginationFieldsV1 | undefined,
  has_more: boolean,
): number | undefined {
  if (!has_more || typeof fields?.start !== "number" || typeof fields.limit !== "number") {
    return undefined;
  }
  return fields.start + fields.limit;
}

/**
 * Builds pagination query parameters for v2 API
 */
export function buildPaginationParamsV2(
  cursor?: string,
  limit: number = 50
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(limit, 100)));
  if (cursor) {
    params.set("cursor", cursor);
  }
  return params;
}

/**
 * Builds pagination query parameters for v1 API
 */
export function buildPaginationParamsV1(
  start?: number,
  limit: number = 50
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(limit, 500)));
  if (start !== undefined) {
    params.set("start", String(start));
  }
  return params;
}

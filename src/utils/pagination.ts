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

/**
 * Extracts pagination info from Pipedrive v1 API response
 */
export function extractPaginationV1(response: {
  additional_data?: {
    pagination?: {
      more_items_in_collection?: boolean;
      next_start?: number;
    };
  };
}): PaginationInfo {
  const pagination = response.additional_data?.pagination;
  return {
    next_cursor: pagination?.next_start?.toString(),
    has_more: pagination?.more_items_in_collection ?? false,
  };
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

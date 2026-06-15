/**
 * Fetch mocking utilities for Pipedrive API tests
 */

import { vi } from 'vitest';

export interface MockResponseOptions {
  status?: number;
  ok?: boolean;
  data?: unknown;
  error?: string;
  /**
   * Extra response headers (case-insensitive). Used by the resilience suite to set
   * `Retry-After` / `x-ratelimit-reset` so the retry driver's honored-wait path can
   * be exercised. Merged after the default `Content-Type: application/json`.
   */
  headers?: Record<string, string>;
  additional_data?: {
    pagination?: {
      more_items_in_collection?: boolean;
      next_start?: number;
    };
    next_cursor?: string;
  };
}

/**
 * Creates a mock fetch response
 */
export function createMockResponse(options: MockResponseOptions = {}): Response {
  const {
    status = 200,
    ok = status >= 200 && status < 300,
    data,
    error,
    headers: extraHeaders,
    additional_data,
  } = options;

  const body = error
    ? { success: false, error }
    : { success: true, data, additional_data };

  return {
    ok,
    status,
    statusText: getStatusText(status),
    headers: new Headers({ 'Content-Type': 'application/json', ...extraHeaders }),
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone: function() { return this; },
  } as Response;
}

/**
 * Creates a mock fetch function that returns specified responses
 */
export function createMockFetch(responses: MockResponseOptions | MockResponseOptions[]) {
  const responseArray = Array.isArray(responses) ? responses : [responses];
  let callIndex = 0;

  return vi.fn(async (_url: string | URL, _init?: RequestInit): Promise<Response> => {
    const responseOptions = responseArray[Math.min(callIndex++, responseArray.length - 1)];
    return createMockResponse(responseOptions);
  });
}

/**
 * Sets up global fetch mock with specified response
 */
export function mockFetch(responses: MockResponseOptions | MockResponseOptions[]) {
  const mockFn = createMockFetch(responses);
  vi.stubGlobal('fetch', mockFn);
  return mockFn;
}

/**
 * Sets up global fetch mock to simulate network error
 */
export function mockFetchNetworkError(errorMessage = 'Network error') {
  const mockFn = vi.fn(async (): Promise<Response> => {
    throw new Error(errorMessage);
  });
  vi.stubGlobal('fetch', mockFn);
  return mockFn;
}

/**
 * Creates standard API success response
 */
export function mockApiSuccess<T>(data: T, additionalData?: MockResponseOptions['additional_data']) {
  return mockFetch({
    status: 200,
    data,
    additional_data: additionalData,
  });
}

/**
 * Creates standard API error response. Optional headers let rate-limit suites
 * attach `Retry-After` / `x-ratelimit-reset` to a 429/503.
 */
export function mockApiError(status: number, error: string, headers?: Record<string, string>) {
  return mockFetch({
    status,
    ok: false,
    error,
    headers,
  });
}

/**
 * Helper to get status text for common codes
 */
function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
  };
  return statusTexts[status] || 'Unknown';
}

/**
 * Common response fixtures
 */
export const fixtures = {
  deal: {
    id: 1,
    title: 'Test Deal',
    value: 10000,
    currency: 'USD',
    status: 'open',
    stage_id: 1,
    pipeline_id: 1,
    person_id: 1,
    org_id: 1,
    owner_id: 1,
    add_time: '2024-01-01T00:00:00Z',
    update_time: '2024-01-01T00:00:00Z',
  },
  person: {
    id: 1,
    name: 'John Doe',
    emails: [{ value: 'john@example.com', primary: true }],
    phones: [{ value: '+1234567890', primary: true }],
    org_id: 1,
    owner_id: 1,
    add_time: '2024-01-01T00:00:00Z',
    update_time: '2024-01-01T00:00:00Z',
  },
  organization: {
    id: 1,
    name: 'Test Organization',
    address: '123 Main St',
    owner_id: 1,
    people_count: 5,
    open_deals_count: 3,
    add_time: '2024-01-01T00:00:00Z',
    update_time: '2024-01-01T00:00:00Z',
  },
  activity: {
    id: 1,
    subject: 'Test Activity',
    type: 'call',
    due_date: '2024-01-15',
    due_time: '10:00',
    done: false,
    person_id: 1,
    deal_id: 1,
    org_id: 1,
    owner_id: 1,
    add_time: '2024-01-01T00:00:00Z',
    update_time: '2024-01-01T00:00:00Z',
  },
  user: {
    id: 1,
    name: 'Test User',
    email: 'user@example.com',
    active_flag: true,
    is_admin: false,
  },
  pipeline: {
    id: 1,
    name: 'Sales Pipeline',
    url_title: 'sales-pipeline',
    order_nr: 1,
    active: true,
  },
  stage: {
    id: 1,
    name: 'Lead',
    pipeline_id: 1,
    order_nr: 1,
    active_flag: true,
  },
  note: {
    id: 1,
    content: '<p>Test note content</p>',
    deal_id: 1,
    person_id: 1,
    org_id: 1,
    user_id: 1,
    pinned_to_deal_flag: false,
    pinned_to_person_flag: false,
    pinned_to_organization_flag: false,
    add_time: '2024-01-01 00:00:00',
    update_time: '2024-01-01 00:00:00',
  },
  lead: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Test Lead',
    value: { amount: 5000, currency: 'USD' },
    person_id: 1,
    organization_id: null,
    owner_id: 1,
    expected_close_date: '2024-12-31',
    is_archived: false,
    add_time: '2024-01-01T00:00:00Z',
    update_time: '2024-01-01T00:00:00Z',
  },
};

/**
 * Pagination fixtures
 */
export const paginationFixtures = {
  v2WithMore: {
    next_cursor: 'cursor_abc123',
  },
  v2NoMore: undefined,
  v1WithMore: {
    pagination: {
      more_items_in_collection: true,
      next_start: 50,
    },
  },
  v1NoMore: {
    pagination: {
      more_items_in_collection: false,
    },
  },
};

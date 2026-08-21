/**
 * Tests for utils/pagination.ts
 */

import { describe, it, expect } from 'vitest';
import {
  extractPaginationV2,
  extractPaginationV1,
  buildPaginationParamsV2,
  buildPaginationParamsV1,
} from '../../../src/utils/pagination.js';

describe('pagination', () => {
  describe('extractPaginationV2', () => {
    it('should extract pagination when cursor is present', () => {
      const response = {
        additional_data: {
          next_cursor: 'abc123',
        },
        data: [{}, {}, {}],
      };

      const result = extractPaginationV2(response);

      expect(result).toEqual({
        next_cursor: 'abc123',
        has_more: true,
      });
    });

    it('should indicate no more items when cursor is absent', () => {
      const response = {
        additional_data: {},
        data: [{}, {}],
      };

      const result = extractPaginationV2(response);

      expect(result).toEqual({
        next_cursor: undefined,
        has_more: false,
      });
    });

    it('should handle missing additional_data', () => {
      const response = {
        data: [{}],
      };

      const result = extractPaginationV2(response);

      expect(result).toEqual({
        next_cursor: undefined,
        has_more: false,
      });
    });

    it('should handle empty response', () => {
      const response = {};

      const result = extractPaginationV2(response);

      expect(result).toEqual({
        next_cursor: undefined,
        has_more: false,
      });
    });
  });

  describe('extractPaginationV1', () => {
    it('should extract pagination when more items exist', () => {
      const response = {
        additional_data: {
          pagination: {
            more_items_in_collection: true,
            next_start: 50,
          },
        },
      };

      const result = extractPaginationV1(response);

      expect(result).toEqual({
        next_cursor: '50',
        has_more: true,
      });
    });

    it('should indicate no more items when more_items_in_collection is false', () => {
      const response = {
        additional_data: {
          pagination: {
            more_items_in_collection: false,
          },
        },
      };

      const result = extractPaginationV1(response);

      expect(result).toEqual({
        next_cursor: undefined,
        has_more: false,
      });
    });

    it('should handle missing pagination object', () => {
      const response = {
        additional_data: {},
      };

      const result = extractPaginationV1(response);

      expect(result).toEqual({
        next_cursor: undefined,
        has_more: false,
      });
    });

    it('should handle missing additional_data', () => {
      const response = {};

      const result = extractPaginationV1(response);

      expect(result).toEqual({
        next_cursor: undefined,
        has_more: false,
      });
    });

    it('should convert next_start to string', () => {
      const response = {
        additional_data: {
          pagination: {
            more_items_in_collection: true,
            next_start: 100,
          },
        },
      };

      const result = extractPaginationV1(response);

      expect(typeof result.next_cursor).toBe('string');
      expect(result.next_cursor).toBe('100');
    });

    // docs/api/openapi-v1.yaml documents a FLAT additional_data for GET /leads (no
    // `pagination` wrapper, no next_start). A 2026-07-22 live probe against a seeded
    // account showed the API does NOT do this: /leads returns the wrapped shape with a
    // correct next_start, identical to /persons. These cases therefore pin defensive
    // tolerance of a shape the spec describes but no endpoint is known to emit - not a
    // fix for observed breakage. Do not cite them as evidence /leads is flat.
    describe('flat additional_data shape (spec-documented, not observed live)', () => {
      it('reads more_items_in_collection from a flat additional_data', () => {
        const response = {
          additional_data: { start: 0, limit: 50, more_items_in_collection: true },
        };

        expect(extractPaginationV1(response)).toEqual({
          next_cursor: '50',
          has_more: true,
        });
      });

      it('synthesizes next_start as start + limit on later pages', () => {
        const response = {
          additional_data: { start: 50, limit: 25, more_items_in_collection: true },
        };

        expect(extractPaginationV1(response)).toEqual({
          next_cursor: '75',
          has_more: true,
        });
      });

      it('returns no cursor on the last flat page', () => {
        const response = {
          additional_data: { start: 50, limit: 50, more_items_in_collection: false },
        };

        expect(extractPaginationV1(response)).toEqual({
          next_cursor: undefined,
          has_more: false,
        });
      });

      it('does not fabricate a cursor when start or limit is missing', () => {
        expect(extractPaginationV1({ additional_data: { limit: 50, more_items_in_collection: true } }))
          .toEqual({ next_cursor: undefined, has_more: true });
        expect(extractPaginationV1({ additional_data: { start: 0, more_items_in_collection: true } }))
          .toEqual({ next_cursor: undefined, has_more: true });
      });

      it('prefers the wrapped shape when both are present', () => {
        const response = {
          additional_data: {
            start: 0,
            limit: 50,
            more_items_in_collection: false,
            pagination: { start: 0, limit: 50, more_items_in_collection: true, next_start: 50 },
          },
        };

        expect(extractPaginationV1(response)).toEqual({
          next_cursor: '50',
          has_more: true,
        });
      });

      it('synthesizes next_start for a wrapped shape that omits it', () => {
        const response = {
          additional_data: {
            pagination: { start: 100, limit: 100, more_items_in_collection: true },
          },
        };

        expect(extractPaginationV1(response)).toEqual({
          next_cursor: '200',
          has_more: true,
        });
      });
    });

    it('should handle next_start of 0', () => {
      const response = {
        additional_data: {
          pagination: {
            more_items_in_collection: true,
            next_start: 0,
          },
        },
      };

      const result = extractPaginationV1(response);

      expect(result.next_cursor).toBe('0');
      expect(result.has_more).toBe(true);
    });
  });

  describe('buildPaginationParamsV2', () => {
    it('should build params with default limit', () => {
      const params = buildPaginationParamsV2();

      expect(params.get('limit')).toBe('50');
      expect(params.has('cursor')).toBe(false);
    });

    it('should include cursor when provided', () => {
      const params = buildPaginationParamsV2('abc123');

      expect(params.get('cursor')).toBe('abc123');
      expect(params.get('limit')).toBe('50');
    });

    it('should use custom limit', () => {
      const params = buildPaginationParamsV2(undefined, 25);

      expect(params.get('limit')).toBe('25');
    });

    it('should cap limit at 100', () => {
      const params = buildPaginationParamsV2(undefined, 200);

      expect(params.get('limit')).toBe('100');
    });

    it('should accept limit of exactly 100', () => {
      const params = buildPaginationParamsV2(undefined, 100);

      expect(params.get('limit')).toBe('100');
    });

    it('should handle cursor with limit', () => {
      const params = buildPaginationParamsV2('cursor_xyz', 75);

      expect(params.get('cursor')).toBe('cursor_xyz');
      expect(params.get('limit')).toBe('75');
    });
  });

  describe('buildPaginationParamsV1', () => {
    it('should build params with default limit', () => {
      const params = buildPaginationParamsV1();

      expect(params.get('limit')).toBe('50');
      expect(params.has('start')).toBe(false);
    });

    it('should include start when provided', () => {
      const params = buildPaginationParamsV1(100);

      expect(params.get('start')).toBe('100');
      expect(params.get('limit')).toBe('50');
    });

    it('should use custom limit', () => {
      const params = buildPaginationParamsV1(undefined, 200);

      expect(params.get('limit')).toBe('200');
    });

    it('should cap limit at 500', () => {
      const params = buildPaginationParamsV1(undefined, 1000);

      expect(params.get('limit')).toBe('500');
    });

    it('should accept limit of exactly 500', () => {
      const params = buildPaginationParamsV1(undefined, 500);

      expect(params.get('limit')).toBe('500');
    });

    it('should handle start of 0', () => {
      const params = buildPaginationParamsV1(0);

      // 0 is a valid start value and should be set
      expect(params.has('start')).toBe(true);
      expect(params.get('start')).toBe('0');
    });

    it('should handle start and limit together', () => {
      const params = buildPaginationParamsV1(50, 100);

      expect(params.get('start')).toBe('50');
      expect(params.get('limit')).toBe('100');
    });
  });
});

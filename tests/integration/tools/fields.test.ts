/**
 * Integration tests for tools/fields.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockApiSuccess,
  mockApiError,
  mockFetch,
} from '../../helpers/mockFetch.js';
import { createFieldFixture, paginationFixtures } from '../../helpers/fixtures.js';

async function getFieldsTools() {
  return import('../../../src/tools/fields.js');
}

describe('fields tools', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listOrganizationFields', () => {
    it('should return list of organization fields', async () => {
      const fields = [
        createFieldFixture('name', 'Name', 'varchar'),
        createFieldFixture('address', 'Address', 'address'),
      ];
      mockApiSuccess(fields);
      const { listOrganizationFields } = await getFieldsTools();

      const result = await listOrganizationFields({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('2');
      expect(parsed.summary).toContain('field');
      expect(parsed.data).toHaveLength(2);
    });

    it('should use v2 API', async () => {
      const mockFn = mockApiSuccess([]);
      const { listOrganizationFields } = await getFieldsTools();

      await listOrganizationFields({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/organizationFields');
    });

    it('should pass cursor pagination parameters', async () => {
      const mockFn = mockApiSuccess([]);
      const { listOrganizationFields } = await getFieldsTools();

      await listOrganizationFields({ cursor: 'abc', limit: 100 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=abc');
      expect(url).toContain('limit=100');
    });

    it('should include cursor in pagination response', async () => {
      mockApiSuccess(
        [createFieldFixture('name', 'Name', 'varchar')],
        paginationFixtures.v2WithMore,
      );
      const { listOrganizationFields } = await getFieldsTools();

      const result = await listOrganizationFields({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
      expect(parsed.pagination.has_more).toBe(true);
    });
  });

  describe('listDealFields', () => {
    it('should return list of deal fields', async () => {
      const fields = [
        createFieldFixture('title', 'Title', 'varchar'),
        createFieldFixture('value', 'Value', 'monetary'),
        createFieldFixture('status', 'Status', 'enum'),
      ];
      mockApiSuccess(fields);
      const { listDealFields } = await getFieldsTools();

      const result = await listDealFields({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('3');
      expect(parsed.summary).toContain('field');
    });

    it('should use v2 API', async () => {
      const mockFn = mockApiSuccess([]);
      const { listDealFields } = await getFieldsTools();

      await listDealFields({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/dealFields');
    });

    it('should include cursor in pagination response', async () => {
      mockApiSuccess(
        [createFieldFixture('title', 'Title', 'varchar')],
        paginationFixtures.v2WithMore,
      );
      const { listDealFields } = await getFieldsTools();

      const result = await listDealFields({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
      expect(parsed.pagination.has_more).toBe(true);
    });
  });

  describe('listPersonFields', () => {
    it('should return list of person fields', async () => {
      const fields = [
        createFieldFixture('name', 'Name', 'varchar'),
        createFieldFixture('email', 'Email', 'email'),
        createFieldFixture('phone', 'Phone', 'phone'),
      ];
      mockApiSuccess(fields);
      const { listPersonFields } = await getFieldsTools();

      const result = await listPersonFields({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('3');
      expect(parsed.summary).toContain('field');
    });

    it('should use v2 API', async () => {
      const mockFn = mockApiSuccess([]);
      const { listPersonFields } = await getFieldsTools();

      await listPersonFields({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/personFields');
    });

    it('should include cursor in pagination response', async () => {
      mockApiSuccess(
        [createFieldFixture('name', 'Name', 'varchar')],
        paginationFixtures.v2WithMore,
      );
      const { listPersonFields } = await getFieldsTools();

      const result = await listPersonFields({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
      expect(parsed.pagination.has_more).toBe(true);
    });
  });

  describe('getField', () => {
    it('should return single deal field from list', async () => {
      // getField paginates all fields and finds by key
      const fields = [
        { ...createFieldFixture('title', 'Title', 'varchar'), key: 'title' },
        { ...createFieldFixture('value', 'Deal Value', 'monetary'), key: 'value' },
      ];
      mockApiSuccess(fields);
      const { getField } = await getFieldsTools();

      const result = await getField({ entity_type: 'deal', key: 'value' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('value');
      expect(parsed.data.name).toBe('Deal Value');
    });

    it('should return single person field from list', async () => {
      const fields = [
        { ...createFieldFixture('name', 'Name', 'varchar'), key: 'name' },
        { ...createFieldFixture('email', 'Email', 'email'), key: 'email' },
      ];
      mockApiSuccess(fields);
      const { getField } = await getFieldsTools();

      const result = await getField({ entity_type: 'person', key: 'email' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('email');
    });

    it('should return single organization field from list', async () => {
      const fields = [
        { ...createFieldFixture('name', 'Organization Name', 'varchar'), key: 'name' },
      ];
      mockApiSuccess(fields);
      const { getField } = await getFieldsTools();

      const result = await getField({ entity_type: 'organization', key: 'name' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('name');
    });

    it('should use v2 API endpoint for deal/person/organization entity types', async () => {
      const { getField } = await getFieldsTools();

      // Test deal fields endpoint
      let mockFn = mockApiSuccess([{ key: 'mykey', name: 'Name', field_type: 'varchar' }]);
      await getField({ entity_type: 'deal', key: 'mykey' });
      expect(mockFn.mock.calls[0][0]).toContain('/api/v2/dealFields');

      // Test person fields endpoint
      vi.unstubAllGlobals();
      mockFn = mockApiSuccess([{ key: 'mykey', name: 'Name', field_type: 'varchar' }]);
      await getField({ entity_type: 'person', key: 'mykey' });
      expect(mockFn.mock.calls[0][0]).toContain('/api/v2/personFields');

      // Test organization fields endpoint
      vi.unstubAllGlobals();
      mockFn = mockApiSuccess([{ key: 'mykey', name: 'Name', field_type: 'varchar' }]);
      await getField({ entity_type: 'organization', key: 'mykey' });
      expect(mockFn.mock.calls[0][0]).toContain('/api/v2/organizationFields');
    });

    it('should use v2 API endpoint for product/activity/project entity types', async () => {
      const { getField } = await getFieldsTools();

      let mockFn = mockApiSuccess([{ key: 'mykey', name: 'Name', field_type: 'varchar' }]);
      await getField({ entity_type: 'product', key: 'mykey' });
      expect(mockFn.mock.calls[0][0]).toContain('/api/v2/productFields');
      expect(mockFn.mock.calls[0][0]).not.toContain('/v1/');

      vi.unstubAllGlobals();
      mockFn = mockApiSuccess([{ key: 'mykey', name: 'Name', field_type: 'varchar' }]);
      await getField({ entity_type: 'activity', key: 'mykey' });
      expect(mockFn.mock.calls[0][0]).toContain('/api/v2/activityFields');
      expect(mockFn.mock.calls[0][0]).not.toContain('/v1/');

      vi.unstubAllGlobals();
      mockFn = mockApiSuccess([{ key: 'mykey', name: 'Name', field_type: 'varchar' }]);
      await getField({ entity_type: 'project', key: 'mykey' });
      expect(mockFn.mock.calls[0][0]).toContain('/api/v2/projectFields');
      expect(mockFn.mock.calls[0][0]).not.toContain('/v1/');
    });

    it('should handle field not found in list', async () => {
      mockApiSuccess([{ key: 'other', name: 'Other Field', field_type: 'varchar' }]);
      const { getField } = await getFieldsTools();

      const result = await getField({ entity_type: 'deal', key: 'nonexistent' });

      expect(result.content[0].text).toContain('not found');
    });

    it('should find a field that would be on page 2 (regression: page-1 bug)', async () => {
      // Build 50 fields for page 1 - none of them have the target key
      const page1Fields = Array.from({ length: 50 }, (_, i) => ({
        ...createFieldFixture(`field_${i}`, `Field ${i}`, 'varchar'),
        key: `field_${i}`,
      }));

      // Page 2 has our target field
      const page2Fields = [
        { ...createFieldFixture('custom_hash_abc', 'My Custom Field', 'varchar'), key: 'custom_hash_abc' },
      ];

      // First fetch returns 50 fields with a next_cursor; second fetch returns page 2 (no more)
      mockFetch([
        { data: page1Fields, additional_data: { next_cursor: 'page2cursor' } },
        { data: page2Fields, additional_data: undefined },
      ]);

      const { getField } = await getFieldsTools();

      const result = await getField({ entity_type: 'deal', key: 'custom_hash_abc' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.name).toBe('My Custom Field');
      expect(parsed.data.key).toBe('custom_hash_abc');

      // Verify two fetch calls were made (field was on page 2)
      const fetchMock = vi.mocked(global.fetch);
      expect(fetchMock.mock.calls.length).toBe(2);
    });

    it('should paginate product fields via v2 cursor across pages', async () => {
      const page1 = Array.from({ length: 50 }, (_, i) => ({
        ...createFieldFixture(`p_${i}`, `P ${i}`, 'varchar'), key: `p_${i}`,
      }));
      const page2 = [{ ...createFieldFixture('target', 'Target Field', 'varchar'), key: 'target' }];

      mockFetch([
        { data: page1, additional_data: { next_cursor: 'page2cursor' } },
        { data: page2, additional_data: undefined },
      ]);
      const { getField } = await getFieldsTools();

      const result = await getField({ entity_type: 'product', key: 'target' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.name).toBe('Target Field');

      const fetchMock = vi.mocked(global.fetch);
      expect(fetchMock.mock.calls.length).toBe(2);
      // both calls must be v2 and carry a v2 cursor on page 2 (not a v1 ?start=)
      expect(fetchMock.mock.calls[0][0]).toContain('/api/v2/productFields');
      expect(fetchMock.mock.calls[1][0]).toContain('cursor=page2cursor');
      expect(fetchMock.mock.calls[1][0]).not.toContain('start=');
    });

    it('should handle API error during getField', async () => {
      mockApiError(401, 'Unauthorized');
      const { getField } = await getFieldsTools();

      const result = await getField({ entity_type: 'deal', key: 'some_key' });

      expect(result.content[0].text).toContain('INVALID_API_KEY');
      expect(result.isError).toBe(true);
    });
  });
});

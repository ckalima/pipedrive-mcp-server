/**
 * Integration tests for the field write handlers (U3: deal/person/organization,
 * U4: product). Verifies HTTP method/endpoint/version, v2 body shapes, the
 * field_code path round-trip, the options sub-verbs (array / body-bearing
 * DELETE), and the destructive-operation guard.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import { mockApiSuccess, mockApiError } from '../../helpers/mockFetch.js';

/** A realistic server-generated 40-character field_code hash. */
const HASH = '946947d1b02fd3ef20798d6112ec5d895a686a21';

// Loosely typed module handle so handlers can be addressed by name across entities.
async function getFieldsTools(): Promise<Record<string, (p: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>>> {
  return import('../../../src/tools/fields.js') as unknown as Promise<
    Record<string, (p: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>>
  >;
}

const entities = [
  { name: 'deal', endpoint: 'dealFields', create: 'createDealField', update: 'updateDealField', del: 'deleteDealField', updateOptions: 'updateDealFieldOptions', deleteOptions: 'deleteDealFieldOptions' },
  { name: 'person', endpoint: 'personFields', create: 'createPersonField', update: 'updatePersonField', del: 'deletePersonField', updateOptions: 'updatePersonFieldOptions', deleteOptions: 'deletePersonFieldOptions' },
  { name: 'organization', endpoint: 'organizationFields', create: 'createOrganizationField', update: 'updateOrganizationField', del: 'deleteOrganizationField', updateOptions: 'updateOrganizationFieldOptions', deleteOptions: 'deleteOrganizationFieldOptions' },
  { name: 'product', endpoint: 'productFields', create: 'createProductField', update: 'updateProductField', del: 'deleteProductField', updateOptions: 'updateProductFieldOptions', deleteOptions: 'deleteProductFieldOptions' },
] as const;

describe('field write tools (U3 deal/person/org, U4 product)', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  for (const e of entities) {
    describe(`${e.name} field handlers`, () => {
      it(`create POSTs to v2 /${e.endpoint} with field_name and field_type`, async () => {
        const mockFn = mockApiSuccess({ field_code: HASH, field_name: 'F' });
        const mod = await getFieldsTools();

        await mod[e.create]({ field_name: 'F', field_type: 'varchar' });

        const [url, options] = mockFn.mock.calls[0];
        expect(url).toContain(`/api/v2/${e.endpoint}`);
        expect(url).not.toContain('/v1/');
        expect(options.method).toBe('POST');
        const body = JSON.parse(options.body);
        expect(body.field_name).toBe('F');
        expect(body.field_type).toBe('varchar');
      });

      it('create forwards options when provided', async () => {
        const mockFn = mockApiSuccess({ field_code: HASH });
        const mod = await getFieldsTools();

        await mod[e.create]({
          field_name: 'Priority',
          field_type: 'enum',
          options: [{ label: 'High' }, { label: 'Low' }],
        });

        const body = JSON.parse(mockFn.mock.calls[0][1].body);
        expect(body.options).toEqual([{ label: 'High' }, { label: 'Low' }]);
      });

      it('field_code from the create response threads into the update path (round-trip)', async () => {
        mockApiSuccess({ field_code: HASH, field_name: 'F' });
        const mod = await getFieldsTools();
        const createRes = await mod[e.create]({ field_name: 'F', field_type: 'varchar' });
        const created = JSON.parse(createRes.content[0].text);
        expect(created.data.field_code).toBe(HASH);

        const mockFn = mockApiSuccess({ field_code: HASH });
        await mod[e.update]({ field_code: created.data.field_code, field_name: 'F2' });

        const [url, options] = mockFn.mock.calls[0];
        expect(url).toContain(`/api/v2/${e.endpoint}/${HASH}`);
        expect(options.method).toBe('PATCH');
        const body = JSON.parse(options.body);
        expect(body.field_name).toBe('F2');
        expect(body.field_type).toBeUndefined(); // field_type cannot be changed
      });

      it('delete is blocked and makes NO fetch call when guard is disabled', async () => {
        delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
        const mockFn = vi.fn();
        vi.stubGlobal('fetch', mockFn);
        const mod = await getFieldsTools();

        const result = await mod[e.del]({ field_code: HASH });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
        expect(mockFn).not.toHaveBeenCalled();
      });

      it(`delete DELETEs v2 /${e.endpoint}/{field_code} when enabled`, async () => {
        process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
        const mockFn = mockApiSuccess({ field_code: HASH });
        const mod = await getFieldsTools();

        await mod[e.del]({ field_code: HASH });

        const [url, options] = mockFn.mock.calls[0];
        expect(url).toContain(`/api/v2/${e.endpoint}/${HASH}`);
        expect(options.method).toBe('DELETE');
      });

      it('update-options sends a top-level array body via PATCH to /options', async () => {
        const mockFn = mockApiSuccess([{ id: 4, label: 'Critical' }]);
        const mod = await getFieldsTools();

        await mod[e.updateOptions]({ field_code: HASH, options: [{ id: 4, label: 'Critical' }] });

        const [url, options] = mockFn.mock.calls[0];
        expect(url).toContain(`/api/v2/${e.endpoint}/${HASH}/options`);
        expect(options.method).toBe('PATCH');
        expect(JSON.parse(options.body)).toEqual([{ id: 4, label: 'Critical' }]);
      });

      it('delete-options is blocked and makes NO fetch call when guard is disabled', async () => {
        delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
        const mockFn = vi.fn();
        vi.stubGlobal('fetch', mockFn);
        const mod = await getFieldsTools();

        const result = await mod[e.deleteOptions]({ field_code: HASH, option_ids: [4] });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
        expect(mockFn).not.toHaveBeenCalled();
      });

      it('delete-options sends a body-bearing DELETE carrying [{id}] when enabled', async () => {
        process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
        const mockFn = mockApiSuccess([{ id: 4, label: 'Critical' }]);
        const mod = await getFieldsTools();

        await mod[e.deleteOptions]({ field_code: HASH, option_ids: [4, 5] });

        const [url, options] = mockFn.mock.calls[0];
        expect(url).toContain(`/api/v2/${e.endpoint}/${HASH}/options`);
        expect(options.method).toBe('DELETE');
        expect(JSON.parse(options.body)).toEqual([{ id: 4 }, { id: 5 }]);
      });

      it('create returns isError on API failure', async () => {
        mockApiError(400, 'Invalid');
        const mod = await getFieldsTools();

        const result = await mod[e.create]({ field_name: 'F', field_type: 'varchar' });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('VALIDATION_ERROR');
      });
    });
  }

  // U4: product field update accepts only field_name + ui_visibility (narrower model)
  describe('product field update narrow model', () => {
    it('forwards only field_name and ui_visibility', async () => {
      const mockFn = mockApiSuccess({ field_code: HASH });
      const mod = await getFieldsTools();

      await mod.updateProductField({
        field_code: HASH,
        field_name: 'SKU',
        ui_visibility: { add_visible_flag: true },
      });

      const body = JSON.parse(mockFn.mock.calls[0][1].body);
      expect(body.field_name).toBe('SKU');
      expect(body.ui_visibility).toEqual({ add_visible_flag: true });
      expect(body.description).toBeUndefined();
      expect(body.important_fields).toBeUndefined();
      expect(body.required_fields).toBeUndefined();
    });
  });
});

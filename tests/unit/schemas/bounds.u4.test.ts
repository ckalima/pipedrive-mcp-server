/**
 * U4 (F3) input-size bounds: entity-level regression suite.
 *
 * The bounded primitives themselves are unit-tested in common.test.ts. This
 * suite proves the primitives are actually WIRED THROUGH each entity's real
 * schemas, so a single call cannot drive resource exhaustion via unbounded free
 * text, arrays, or deeply-nested custom_fields.
 *
 * Every rejection test starts from an OTHERWISE-VALID object and violates only
 * the one bound under test — so a failure can never be a false positive caused
 * by a missing required field.
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_QUERY_PARAM_LENGTH,
  MAX_ARRAY_ITEMS,
  MAX_CUSTOM_FIELD_KEYS,
  MAX_CUSTOM_FIELD_VALUE_LENGTH,
  MAX_CUSTOM_FIELD_DEPTH,
} from '../../../src/schemas/common.js';
import { ListDealsSchema, UpdateDealSchema, CreateDealSchema, AddDealProductSchema } from '../../../src/schemas/deals.js';
import { ListPersonsSchema, CreatePersonSchema } from '../../../src/schemas/persons.js';
import { CreateOrganizationSchema } from '../../../src/schemas/organizations.js';
import { CreateProductSchema, ListProductsSchema } from '../../../src/schemas/products.js';
import { CreateActivitySchema } from '../../../src/schemas/activities.js';
import { CreateProjectSchema } from '../../../src/schemas/projects.js';
import { CreateTaskSchema } from '../../../src/schemas/tasks.js';
import { CreateNoteSchema } from '../../../src/schemas/notes.js';
import { ListLeadsSchema, CreateLeadSchema } from '../../../src/schemas/leads.js';
import { CreatePipelineSchema } from '../../../src/schemas/pipelines.js';
import { CreateBoardSchema } from '../../../src/schemas/boards.js';
import { GetFieldSchema, CreateDealFieldSchema, UpdateDealFieldSchema } from '../../../src/schemas/fields.js';

const overText = 'x'.repeat(MAX_TEXT_LENGTH + 1);
const atText = 'x'.repeat(MAX_TEXT_LENGTH);
const overName = 'x'.repeat(MAX_NAME_LENGTH + 1);
const overQuery = 'x'.repeat(MAX_QUERY_PARAM_LENGTH + 1);
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('U4 input-size bounds (entity-level wiring)', () => {
  describe('bounded free text (BoundedTextSchema)', () => {
    it('rejects over-cap note content but accepts at-cap', () => {
      expect(() => CreateNoteSchema.parse({ content: overText })).toThrow();
      expect(CreateNoteSchema.parse({ content: atText }).content).toHaveLength(MAX_TEXT_LENGTH);
    });

    it('rejects over-cap deal line-item comments', () => {
      expect(() => AddDealProductSchema.parse({
        id: 1, product_id: 1, item_price: 1, quantity: 1, comments: overText,
      })).toThrow();
    });

    it('rejects over-cap activity note', () => {
      expect(() => CreateActivitySchema.parse({ subject: 's', type: 'call', note: overText })).toThrow();
    });

    it('rejects over-cap product description', () => {
      expect(() => CreateProductSchema.parse({ name: 'p', description: overText })).toThrow();
    });

    it('rejects over-cap project description', () => {
      expect(() => CreateProjectSchema.parse({
        title: 't', board_id: 1, phase_id: 1, description: overText,
      })).toThrow();
    });

    it('rejects over-cap task description', () => {
      expect(() => CreateTaskSchema.parse({ title: 't', project_id: 1, description: overText })).toThrow();
    });

    it('rejects over-cap deal-field description', () => {
      expect(() => UpdateDealFieldSchema.parse({ field_code: 'title', description: overText })).toThrow();
    });
  });

  describe('bounded short names (BoundedNameSchema)', () => {
    it('rejects over-cap deal lost_reason', () => {
      expect(() => UpdateDealSchema.parse({ id: 1, lost_reason: overName })).toThrow();
    });

    it('rejects over-cap organization address subfield', () => {
      expect(() => CreateOrganizationSchema.parse({ name: 'o', address: { value: overName } })).toThrow();
    });

    it('rejects over-cap pipeline name', () => {
      expect(() => CreatePipelineSchema.parse({ name: overName })).toThrow();
    });

    it('rejects over-cap board name', () => {
      expect(() => CreateBoardSchema.parse({ name: overName })).toThrow();
    });

    it('rejects over-cap project status', () => {
      expect(() => CreateProjectSchema.parse({
        title: 't', board_id: 1, phase_id: 1, status: overName,
      })).toThrow();
    });

    it('rejects over-cap field key (reflected in summary/error text)', () => {
      expect(() => GetFieldSchema.parse({ entity_type: 'deal', key: overName })).toThrow();
    });
  });

  describe('bounded query passthrough (BoundedQueryParamSchema)', () => {
    it('rejects over-cap deal ids list', () => {
      expect(() => ListDealsSchema.parse({ ids: overQuery })).toThrow();
    });

    it('rejects over-cap person include_fields', () => {
      expect(() => ListPersonsSchema.parse({ include_fields: overQuery })).toThrow();
    });

    it('rejects over-cap lead sort', () => {
      expect(() => ListLeadsSchema.parse({ sort: overQuery })).toThrow();
    });
  });

  describe('inherited base bounds (cursor, activity type)', () => {
    it('rejects an over-cap cursor on a schema that inherits the base (ListProducts)', () => {
      // ListProductsSchema does not override `cursor`, so it relies on the base
      // PaginationParamsSchema bound (mirrors MAX_QUERY_PARAM_LENGTH).
      expect(() => ListProductsSchema.parse({ cursor: overQuery })).toThrow();
    });

    it('accepts an at-cap cursor on the inherited base', () => {
      const atCap = 'x'.repeat(MAX_QUERY_PARAM_LENGTH);
      expect(ListProductsSchema.parse({ cursor: atCap }).cursor).toHaveLength(MAX_QUERY_PARAM_LENGTH);
    });

    it('rejects an over-cap activity type', () => {
      expect(() => CreateActivitySchema.parse({
        subject: 's', type: 'x'.repeat(256),
      })).toThrow();
    });
  });

  describe('bounded arrays (boundedArray)', () => {
    const tooMany = MAX_ARRAY_ITEMS + 1;

    it('rejects over-cap deal label_ids', () => {
      expect(() => CreateDealSchema.parse({
        title: 't', label_ids: Array.from({ length: tooMany }, (_, i) => i),
      })).toThrow();
    });

    it('rejects over-cap project deal_ids', () => {
      expect(() => CreateProjectSchema.parse({
        title: 't', board_id: 1, phase_id: 1,
        deal_ids: Array.from({ length: tooMany }, (_, i) => i + 1),
      })).toThrow();
    });

    it('rejects over-cap product prices', () => {
      expect(() => CreateProductSchema.parse({
        name: 'p', prices: Array.from({ length: tooMany }, () => ({ price: 1 })),
      })).toThrow();
    });

    it('rejects over-cap activity participants', () => {
      expect(() => CreateActivitySchema.parse({
        subject: 's', type: 'call',
        participants: Array.from({ length: tooMany }, (_, i) => ({ person_id: i + 1 })),
      })).toThrow();
    });

    it('rejects over-cap lead label_ids', () => {
      expect(() => CreateLeadSchema.parse({
        title: 't', person_id: 1,
        label_ids: Array.from({ length: tooMany }, () => VALID_UUID),
      })).toThrow();
    });

    it('rejects over-cap deal-field options', () => {
      expect(() => CreateDealFieldSchema.parse({
        field_name: 'f', field_type: 'varchar',
        options: Array.from({ length: tooMany }, () => ({ label: 'x' })),
      })).toThrow();
    });

    it('accepts a person emails array within the cap', () => {
      const result = CreatePersonSchema.parse({
        name: 'p', emails: [{ value: 'a@example.com' }, { value: 'b@example.com' }],
      });
      expect(result.emails).toHaveLength(2);
    });
  });

  describe('bounded custom_fields maps', () => {
    function recordWithKeys(n: number): Record<string, unknown> {
      const rec: Record<string, unknown> = {};
      for (let i = 0; i < n; i++) rec[`k${i}`] = 1;
      return rec;
    }

    it('rejects deal custom_fields with too many keys', () => {
      expect(() => CreateDealSchema.parse({
        title: 't', custom_fields: recordWithKeys(MAX_CUSTOM_FIELD_KEYS + 1),
      })).toThrow();
    });

    it('rejects deal custom_fields nested past the depth cap', () => {
      let deep: unknown = 1;
      for (let i = 0; i < MAX_CUSTOM_FIELD_DEPTH + 1; i++) deep = { nest: deep };
      expect(() => CreateDealSchema.parse({ title: 't', custom_fields: { hash: deep } })).toThrow();
    });

    it('rejects deal custom_fields with an over-size serialized value', () => {
      expect(() => CreateDealSchema.parse({
        title: 't', custom_fields: { hash: 'x'.repeat(MAX_CUSTOM_FIELD_VALUE_LENGTH + 1) },
      })).toThrow();
    });

    it('rejects product custom_fields with too many keys', () => {
      expect(() => CreateProductSchema.parse({
        name: 'p', custom_fields: recordWithKeys(MAX_CUSTOM_FIELD_KEYS + 1),
      })).toThrow();
    });

    it('rejects product custom_fields with an over-size serialized string value', () => {
      expect(() => CreateProductSchema.parse({
        name: 'p', custom_fields: { hash: 'x'.repeat(MAX_CUSTOM_FIELD_VALUE_LENGTH + 1) },
      })).toThrow();
    });

    it('rejects product custom_fields with an over-size serialized array value', () => {
      // The product value type permits string arrays; a huge array must still be
      // caught by the per-value serialized-size cap (F3).
      const hugeArray = Array.from(
        { length: MAX_CUSTOM_FIELD_VALUE_LENGTH }, () => 'xx',
      );
      expect(() => CreateProductSchema.parse({
        name: 'p', custom_fields: { hash: hugeArray },
      })).toThrow();
    });

    it('accepts a normal product custom_fields map', () => {
      const result = CreateProductSchema.parse({
        name: 'p', custom_fields: { hash1: 'value', hash2: 42, hash3: ['a', 'b'] },
      });
      expect(result.custom_fields).toEqual({ hash1: 'value', hash2: 42, hash3: ['a', 'b'] });
    });

    it('accepts a normal deal custom_fields map', () => {
      const result = CreateDealSchema.parse({
        title: 't', custom_fields: { hash1: 'value', hash2: 42 },
      });
      expect(result.custom_fields).toEqual({ hash1: 'value', hash2: 42 });
    });
  });
});

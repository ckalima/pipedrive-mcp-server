/**
 * Tests for the field write schemas (U3: deal/person/organization, U4: product)
 */

import { describe, it, expect } from 'vitest';
import {
  FieldTypeSchema,
  FieldOptionInputSchema,
  FieldCodeSchema,
  CreateDealFieldSchema,
  UpdateDealFieldSchema,
  DeleteDealFieldSchema,
  UpdateDealFieldOptionsSchema,
  DeleteDealFieldOptionsSchema,
  CreatePersonFieldSchema,
  UpdatePersonFieldSchema,
  DeletePersonFieldSchema,
  UpdatePersonFieldOptionsSchema,
  DeletePersonFieldOptionsSchema,
  CreateOrganizationFieldSchema,
  UpdateOrganizationFieldSchema,
  DeleteOrganizationFieldSchema,
  UpdateOrganizationFieldOptionsSchema,
  DeleteOrganizationFieldOptionsSchema,
  CreateProductFieldSchema,
  UpdateProductFieldSchema,
  DeleteProductFieldSchema,
  UpdateProductFieldOptionsSchema,
  DeleteProductFieldOptionsSchema,
} from '../../../src/schemas/fields.js';

/** A realistic server-generated 40-character field_code hash. */
const HASH = '946947d1b02fd3ef20798d6112ec5d895a686a21';

describe('field write schemas — shared building blocks', () => {
  describe('FieldTypeSchema', () => {
    it('accepts the write-allowed field types', () => {
      ['varchar', 'text', 'double', 'enum', 'set', 'monetary', 'date', 'address', 'user'].forEach((t) => {
        expect(FieldTypeSchema.parse(t)).toBe(t);
      });
    });

    it('rejects unsupported field types', () => {
      expect(() => FieldTypeSchema.parse('picture')).toThrow();
      expect(() => FieldTypeSchema.parse('int')).toThrow();
    });
  });

  describe('FieldOptionInputSchema', () => {
    it('accepts a label', () => {
      expect(FieldOptionInputSchema.parse({ label: 'High' })).toEqual({ label: 'High' });
    });

    it('rejects an empty label', () => {
      expect(() => FieldOptionInputSchema.parse({ label: '' })).toThrow();
    });

    it('rejects unknown keys (.strict)', () => {
      expect(() => FieldOptionInputSchema.parse({ label: 'High', id: 1 })).toThrow();
    });
  });

  describe('FieldCodeSchema', () => {
    it('accepts a 40-char hex hash', () => {
      expect(FieldCodeSchema.parse(HASH)).toBe(HASH);
    });

    it('accepts a plain built-in field key', () => {
      expect(FieldCodeSchema.parse('title')).toBe('title');
    });

    it('accepts hyphen and underscore (some built-in keys use them)', () => {
      expect(FieldCodeSchema.parse('add_time')).toBe('add_time');
      expect(FieldCodeSchema.parse('a-b_c')).toBe('a-b_c');
    });

    it('rejects a field_code containing a path separator', () => {
      expect(() => FieldCodeSchema.parse('abc/../deals')).toThrow();
      expect(() => FieldCodeSchema.parse('a/b')).toThrow();
    });

    it('rejects URL-significant chars that new URL() would normalize into path redirection', () => {
      // backslash (rewritten to '/'), dot-segments, query/fragment, percent-encoding,
      // whitespace and control chars all survived the old `/^[^/]+$/` blocklist.
      for (const hostile of ['..', '.', 'a\\b', '..\\..\\pipelines\\7', 'abc?x=1', 'abc#f', '%2e%2e', '%2F', 'a b', 'a\tb', 'a\nb', 'a\0b', 'a:b']) {
        expect(() => FieldCodeSchema.parse(hostile)).toThrow();
      }
    });

    it('rejects an empty field_code', () => {
      expect(() => FieldCodeSchema.parse('')).toThrow();
    });
  });
});

// The deal/person/organization field write schemas are structurally symmetric;
// drive the common behavior from one table, then assert per-entity differences.
const entities = [
  {
    name: 'deal',
    Create: CreateDealFieldSchema,
    Update: UpdateDealFieldSchema,
    Delete: DeleteDealFieldSchema,
    UpdateOptions: UpdateDealFieldOptionsSchema,
    DeleteOptions: DeleteDealFieldOptionsSchema,
  },
  {
    name: 'person',
    Create: CreatePersonFieldSchema,
    Update: UpdatePersonFieldSchema,
    Delete: DeletePersonFieldSchema,
    UpdateOptions: UpdatePersonFieldOptionsSchema,
    DeleteOptions: DeletePersonFieldOptionsSchema,
  },
  {
    name: 'organization',
    Create: CreateOrganizationFieldSchema,
    Update: UpdateOrganizationFieldSchema,
    Delete: DeleteOrganizationFieldSchema,
    UpdateOptions: UpdateOrganizationFieldOptionsSchema,
    DeleteOptions: DeleteOrganizationFieldOptionsSchema,
  },
  {
    name: 'product',
    Create: CreateProductFieldSchema,
    Update: UpdateProductFieldSchema,
    Delete: DeleteProductFieldSchema,
    UpdateOptions: UpdateProductFieldOptionsSchema,
    DeleteOptions: DeleteProductFieldOptionsSchema,
  },
] as const;

for (const e of entities) {
  describe(`${e.name} field write schemas`, () => {
    describe('Create', () => {
      it('rejects missing field_name', () => {
        expect(() => e.Create.parse({ field_type: 'varchar' })).toThrow();
      });

      it('rejects missing field_type', () => {
        expect(() => e.Create.parse({ field_name: 'My Field' })).toThrow();
      });

      it('rejects an unsupported field_type', () => {
        expect(() => e.Create.parse({ field_name: 'My Field', field_type: 'picture' })).toThrow();
      });

      it('accepts a simple varchar field with no optional fields', () => {
        const r = e.Create.parse({ field_name: 'My Field', field_type: 'varchar' });
        expect(r.field_name).toBe('My Field');
        expect(r.field_type).toBe('varchar');
      });

      it('rejects enum without options (superrefine)', () => {
        expect(() => e.Create.parse({ field_name: 'Priority', field_type: 'enum' })).toThrow();
        expect(() => e.Create.parse({ field_name: 'Priority', field_type: 'enum', options: [] })).toThrow();
      });

      it('rejects set without options (superrefine)', () => {
        expect(() => e.Create.parse({ field_name: 'Tags', field_type: 'set' })).toThrow();
      });

      it('accepts enum with options', () => {
        const r = e.Create.parse({
          field_name: 'Priority',
          field_type: 'enum',
          options: [{ label: 'High' }, { label: 'Low' }],
        });
        expect(r.options).toHaveLength(2);
      });

      it('strips unknown / v1-named keys inside ui_visibility (no passthrough leak)', () => {
        const r = e.Create.parse({
          field_name: 'My Field',
          field_type: 'varchar',
          ui_visibility: { add_visible_flag: true, legacy_v1_key: 'leak' },
        }) as { ui_visibility: Record<string, unknown> };
        expect(r.ui_visibility.add_visible_flag).toBe(true);
        expect(r.ui_visibility.legacy_v1_key).toBeUndefined();
      });
    });

    describe('Update', () => {
      it('rejects missing field_code', () => {
        expect(() => e.Update.parse({ field_name: 'X' })).toThrow();
      });

      it('rejects a field_code with a path separator', () => {
        expect(() => e.Update.parse({ field_code: 'a/b', field_name: 'X' })).toThrow();
      });

      it('accepts field_code alone', () => {
        const r = e.Update.parse({ field_code: HASH });
        expect(r.field_code).toBe(HASH);
      });

      it('does not accept field_type (cannot be changed) — it is stripped', () => {
        const r = e.Update.parse({ field_code: HASH, field_type: 'enum' }) as Record<string, unknown>;
        expect(r.field_type).toBeUndefined();
      });
    });

    describe('Delete', () => {
      it('requires field_code', () => {
        expect(() => e.Delete.parse({})).toThrow();
      });

      it('accepts a valid field_code', () => {
        expect(e.Delete.parse({ field_code: HASH }).field_code).toBe(HASH);
      });
    });

    describe('UpdateOptions', () => {
      it('requires at least one option', () => {
        expect(() => e.UpdateOptions.parse({ field_code: HASH, options: [] })).toThrow();
      });

      it('requires id and label on each option', () => {
        expect(() => e.UpdateOptions.parse({ field_code: HASH, options: [{ id: 1 }] })).toThrow();
        expect(() => e.UpdateOptions.parse({ field_code: HASH, options: [{ label: 'X' }] })).toThrow();
      });

      it('accepts a valid options array', () => {
        const r = e.UpdateOptions.parse({ field_code: HASH, options: [{ id: 4, label: 'Critical' }] });
        expect(r.options[0]).toEqual({ id: 4, label: 'Critical' });
      });
    });

    describe('DeleteOptions', () => {
      it('requires at least one option_id', () => {
        expect(() => e.DeleteOptions.parse({ field_code: HASH, option_ids: [] })).toThrow();
      });

      it('rejects non-positive option ids', () => {
        expect(() => e.DeleteOptions.parse({ field_code: HASH, option_ids: [0] })).toThrow();
      });

      it('accepts a valid option_ids array', () => {
        const r = e.DeleteOptions.parse({ field_code: HASH, option_ids: [4, 5] });
        expect(r.option_ids).toEqual([4, 5]);
      });
    });
  });
}

describe('per-entity ui_visibility differences', () => {
  it('deal field ui_visibility keeps show_in_pipelines but strips show_in_add_deal_dialog', () => {
    const r = CreateDealFieldSchema.parse({
      field_name: 'F',
      field_type: 'varchar',
      ui_visibility: {
        show_in_pipelines: { show_in_all: false, pipeline_ids: [1, 2] },
        show_in_add_deal_dialog: { show: true },
      },
    }) as { ui_visibility: Record<string, unknown> };
    expect(r.ui_visibility.show_in_pipelines).toEqual({ show_in_all: false, pipeline_ids: [1, 2] });
    expect(r.ui_visibility.show_in_add_deal_dialog).toBeUndefined();
  });

  it('person field ui_visibility keeps show_in_add_deal_dialog but strips show_in_pipelines', () => {
    const r = CreatePersonFieldSchema.parse({
      field_name: 'F',
      field_type: 'varchar',
      ui_visibility: {
        show_in_add_deal_dialog: { show: true, order: 1 },
        show_in_pipelines: { show_in_all: true },
      },
    }) as { ui_visibility: Record<string, unknown> };
    expect(r.ui_visibility.show_in_add_deal_dialog).toEqual({ show: true, order: 1 });
    expect(r.ui_visibility.show_in_pipelines).toBeUndefined();
  });

  it('organization field ui_visibility keeps show_in_add_person_dialog', () => {
    const r = CreateOrganizationFieldSchema.parse({
      field_name: 'F',
      field_type: 'varchar',
      ui_visibility: { show_in_add_person_dialog: { show: true } },
    }) as { ui_visibility: Record<string, unknown> };
    expect(r.ui_visibility.show_in_add_person_dialog).toEqual({ show: true });
  });

  it('person/org required_fields strips deal-only stage_ids/statuses', () => {
    const r = CreatePersonFieldSchema.parse({
      field_name: 'F',
      field_type: 'varchar',
      required_fields: { enabled: true, stage_ids: [1], statuses: { '1': ['won'] } },
    }) as { required_fields: Record<string, unknown> };
    expect(r.required_fields.enabled).toBe(true);
    expect(r.required_fields.stage_ids).toBeUndefined();
    expect(r.required_fields.statuses).toBeUndefined();
  });

  it('deal required_fields keeps stage_ids and statuses', () => {
    const r = CreateDealFieldSchema.parse({
      field_name: 'F',
      field_type: 'varchar',
      required_fields: { enabled: true, stage_ids: [1, 2], statuses: { '1': ['won', 'lost'] } },
    }) as { required_fields: Record<string, unknown> };
    expect(r.required_fields.stage_ids).toEqual([1, 2]);
    expect(r.required_fields.statuses).toEqual({ '1': ['won', 'lost'] });
  });

  it('only deal fields accept description (person/org strip it)', () => {
    const deal = CreateDealFieldSchema.parse({ field_name: 'F', field_type: 'varchar', description: 'hi' }) as Record<string, unknown>;
    expect(deal.description).toBe('hi');
    const person = CreatePersonFieldSchema.parse({ field_name: 'F', field_type: 'varchar', description: 'hi' }) as Record<string, unknown>;
    expect(person.description).toBeUndefined();
  });
});

describe('product field schema specifics (U4 — narrower model)', () => {
  it('CreateProductFieldSchema strips description / important_fields / required_fields', () => {
    const r = CreateProductFieldSchema.parse({
      field_name: 'SKU',
      field_type: 'varchar',
      description: 'leak',
      important_fields: { enabled: true },
      required_fields: { enabled: true },
    }) as Record<string, unknown>;
    expect(r.description).toBeUndefined();
    expect(r.important_fields).toBeUndefined();
    expect(r.required_fields).toBeUndefined();
  });

  it('product ui_visibility keeps only the two flags', () => {
    const r = CreateProductFieldSchema.parse({
      field_name: 'SKU',
      field_type: 'varchar',
      ui_visibility: { add_visible_flag: true, details_visible_flag: false, show_in_pipelines: { show_in_all: true } },
    }) as { ui_visibility: Record<string, unknown> };
    expect(r.ui_visibility.add_visible_flag).toBe(true);
    expect(r.ui_visibility.details_visible_flag).toBe(false);
    expect(r.ui_visibility.show_in_pipelines).toBeUndefined();
  });

  it('UpdateProductFieldSchema accepts only field_name and ui_visibility', () => {
    const r = UpdateProductFieldSchema.parse({
      field_code: HASH,
      field_name: 'New',
      ui_visibility: { add_visible_flag: false },
      description: 'leak',
      important_fields: { enabled: true },
      required_fields: { enabled: true },
    }) as Record<string, unknown>;
    expect(r.field_name).toBe('New');
    expect(r.ui_visibility).toEqual({ add_visible_flag: false });
    expect(r.description).toBeUndefined();
    expect(r.important_fields).toBeUndefined();
    expect(r.required_fields).toBeUndefined();
  });
});

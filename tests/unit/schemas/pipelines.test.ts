/**
 * Tests for schemas/pipelines.ts
 */

import { describe, it, expect } from 'vitest';
import {
  ListPipelinesSchema,
  ListStagesSchema,
  GetStageSchema,
  CreatePipelineSchema,
  UpdatePipelineSchema,
  DeletePipelineSchema,
  CreateStageSchema,
  UpdateStageSchema,
  DeleteStageSchema,
} from '../../../src/schemas/pipelines.js';

describe('pipelines schemas', () => {
  describe('ListPipelinesSchema', () => {
    it('should apply default limit', () => {
      const result = ListPipelinesSchema.parse({});
      expect(result.limit).toBe(50);
      expect(result.cursor).toBeUndefined();
    });

    it('should accept cursor and limit', () => {
      const result = ListPipelinesSchema.parse({ cursor: 'abc', limit: 25 });
      expect(result.cursor).toBe('abc');
      expect(result.limit).toBe(25);
    });

    it('should reject limit above 100', () => {
      expect(() => ListPipelinesSchema.parse({ limit: 101 })).toThrow();
    });

    it('should reject limit below 1', () => {
      expect(() => ListPipelinesSchema.parse({ limit: 0 })).toThrow();
    });
  });

  describe('ListStagesSchema', () => {
    it('should apply default limit and accept empty object', () => {
      const result = ListStagesSchema.parse({});
      expect(result.limit).toBe(50);
      expect(result.cursor).toBeUndefined();
      expect(result.pipeline_id).toBeUndefined();
    });

    it('should accept pipeline_id', () => {
      const result = ListStagesSchema.parse({ pipeline_id: 1 });
      expect(result.pipeline_id).toBe(1);
    });

    it('should reject non-positive pipeline_id', () => {
      expect(() => ListStagesSchema.parse({ pipeline_id: 0 })).toThrow();
      expect(() => ListStagesSchema.parse({ pipeline_id: -1 })).toThrow();
    });

    it('should reject non-integer pipeline_id', () => {
      expect(() => ListStagesSchema.parse({ pipeline_id: 1.5 })).toThrow();
    });

    it('should accept cursor and limit', () => {
      const result = ListStagesSchema.parse({ cursor: 'abc', limit: 25 });
      expect(result.cursor).toBe('abc');
      expect(result.limit).toBe(25);
    });

    it('should reject limit above 100', () => {
      expect(() => ListStagesSchema.parse({ limit: 101 })).toThrow();
    });

    it('should reject limit below 1', () => {
      expect(() => ListStagesSchema.parse({ limit: 0 })).toThrow();
    });

    it('should accept cursor with pipeline_id', () => {
      const result = ListStagesSchema.parse({ cursor: 'abc', pipeline_id: 2 });
      expect(result.cursor).toBe('abc');
      expect(result.pipeline_id).toBe(2);
    });
  });

  describe('GetStageSchema', () => {
    it('should require id', () => {
      expect(() => GetStageSchema.parse({})).toThrow();
    });

    it('should accept valid id', () => {
      const result = GetStageSchema.parse({ id: 5 });
      expect(result.id).toBe(5);
    });

    it('should reject non-positive id', () => {
      expect(() => GetStageSchema.parse({ id: 0 })).toThrow();
    });

    it('should reject non-integer id', () => {
      expect(() => GetStageSchema.parse({ id: 2.5 })).toThrow();
    });
  });

  // ─── U1: Pipeline write schemas ──────────────────────────────────────────────

  describe('CreatePipelineSchema', () => {
    it('should reject missing name', () => {
      expect(() => CreatePipelineSchema.parse({})).toThrow();
    });

    it('should reject empty name', () => {
      expect(() => CreatePipelineSchema.parse({ name: '' })).toThrow();
    });

    it('should accept name alone', () => {
      const result = CreatePipelineSchema.parse({ name: 'Sales' });
      expect(result.name).toBe('Sales');
      expect(result.is_deal_probability_enabled).toBeUndefined();
    });

    it('should accept is_deal_probability_enabled (v2 name)', () => {
      const result = CreatePipelineSchema.parse({ name: 'Sales', is_deal_probability_enabled: true });
      expect(result.is_deal_probability_enabled).toBe(true);
    });

    it('should reject the v1 deal_probability key (.strict)', () => {
      expect(() => CreatePipelineSchema.parse({ name: 'Sales', deal_probability: true })).toThrow();
    });

    it('should reject the read-only is_deleted field (.strict)', () => {
      expect(() => CreatePipelineSchema.parse({ name: 'Sales', is_deleted: false })).toThrow();
    });

    it('should reject the v1 active field (.strict)', () => {
      expect(() => CreatePipelineSchema.parse({ name: 'Sales', active: true })).toThrow();
    });
  });

  describe('UpdatePipelineSchema', () => {
    it('should reject missing id', () => {
      expect(() => UpdatePipelineSchema.parse({})).toThrow();
    });

    it('should accept id alone (id-only is a valid no-op)', () => {
      const result = UpdatePipelineSchema.parse({ id: 1 });
      expect(result.id).toBe(1);
      expect(result.name).toBeUndefined();
    });

    it('should accept partial update with is_deal_probability_enabled', () => {
      const result = UpdatePipelineSchema.parse({ id: 1, is_deal_probability_enabled: false });
      expect(result.is_deal_probability_enabled).toBe(false);
    });

    it('should reject is_deleted and active (.strict)', () => {
      expect(() => UpdatePipelineSchema.parse({ id: 1, is_deleted: true })).toThrow();
      expect(() => UpdatePipelineSchema.parse({ id: 1, active: false })).toThrow();
    });
  });

  describe('DeletePipelineSchema', () => {
    it('should reject missing id', () => {
      expect(() => DeletePipelineSchema.parse({})).toThrow();
    });

    it('should accept valid id', () => {
      const result = DeletePipelineSchema.parse({ id: 3 });
      expect(result.id).toBe(3);
    });
  });

  // ─── U2: Stage write schemas ─────────────────────────────────────────────────

  describe('CreateStageSchema', () => {
    it('should reject missing name', () => {
      expect(() => CreateStageSchema.parse({ pipeline_id: 1 })).toThrow();
    });

    it('should reject missing pipeline_id', () => {
      expect(() => CreateStageSchema.parse({ name: 'Lead' })).toThrow();
    });

    it('should accept name and pipeline_id alone', () => {
      const result = CreateStageSchema.parse({ name: 'Lead', pipeline_id: 1 });
      expect(result.name).toBe('Lead');
      expect(result.pipeline_id).toBe(1);
    });

    it('should accept all optional fields including v2 rename names', () => {
      const result = CreateStageSchema.parse({
        name: 'Qualified',
        pipeline_id: 1,
        deal_probability: 50,
        is_deal_rot_enabled: true,
        days_to_rotten: 5,
      });
      expect(result.deal_probability).toBe(50);
      expect(result.is_deal_rot_enabled).toBe(true);
      expect(result.days_to_rotten).toBe(5);
    });

    it('should accept days_to_rotten: null', () => {
      const result = CreateStageSchema.parse({ name: 'Lead', pipeline_id: 1, days_to_rotten: null });
      expect(result.days_to_rotten).toBeNull();
    });

    it('should reject v1 rotten_flag and rotten_days (.strict) — v1 names cannot reach the body', () => {
      expect(() => CreateStageSchema.parse({ name: 'Lead', pipeline_id: 1, rotten_flag: true })).toThrow();
      expect(() => CreateStageSchema.parse({ name: 'Lead', pipeline_id: 1, rotten_days: 5 })).toThrow();
    });

    it('should reject both v1 rename keys together (.strict)', () => {
      expect(() =>
        CreateStageSchema.parse({ name: 'Lead', pipeline_id: 1, rotten_flag: true, rotten_days: 5 })
      ).toThrow();
    });

    it('should reject read-only is_deleted and v1 active (.strict)', () => {
      expect(() => CreateStageSchema.parse({ name: 'Lead', pipeline_id: 1, is_deleted: false })).toThrow();
      expect(() => CreateStageSchema.parse({ name: 'Lead', pipeline_id: 1, active: true })).toThrow();
    });

    it('should reject deal_probability outside 0-100', () => {
      expect(() => CreateStageSchema.parse({ name: 'Lead', pipeline_id: 1, deal_probability: 101 })).toThrow();
      expect(() => CreateStageSchema.parse({ name: 'Lead', pipeline_id: 1, deal_probability: -1 })).toThrow();
    });
  });

  describe('UpdateStageSchema', () => {
    it('should reject missing id', () => {
      expect(() => UpdateStageSchema.parse({})).toThrow();
    });

    it('should accept id alone (id-only is a valid no-op)', () => {
      const result = UpdateStageSchema.parse({ id: 1 });
      expect(result.id).toBe(1);
    });

    it('should accept partial update with v2 rename fields', () => {
      const result = UpdateStageSchema.parse({ id: 1, is_deal_rot_enabled: false, days_to_rotten: null });
      expect(result.is_deal_rot_enabled).toBe(false);
      expect(result.days_to_rotten).toBeNull();
    });

    it('should reject v1 rotten_flag/rotten_days and is_deleted (.strict)', () => {
      expect(() => UpdateStageSchema.parse({ id: 1, rotten_flag: true })).toThrow();
      expect(() => UpdateStageSchema.parse({ id: 1, rotten_days: 5 })).toThrow();
      expect(() => UpdateStageSchema.parse({ id: 1, is_deleted: true })).toThrow();
    });
  });

  describe('DeleteStageSchema', () => {
    it('should reject missing id', () => {
      expect(() => DeleteStageSchema.parse({})).toThrow();
    });

    it('should accept valid id', () => {
      const result = DeleteStageSchema.parse({ id: 7 });
      expect(result.id).toBe(7);
    });
  });
});

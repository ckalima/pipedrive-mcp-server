/**
 * Tests for schemas/pipelines.ts
 */

import { describe, it, expect } from 'vitest';
import {
  ListPipelinesSchema,
  ListStagesSchema,
  GetStageSchema,
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
});

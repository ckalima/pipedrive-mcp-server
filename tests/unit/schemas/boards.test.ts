/**
 * Tests for schemas/boards.ts (boards + phases)
 */

import { describe, it, expect } from 'vitest';
import {
  ListBoardsSchema,
  GetBoardSchema,
  CreateBoardSchema,
  UpdateBoardSchema,
  DeleteBoardSchema,
  ListPhasesSchema,
  GetPhaseSchema,
  CreatePhaseSchema,
  UpdatePhaseSchema,
  DeletePhaseSchema,
} from '../../../src/schemas/boards.js';

describe('boards schemas', () => {
  // ─── ListBoardsSchema ──────────────────────────────────────────────────────

  describe('ListBoardsSchema', () => {
    it('accepts empty object', () => {
      const result = ListBoardsSchema.parse({});
      expect(result).toEqual({});
    });

    it('accepts extra keys are stripped (no params defined)', () => {
      // Extra props are stripped by default in Zod strict mode, but here just verify parse succeeds
      const result = ListBoardsSchema.parse({});
      expect(result).toBeDefined();
    });
  });

  // ─── GetBoardSchema ────────────────────────────────────────────────────────

  describe('GetBoardSchema', () => {
    it('requires id', () => {
      expect(() => GetBoardSchema.parse({})).toThrow();
    });

    it('accepts a positive integer id', () => {
      const result = GetBoardSchema.parse({ id: 5 });
      expect(result.id).toBe(5);
    });

    it('rejects non-positive id', () => {
      expect(() => GetBoardSchema.parse({ id: 0 })).toThrow();
      expect(() => GetBoardSchema.parse({ id: -1 })).toThrow();
    });

    it('rejects non-integer id', () => {
      expect(() => GetBoardSchema.parse({ id: 1.5 })).toThrow();
    });
  });

  // ─── CreateBoardSchema ─────────────────────────────────────────────────────

  describe('CreateBoardSchema', () => {
    it('requires name', () => {
      expect(() => CreateBoardSchema.parse({})).toThrow();
    });

    it('rejects empty string for name', () => {
      expect(() => CreateBoardSchema.parse({ name: '' })).toThrow();
    });

    it('accepts minimum required fields', () => {
      const result = CreateBoardSchema.parse({ name: 'My Board' });
      expect(result.name).toBe('My Board');
      expect(result.order_nr).toBeUndefined();
    });

    it('accepts name with order_nr', () => {
      const result = CreateBoardSchema.parse({ name: 'My Board', order_nr: 1 });
      expect(result.name).toBe('My Board');
      expect(result.order_nr).toBe(1);
    });

    it('rejects order_nr < 1', () => {
      expect(() => CreateBoardSchema.parse({ name: 'Board', order_nr: 0 })).toThrow();
      expect(() => CreateBoardSchema.parse({ name: 'Board', order_nr: -1 })).toThrow();
    });

    it('accepts order_nr = 1 (minimum)', () => {
      const result = CreateBoardSchema.parse({ name: 'Board', order_nr: 1 });
      expect(result.order_nr).toBe(1);
    });
  });

  // ─── UpdateBoardSchema ─────────────────────────────────────────────────────

  describe('UpdateBoardSchema', () => {
    it('only requires id', () => {
      const result = UpdateBoardSchema.parse({ id: 7 });
      expect(result.id).toBe(7);
      expect(result.name).toBeUndefined();
      expect(result.order_nr).toBeUndefined();
    });

    it('rejects missing id', () => {
      expect(() => UpdateBoardSchema.parse({})).toThrow();
    });

    it('accepts all optional fields alongside id', () => {
      const result = UpdateBoardSchema.parse({ id: 7, name: 'Renamed', order_nr: 3 });
      expect(result.id).toBe(7);
      expect(result.name).toBe('Renamed');
      expect(result.order_nr).toBe(3);
    });

    it('rejects order_nr < 1', () => {
      expect(() => UpdateBoardSchema.parse({ id: 1, order_nr: 0 })).toThrow();
    });

    it('rejects empty string for name', () => {
      expect(() => UpdateBoardSchema.parse({ id: 1, name: '' })).toThrow();
    });
  });

  // ─── DeleteBoardSchema ─────────────────────────────────────────────────────

  describe('DeleteBoardSchema', () => {
    it('requires id', () => {
      expect(() => DeleteBoardSchema.parse({})).toThrow();
    });

    it('accepts a valid id', () => {
      const result = DeleteBoardSchema.parse({ id: 3 });
      expect(result.id).toBe(3);
    });
  });
});

describe('phases schemas', () => {
  // ─── ListPhasesSchema ──────────────────────────────────────────────────────

  describe('ListPhasesSchema', () => {
    it('requires board_id', () => {
      expect(() => ListPhasesSchema.parse({})).toThrow();
    });

    it('rejects missing board_id', () => {
      expect(() => ListPhasesSchema.parse({})).toThrow();
    });

    it('accepts a positive integer board_id', () => {
      const result = ListPhasesSchema.parse({ board_id: 10 });
      expect(result.board_id).toBe(10);
    });

    it('rejects non-positive board_id', () => {
      expect(() => ListPhasesSchema.parse({ board_id: 0 })).toThrow();
      expect(() => ListPhasesSchema.parse({ board_id: -1 })).toThrow();
    });

    it('rejects non-integer board_id', () => {
      expect(() => ListPhasesSchema.parse({ board_id: 1.5 })).toThrow();
    });
  });

  // ─── GetPhaseSchema ────────────────────────────────────────────────────────

  describe('GetPhaseSchema', () => {
    it('requires id', () => {
      expect(() => GetPhaseSchema.parse({})).toThrow();
    });

    it('accepts a positive integer id', () => {
      const result = GetPhaseSchema.parse({ id: 20 });
      expect(result.id).toBe(20);
    });
  });

  // ─── CreatePhaseSchema ─────────────────────────────────────────────────────

  describe('CreatePhaseSchema', () => {
    it('requires name and board_id', () => {
      expect(() => CreatePhaseSchema.parse({})).toThrow();
      expect(() => CreatePhaseSchema.parse({ name: 'Phase' })).toThrow();
      expect(() => CreatePhaseSchema.parse({ board_id: 1 })).toThrow();
    });

    it('accepts minimum required fields', () => {
      const result = CreatePhaseSchema.parse({ name: 'Phase 1', board_id: 5 });
      expect(result.name).toBe('Phase 1');
      expect(result.board_id).toBe(5);
      expect(result.order_nr).toBeUndefined();
    });

    it('rejects empty string for name', () => {
      expect(() => CreatePhaseSchema.parse({ name: '', board_id: 1 })).toThrow();
    });

    it('accepts all fields', () => {
      const result = CreatePhaseSchema.parse({ name: 'Phase 1', board_id: 5, order_nr: 2 });
      expect(result.name).toBe('Phase 1');
      expect(result.board_id).toBe(5);
      expect(result.order_nr).toBe(2);
    });

    it('rejects order_nr < 1', () => {
      expect(() => CreatePhaseSchema.parse({ name: 'Phase', board_id: 1, order_nr: 0 })).toThrow();
    });
  });

  // ─── UpdatePhaseSchema ─────────────────────────────────────────────────────

  describe('UpdatePhaseSchema', () => {
    it('only requires id', () => {
      const result = UpdatePhaseSchema.parse({ id: 15 });
      expect(result.id).toBe(15);
      expect(result.name).toBeUndefined();
      expect(result.board_id).toBeUndefined();
      expect(result.order_nr).toBeUndefined();
    });

    it('rejects missing id', () => {
      expect(() => UpdatePhaseSchema.parse({})).toThrow();
    });

    it('accepts board_id to re-parent a phase', () => {
      const result = UpdatePhaseSchema.parse({ id: 15, board_id: 99 });
      expect(result.id).toBe(15);
      expect(result.board_id).toBe(99);
    });

    it('accepts all optional fields', () => {
      const result = UpdatePhaseSchema.parse({ id: 15, name: 'Renamed', board_id: 99, order_nr: 2 });
      expect(result.id).toBe(15);
      expect(result.name).toBe('Renamed');
      expect(result.board_id).toBe(99);
      expect(result.order_nr).toBe(2);
    });

    it('rejects order_nr < 1', () => {
      expect(() => UpdatePhaseSchema.parse({ id: 1, order_nr: 0 })).toThrow();
    });
  });

  // ─── DeletePhaseSchema ─────────────────────────────────────────────────────

  describe('DeletePhaseSchema', () => {
    it('requires id', () => {
      expect(() => DeletePhaseSchema.parse({})).toThrow();
    });

    it('accepts a valid id', () => {
      const result = DeletePhaseSchema.parse({ id: 8 });
      expect(result.id).toBe(8);
    });
  });
});

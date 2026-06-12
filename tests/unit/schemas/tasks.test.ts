/**
 * Tests for schemas/tasks.ts
 */

import { describe, it, expect } from 'vitest';
import {
  ListTasksSchema,
  GetTaskSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  DeleteTaskSchema,
} from '../../../src/schemas/tasks.js';

describe('tasks schemas', () => {
  // ─── ListTasksSchema ───────────────────────────────────────────────────────

  describe('ListTasksSchema', () => {
    it('accepts empty input with defaults', () => {
      const result = ListTasksSchema.parse({});
      expect(result.limit).toBe(50);
      expect(result.cursor).toBeUndefined();
      expect(result.is_done).toBeUndefined();
      expect(result.is_milestone).toBeUndefined();
      expect(result.assignee_id).toBeUndefined();
      expect(result.project_id).toBeUndefined();
      expect(result.parent_task_id).toBeUndefined();
    });

    it('accepts all filter parameters', () => {
      const result = ListTasksSchema.parse({
        cursor: 'abc123',
        limit: 50,
        is_done: true,
        is_milestone: false,
        assignee_id: 7,
        project_id: 42,
        parent_task_id: '99',
      });
      expect(result.cursor).toBe('abc123');
      expect(result.limit).toBe(50);
      expect(result.is_done).toBe(true);
      expect(result.is_milestone).toBe(false);
      expect(result.assignee_id).toBe(7);
      expect(result.project_id).toBe(42);
      expect(result.parent_task_id).toBe('99');
    });

    it('accepts parent_task_id as "null" string for root-only filtering', () => {
      const result = ListTasksSchema.parse({ parent_task_id: 'null' });
      expect(result.parent_task_id).toBe('null');
    });

    it('rejects limit=0', () => {
      expect(() => ListTasksSchema.parse({ limit: 0 })).toThrow();
    });

    it('rejects limit>100', () => {
      expect(() => ListTasksSchema.parse({ limit: 101 })).toThrow();
    });

    it('accepts limit=1 and limit=100', () => {
      expect(ListTasksSchema.parse({ limit: 1 }).limit).toBe(1);
      expect(ListTasksSchema.parse({ limit: 100 }).limit).toBe(100);
    });
  });

  // ─── GetTaskSchema ─────────────────────────────────────────────────────────

  describe('GetTaskSchema', () => {
    it('requires id', () => {
      expect(() => GetTaskSchema.parse({})).toThrow();
    });

    it('accepts a positive integer id', () => {
      const result = GetTaskSchema.parse({ id: 42 });
      expect(result.id).toBe(42);
    });

    it('rejects non-positive id', () => {
      expect(() => GetTaskSchema.parse({ id: 0 })).toThrow();
      expect(() => GetTaskSchema.parse({ id: -1 })).toThrow();
    });

    it('rejects non-integer id', () => {
      expect(() => GetTaskSchema.parse({ id: 1.5 })).toThrow();
    });
  });

  // ─── CreateTaskSchema ──────────────────────────────────────────────────────

  describe('CreateTaskSchema', () => {
    it('requires title and project_id', () => {
      expect(() => CreateTaskSchema.parse({})).toThrow();
      expect(() => CreateTaskSchema.parse({ title: 'My Task' })).toThrow();
      expect(() => CreateTaskSchema.parse({ project_id: 1 })).toThrow();
    });

    it('accepts minimum required fields', () => {
      const result = CreateTaskSchema.parse({ title: 'My Task', project_id: 1 });
      expect(result.title).toBe('My Task');
      expect(result.project_id).toBe(1);
    });

    it('rejects title of length 0', () => {
      expect(() => CreateTaskSchema.parse({ title: '', project_id: 1 })).toThrow();
    });

    it('rejects title longer than 255 chars', () => {
      expect(() =>
        CreateTaskSchema.parse({ title: 'a'.repeat(256), project_id: 1 })
      ).toThrow();
    });

    it('accepts title of exactly 255 chars', () => {
      const result = CreateTaskSchema.parse({ title: 'a'.repeat(255), project_id: 1 });
      expect(result.title.length).toBe(255);
    });

    it('is_done accepts booleans', () => {
      expect(CreateTaskSchema.parse({ title: 'T', project_id: 1, is_done: true }).is_done).toBe(true);
      expect(CreateTaskSchema.parse({ title: 'T', project_id: 1, is_done: false }).is_done).toBe(false);
    });

    it('is_done coerces legacy int 1 to true', () => {
      const result = CreateTaskSchema.parse({ title: 'T', project_id: 1, is_done: 1 });
      expect(result.is_done).toBe(true);
    });

    it('is_done coerces legacy int 0 to false', () => {
      const result = CreateTaskSchema.parse({ title: 'T', project_id: 1, is_done: 0 });
      expect(result.is_done).toBe(false);
    });

    it('is_done rejects value 2', () => {
      expect(() => CreateTaskSchema.parse({ title: 'T', project_id: 1, is_done: 2 })).toThrow();
    });

    it('is_done rejects non-coercible string', () => {
      expect(() => CreateTaskSchema.parse({ title: 'T', project_id: 1, is_done: 'yes' })).toThrow();
    });

    it('is_milestone accepts booleans', () => {
      expect(CreateTaskSchema.parse({ title: 'T', project_id: 1, is_milestone: true }).is_milestone).toBe(true);
      expect(CreateTaskSchema.parse({ title: 'T', project_id: 1, is_milestone: false }).is_milestone).toBe(false);
    });

    it('is_milestone coerces legacy ints 0/1 to booleans', () => {
      expect(CreateTaskSchema.parse({ title: 'T', project_id: 1, is_milestone: 1 }).is_milestone).toBe(true);
      expect(CreateTaskSchema.parse({ title: 'T', project_id: 1, is_milestone: 0 }).is_milestone).toBe(false);
    });

    it('is_milestone rejects value 2', () => {
      expect(() => CreateTaskSchema.parse({ title: 'T', project_id: 1, is_milestone: 2 })).toThrow();
    });

    // The live v2 API silently ignores the spec-documented done/milestone int
    // write fields (issue #81) — the schema must reject them loudly so the
    // mistake cannot reach the wire as a silent no-op.
    it('REJECTS the legacy done key (strict)', () => {
      expect(() => CreateTaskSchema.parse({ title: 'T', project_id: 1, done: 1 })).toThrow();
    });

    it('REJECTS the legacy milestone key (strict)', () => {
      expect(() => CreateTaskSchema.parse({ title: 'T', project_id: 1, milestone: 1 })).toThrow();
    });

    it('assignee_ids rejects more than 10 items', () => {
      expect(() =>
        CreateTaskSchema.parse({
          title: 'T',
          project_id: 1,
          assignee_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        })
      ).toThrow();
    });

    it('assignee_ids accepts up to 10 items', () => {
      const result = CreateTaskSchema.parse({
        title: 'T',
        project_id: 1,
        assignee_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      });
      expect(result.assignee_ids).toHaveLength(10);
    });

    it('accepts all optional fields', () => {
      const result = CreateTaskSchema.parse({
        title: 'Full Task',
        project_id: 5,
        parent_task_id: 10,
        description: 'A description',
        is_done: false,
        is_milestone: true,
        due_date: '2026-12-31',
        start_date: '2026-06-01',
        assignee_id: 3,
        assignee_ids: [3, 4],
        priority: 2,
      });
      expect(result.parent_task_id).toBe(10);
      expect(result.description).toBe('A description');
      expect(result.is_done).toBe(false);
      expect(result.is_milestone).toBe(true);
      expect(result.due_date).toBe('2026-12-31');
      expect(result.start_date).toBe('2026-06-01');
      expect(result.assignee_id).toBe(3);
      expect(result.assignee_ids).toEqual([3, 4]);
      expect(result.priority).toBe(2);
    });

    it('accepts priority=0 (minimum)', () => {
      const result = CreateTaskSchema.parse({ title: 'T', project_id: 1, priority: 0 });
      expect(result.priority).toBe(0);
    });

    it('rejects negative priority', () => {
      expect(() => CreateTaskSchema.parse({ title: 'T', project_id: 1, priority: -1 })).toThrow();
    });
  });

  // ─── UpdateTaskSchema ──────────────────────────────────────────────────────

  describe('UpdateTaskSchema', () => {
    it('only requires id', () => {
      const result = UpdateTaskSchema.parse({ id: 7 });
      expect(result.id).toBe(7);
    });

    it('rejects missing id', () => {
      expect(() => UpdateTaskSchema.parse({})).toThrow();
    });

    it('accepts all optional body fields alongside id', () => {
      const result = UpdateTaskSchema.parse({
        id: 7,
        title: 'Updated Title',
        is_done: true,
        is_milestone: false,
        priority: 5,
      });
      expect(result.id).toBe(7);
      expect(result.title).toBe('Updated Title');
      expect(result.is_done).toBe(true);
      expect(result.is_milestone).toBe(false);
      expect(result.priority).toBe(5);
    });

    it('is_done coerces legacy int 1 to true on update', () => {
      const result = UpdateTaskSchema.parse({ id: 1, is_done: 1 });
      expect(result.is_done).toBe(true);
    });

    it('is_done coerces legacy int 0 to false on update', () => {
      const result = UpdateTaskSchema.parse({ id: 1, is_done: 0 });
      expect(result.is_done).toBe(false);
    });

    it('rejects is_done=2 on update', () => {
      expect(() => UpdateTaskSchema.parse({ id: 1, is_done: 2 })).toThrow();
    });

    it('REJECTS the legacy done/milestone keys on update (strict, issue #81)', () => {
      expect(() => UpdateTaskSchema.parse({ id: 1, done: 1 })).toThrow();
      expect(() => UpdateTaskSchema.parse({ id: 1, milestone: 1 })).toThrow();
    });
  });

  // ─── DeleteTaskSchema ──────────────────────────────────────────────────────

  describe('DeleteTaskSchema', () => {
    it('requires id', () => {
      expect(() => DeleteTaskSchema.parse({})).toThrow();
    });

    it('accepts a valid id', () => {
      const result = DeleteTaskSchema.parse({ id: 99 });
      expect(result.id).toBe(99);
    });
  });
});

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

    it('done accepts 0 and 1', () => {
      expect(CreateTaskSchema.parse({ title: 'T', project_id: 1, done: 0 }).done).toBe(0);
      expect(CreateTaskSchema.parse({ title: 'T', project_id: 1, done: 1 }).done).toBe(1);
    });

    it('done coerces true to 1', () => {
      const result = CreateTaskSchema.parse({ title: 'T', project_id: 1, done: true });
      expect(result.done).toBe(1);
    });

    it('done coerces false to 0', () => {
      const result = CreateTaskSchema.parse({ title: 'T', project_id: 1, done: false });
      expect(result.done).toBe(0);
    });

    it('done rejects value 2', () => {
      expect(() => CreateTaskSchema.parse({ title: 'T', project_id: 1, done: 2 })).toThrow();
    });

    it('done rejects non-coercible string', () => {
      expect(() => CreateTaskSchema.parse({ title: 'T', project_id: 1, done: 'yes' })).toThrow();
    });

    it('milestone accepts 0 and 1', () => {
      expect(CreateTaskSchema.parse({ title: 'T', project_id: 1, milestone: 0 }).milestone).toBe(0);
      expect(CreateTaskSchema.parse({ title: 'T', project_id: 1, milestone: 1 }).milestone).toBe(1);
    });

    it('milestone coerces true to 1', () => {
      const result = CreateTaskSchema.parse({ title: 'T', project_id: 1, milestone: true });
      expect(result.milestone).toBe(1);
    });

    it('milestone coerces false to 0', () => {
      const result = CreateTaskSchema.parse({ title: 'T', project_id: 1, milestone: false });
      expect(result.milestone).toBe(0);
    });

    it('milestone rejects value 2', () => {
      expect(() => CreateTaskSchema.parse({ title: 'T', project_id: 1, milestone: 2 })).toThrow();
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
        done: 0,
        milestone: 1,
        due_date: '2026-12-31',
        start_date: '2026-06-01',
        assignee_id: 3,
        assignee_ids: [3, 4],
        priority: 2,
      });
      expect(result.parent_task_id).toBe(10);
      expect(result.description).toBe('A description');
      expect(result.done).toBe(0);
      expect(result.milestone).toBe(1);
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
        done: 1,
        milestone: 0,
        priority: 5,
      });
      expect(result.id).toBe(7);
      expect(result.title).toBe('Updated Title');
      expect(result.done).toBe(1);
      expect(result.milestone).toBe(0);
      expect(result.priority).toBe(5);
    });

    it('done coerces true to 1 on update', () => {
      const result = UpdateTaskSchema.parse({ id: 1, done: true });
      expect(result.done).toBe(1);
    });

    it('done coerces false to 0 on update', () => {
      const result = UpdateTaskSchema.parse({ id: 1, done: false });
      expect(result.done).toBe(0);
    });

    it('rejects done=2 on update', () => {
      expect(() => UpdateTaskSchema.parse({ id: 1, done: 2 })).toThrow();
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

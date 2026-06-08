/**
 * Tests for schemas/projects.ts
 */

import { describe, it, expect } from 'vitest';
import {
  ListProjectsSchema,
  GetProjectSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  DeleteProjectSchema,
  ArchiveProjectSchema,
  SearchProjectsSchema,
  ListProjectTasksSchema,
} from '../../../src/schemas/projects.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('projects schemas', () => {
  describe('ListProjectsSchema', () => {
    it('should accept empty input and apply defaults', () => {
      const result = ListProjectsSchema.parse({});
      expect(result.limit).toBe(50);
    });

    it('should accept all filter parameters', () => {
      const params = {
        cursor: 'cursor_abc123',
        limit: 100,
        filter_id: 1,
        phase_id: 2,
        status: 'open',
        board_id: 3,
        include_fields: 'tasks,activities',
      };
      const result = ListProjectsSchema.parse(params);
      expect(result.cursor).toBe('cursor_abc123');
      expect(result.limit).toBe(100);
      expect(result.filter_id).toBe(1);
      expect(result.phase_id).toBe(2);
      expect(result.status).toBe('open');
      expect(result.board_id).toBe(3);
      expect(result.include_fields).toBe('tasks,activities');
    });

    it('should reject limit of 0', () => {
      expect(() => ListProjectsSchema.parse({ limit: 0 })).toThrow();
    });

    it('should reject limit over 100', () => {
      expect(() => ListProjectsSchema.parse({ limit: 101 })).toThrow();
    });

    it('should reject non-positive filter_id', () => {
      expect(() => ListProjectsSchema.parse({ filter_id: 0 })).toThrow();
      expect(() => ListProjectsSchema.parse({ filter_id: -1 })).toThrow();
    });
  });

  describe('GetProjectSchema', () => {
    it('should accept valid integer id', () => {
      const result = GetProjectSchema.parse({ id: 1 });
      expect(result.id).toBe(1);
    });

    it('should require id', () => {
      expect(() => GetProjectSchema.parse({})).toThrow();
    });

    it('should reject string id', () => {
      expect(() => GetProjectSchema.parse({ id: '1' })).toThrow();
    });

    it('should reject id of 0', () => {
      expect(() => GetProjectSchema.parse({ id: 0 })).toThrow();
    });

    it('should reject negative id', () => {
      expect(() => GetProjectSchema.parse({ id: -1 })).toThrow();
    });

    it('should reject UUID string id', () => {
      expect(() => GetProjectSchema.parse({ id: VALID_UUID })).toThrow();
    });
  });

  describe('CreateProjectSchema', () => {
    it('should require title', () => {
      expect(() => CreateProjectSchema.parse({ board_id: 1, phase_id: 1 })).toThrow();
    });

    it('should require board_id', () => {
      expect(() => CreateProjectSchema.parse({ title: 'Project', phase_id: 1 })).toThrow();
    });

    it('should require phase_id', () => {
      expect(() => CreateProjectSchema.parse({ title: 'Project', board_id: 1 })).toThrow();
    });

    it('should accept minimal required trio', () => {
      const result = CreateProjectSchema.parse({ title: 'Project', board_id: 1, phase_id: 2 });
      expect(result.title).toBe('Project');
      expect(result.board_id).toBe(1);
      expect(result.phase_id).toBe(2);
    });

    it('should accept full payload', () => {
      const params = {
        title: 'Full Project',
        board_id: 1,
        phase_id: 2,
        description: 'A description',
        status: 'open',
        owner_id: 3,
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        deal_ids: [1, 2, 3],
        org_ids: [4],
        person_ids: [5],
        label_ids: [10, 20],
      };
      const result = CreateProjectSchema.parse(params);
      expect(result.title).toBe('Full Project');
      expect(result.description).toBe('A description');
      expect(result.start_date).toBe('2024-01-01');
      expect(result.deal_ids).toEqual([1, 2, 3]);
      expect(result.label_ids).toEqual([10, 20]);
      expect(result.person_ids).toEqual([5]);
      expect(result.org_ids).toEqual([4]);
    });

    it('should reject empty title', () => {
      expect(() => CreateProjectSchema.parse({ title: '', board_id: 1, phase_id: 1 })).toThrow();
    });

    it('should reject title over 255 characters', () => {
      expect(() => CreateProjectSchema.parse({ title: 'a'.repeat(256), board_id: 1, phase_id: 1 })).toThrow();
    });

    it('should reject invalid start_date format', () => {
      expect(() => CreateProjectSchema.parse({ title: 'P', board_id: 1, phase_id: 1, start_date: '12/31/2024' })).toThrow();
    });

    it('should accept positive-integer deal_ids and label_ids', () => {
      const result = CreateProjectSchema.parse({ title: 'P', board_id: 1, phase_id: 1, deal_ids: [1, 2], label_ids: [3] });
      expect(result.deal_ids).toEqual([1, 2]);
      expect(result.label_ids).toEqual([3]);
    });

    it('should reject negative deal_ids', () => {
      expect(() => CreateProjectSchema.parse({ title: 'P', board_id: 1, phase_id: 1, deal_ids: [-1] })).toThrow();
    });

    it('should reject negative label_ids', () => {
      expect(() => CreateProjectSchema.parse({ title: 'P', board_id: 1, phase_id: 1, label_ids: [-1] })).toThrow();
    });

    it('should reject negative org_ids', () => {
      expect(() => CreateProjectSchema.parse({ title: 'P', board_id: 1, phase_id: 1, org_ids: [-1] })).toThrow();
    });

    it('should reject negative person_ids', () => {
      expect(() => CreateProjectSchema.parse({ title: 'P', board_id: 1, phase_id: 1, person_ids: [-1] })).toThrow();
    });
  });

  describe('UpdateProjectSchema', () => {
    it('should require id', () => {
      expect(() => UpdateProjectSchema.parse({})).toThrow();
    });

    it('should reject string id', () => {
      expect(() => UpdateProjectSchema.parse({ id: '1' })).toThrow();
    });

    it('should accept id with no other fields', () => {
      const result = UpdateProjectSchema.parse({ id: 1 });
      expect(result.id).toBe(1);
    });

    it('should accept all updatable fields', () => {
      const params = {
        id: 1,
        title: 'Updated Project',
        board_id: 2,
        phase_id: 3,
        description: 'New description',
        status: 'completed',
        owner_id: 4,
        start_date: '2025-01-01',
        end_date: '2025-06-30',
        deal_ids: [1],
        org_ids: [5],
        person_ids: [6],
        label_ids: [7],
      };
      const result = UpdateProjectSchema.parse(params);
      expect(result.id).toBe(1);
      expect(result.title).toBe('Updated Project');
      expect(result.status).toBe('completed');
      expect(result.org_ids).toEqual([5]);
      expect(result.person_ids).toEqual([6]);
      expect(result.label_ids).toEqual([7]);
    });

    it('should reject invalid end_date format', () => {
      expect(() => UpdateProjectSchema.parse({ id: 1, end_date: '06/30/2025' })).toThrow();
    });
  });

  describe('DeleteProjectSchema', () => {
    it('should require id', () => {
      expect(() => DeleteProjectSchema.parse({})).toThrow();
    });

    it('should accept valid integer id', () => {
      const result = DeleteProjectSchema.parse({ id: 1 });
      expect(result.id).toBe(1);
    });

    it('should reject string id', () => {
      expect(() => DeleteProjectSchema.parse({ id: '1' })).toThrow();
    });

    it('should reject id of 0', () => {
      expect(() => DeleteProjectSchema.parse({ id: 0 })).toThrow();
    });

    it('should reject negative id', () => {
      expect(() => DeleteProjectSchema.parse({ id: -1 })).toThrow();
    });
  });

  describe('ArchiveProjectSchema', () => {
    it('should require id', () => {
      expect(() => ArchiveProjectSchema.parse({})).toThrow();
    });

    it('should accept valid integer id', () => {
      const result = ArchiveProjectSchema.parse({ id: 1 });
      expect(result.id).toBe(1);
    });

    it('should reject string id', () => {
      expect(() => ArchiveProjectSchema.parse({ id: '1' })).toThrow();
    });

    it('should reject id of 0', () => {
      expect(() => ArchiveProjectSchema.parse({ id: 0 })).toThrow();
    });

    it('should reject negative id', () => {
      expect(() => ArchiveProjectSchema.parse({ id: -1 })).toThrow();
    });
  });

  describe('SearchProjectsSchema', () => {
    it('should require term', () => {
      expect(() => SearchProjectsSchema.parse({})).toThrow();
    });

    it('should apply default exact_match and limit', () => {
      const result = SearchProjectsSchema.parse({ term: 'test' });
      expect(result.term).toBe('test');
      expect(result.exact_match).toBe(false);
      expect(result.limit).toBe(50);
    });

    it('should reject empty term', () => {
      expect(() => SearchProjectsSchema.parse({ term: '' })).toThrow();
    });

    it('should reject term over 500 characters', () => {
      expect(() => SearchProjectsSchema.parse({ term: 'a'.repeat(501) })).toThrow();
    });

    it('should accept all optional fields', () => {
      const params = {
        term: 'acme',
        include_fields: 'tasks',
        exact_match: true,
        limit: 25,
        cursor: 'cursor_abc123',
      };
      const result = SearchProjectsSchema.parse(params);
      expect(result.term).toBe('acme');
      expect(result.exact_match).toBe(true);
      expect(result.limit).toBe(25);
      expect(result.cursor).toBe('cursor_abc123');
      expect(result.include_fields).toBe('tasks');
    });

    it('should reject limit of 0', () => {
      expect(() => SearchProjectsSchema.parse({ term: 'test', limit: 0 })).toThrow();
    });

    it('should reject limit over 100', () => {
      expect(() => SearchProjectsSchema.parse({ term: 'test', limit: 101 })).toThrow();
    });
  });

  describe('ListProjectTasksSchema', () => {
    it('should require id', () => {
      expect(() => ListProjectTasksSchema.parse({})).toThrow();
    });

    it('should apply limit default with id', () => {
      const result = ListProjectTasksSchema.parse({ id: 1 });
      expect(result.id).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should accept id, cursor, and limit (v2)', () => {
      const result = ListProjectTasksSchema.parse({ id: 1, cursor: 'c1', limit: 25 });
      expect(result.id).toBe(1);
      expect(result.cursor).toBe('c1');
      expect(result.limit).toBe(25);
    });

    it('should reject string id', () => {
      expect(() => ListProjectTasksSchema.parse({ id: '1' })).toThrow();
    });

    // revert-proof: v2 limit cap is 100 (v1 schema allowed up to 500)
    it('should reject limit over 100 (v2 cap)', () => {
      expect(() => ListProjectTasksSchema.parse({ id: 1, limit: 101 })).toThrow();
    });

    // revert-proof: v1 offset param `start` is gone — Zod strips it (assert acceptance of cursor instead)
    it('should strip the removed v1 start param', () => {
      const result = ListProjectTasksSchema.parse({ id: 1, start: 50 } as Record<string, unknown>);
      expect((result as Record<string, unknown>).start).toBeUndefined();
    });
  });
});

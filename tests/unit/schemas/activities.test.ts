/**
 * Tests for schemas/activities.ts
 * Most complex schema with 16+ fields, regex validation, and nested arrays
 */

import { describe, it, expect } from 'vitest';
import {
  ListActivitiesSchema,
  GetActivitySchema,
  CreateActivitySchema,
  UpdateActivitySchema,
  DeleteActivitySchema,
} from '../../../src/schemas/activities.js';

describe('activities schemas', () => {
  describe('ListActivitiesSchema', () => {
    it('should accept minimal params', () => {
      const result = ListActivitiesSchema.parse({});
      expect(result.limit).toBe(50);
      expect(result.sort_direction).toBeUndefined();
    });

    it('should accept all filter parameters', () => {
      const params = {
        cursor: 'cursor123',
        limit: 100,
        filter_id: 1,
        ids: '1,2,3',
        owner_id: 5,
        deal_id: 10,
        lead_id: 'abc-123-def',
        person_id: 15,
        org_id: 20,
        project_id: 25,
        type: 'call',
        done: false,
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        updated_since: '2024-01-01T00:00:00Z',
        updated_until: '2024-12-31T23:59:59Z',
        sort_by: 'due_date',
        sort_direction: 'asc',
        include_fields: 'attendees',
      };

      const result = ListActivitiesSchema.parse(params);
      expect(result.deal_id).toBe(10);
      expect(result.lead_id).toBe('abc-123-def');
      expect(result.type).toBe('call');
      expect(result.done).toBe(false);
      expect(result.sort_by).toBe('due_date');
    });

    it('should accept all valid sort_by values', () => {
      const sortFields = ['id', 'update_time', 'add_time', 'due_date'];
      sortFields.forEach((sort_by) => {
        const result = ListActivitiesSchema.parse({ sort_by });
        expect(result.sort_by).toBe(sort_by);
      });
    });

    it('should reject invalid sort_by value', () => {
      expect(() => ListActivitiesSchema.parse({ sort_by: 'invalid' })).toThrow();
    });

    it('should validate date format for start_date and end_date', () => {
      const result = ListActivitiesSchema.parse({
        start_date: '2024-01-01',
        end_date: '2024-12-31',
      });
      expect(result.start_date).toBe('2024-01-01');
      expect(result.end_date).toBe('2024-12-31');
    });

    it('should reject invalid date format', () => {
      expect(() => ListActivitiesSchema.parse({ start_date: '01-01-2024' })).toThrow();
    });
  });

  describe('GetActivitySchema', () => {
    it('should require id', () => {
      expect(() => GetActivitySchema.parse({})).toThrow();
    });

    it('should accept valid id with optional fields', () => {
      const result = GetActivitySchema.parse({
        id: 123,
        include_fields: 'attendees,participants',
      });
      expect(result.id).toBe(123);
      expect(result.include_fields).toBe('attendees,participants');
    });
  });

  describe('CreateActivitySchema', () => {
    it('should require subject and type', () => {
      expect(() => CreateActivitySchema.parse({})).toThrow();
      expect(() => CreateActivitySchema.parse({ subject: 'Test' })).toThrow();
      expect(() => CreateActivitySchema.parse({ type: 'call' })).toThrow();
    });

    it('should accept minimal required params', () => {
      const result = CreateActivitySchema.parse({
        subject: 'Follow up call',
        type: 'call',
      });
      expect(result.subject).toBe('Follow up call');
      expect(result.type).toBe('call');
      expect(result.done).toBe(false); // default
    });

    it('should accept all optional fields', () => {
      const params = {
        subject: 'Client Meeting',
        type: 'meeting',
        due_date: '2024-06-15',
        due_time: '14:30',
        duration: '01:00',
        owner_id: 1,
        deal_id: 10,
        lead_id: 'lead-uuid-123',
        person_id: 20,
        org_id: 30,
        project_id: 40,
        note: '<p>Meeting notes here</p>',
        done: false,
        busy: true,
        priority: 2,
        participants: [
          { person_id: 1, primary: true },
          { person_id: 2, primary: false },
        ],
        attendees: [
          { email: 'guest@example.com', name: 'External Guest' },
        ],
        location: '123 Main St, Suite 100',
        public_description: 'Quarterly business review',
      };

      const result = CreateActivitySchema.parse(params);
      expect(result.subject).toBe('Client Meeting');
      expect(result.due_time).toBe('14:30');
      expect(result.duration).toBe('01:00');
      expect(result.participants).toHaveLength(2);
      expect(result.attendees).toHaveLength(1);
      expect(result.location).toBe('123 Main St, Suite 100');
    });

    it('should reject empty subject', () => {
      expect(() => CreateActivitySchema.parse({
        subject: '',
        type: 'call',
      })).toThrow();
    });

    it('should reject subject over 255 characters', () => {
      expect(() => CreateActivitySchema.parse({
        subject: 'a'.repeat(256),
        type: 'call',
      })).toThrow();
    });

    // Time format validation (HH:MM)
    it('should validate due_time format HH:MM', () => {
      const validTimes = ['00:00', '09:30', '14:00', '23:59'];
      validTimes.forEach((due_time) => {
        const result = CreateActivitySchema.parse({
          subject: 'Test',
          type: 'call',
          due_time,
        });
        expect(result.due_time).toBe(due_time);
      });
    });

    it('should reject invalid due_time format', () => {
      const invalidTimes = ['9:30', '14:0', '2:30 PM', '14:30:00', ''];
      invalidTimes.forEach((due_time) => {
        expect(() => CreateActivitySchema.parse({
          subject: 'Test',
          type: 'call',
          due_time,
        })).toThrow();
      });
    });

    it('should validate duration format HH:MM', () => {
      const validDurations = ['00:30', '01:00', '02:30', '24:00'];
      validDurations.forEach((duration) => {
        const result = CreateActivitySchema.parse({
          subject: 'Test',
          type: 'meeting',
          duration,
        });
        expect(result.duration).toBe(duration);
      });
    });

    it('should reject invalid duration format', () => {
      expect(() => CreateActivitySchema.parse({
        subject: 'Test',
        type: 'meeting',
        duration: '1:00',
      })).toThrow();
    });

    // Date format validation
    it('should validate due_date format YYYY-MM-DD', () => {
      const result = CreateActivitySchema.parse({
        subject: 'Test',
        type: 'call',
        due_date: '2024-06-15',
      });
      expect(result.due_date).toBe('2024-06-15');
    });

    it('should reject invalid due_date format', () => {
      expect(() => CreateActivitySchema.parse({
        subject: 'Test',
        type: 'call',
        due_date: '06-15-2024',
      })).toThrow();
    });

    // Nested array validation: participants
    it('should validate participants array structure', () => {
      const result = CreateActivitySchema.parse({
        subject: 'Test',
        type: 'meeting',
        participants: [
          { person_id: 1, primary: true },
          { person_id: 2 },
        ],
      });
      expect(result.participants).toHaveLength(2);
      expect(result.participants![0].person_id).toBe(1);
      expect(result.participants![0].primary).toBe(true);
      expect(result.participants![1].primary).toBeUndefined();
    });

    it('should reject participants with invalid person_id', () => {
      expect(() => CreateActivitySchema.parse({
        subject: 'Test',
        type: 'meeting',
        participants: [{ person_id: -1 }],
      })).toThrow();
    });

    it('should reject participants with missing person_id', () => {
      expect(() => CreateActivitySchema.parse({
        subject: 'Test',
        type: 'meeting',
        participants: [{ primary: true }],
      })).toThrow();
    });

    // Nested array validation: attendees
    it('should validate attendees array structure', () => {
      const result = CreateActivitySchema.parse({
        subject: 'Test',
        type: 'meeting',
        attendees: [
          { email: 'guest1@example.com', name: 'Guest 1' },
          { email: 'guest2@example.com' },
        ],
      });
      expect(result.attendees).toHaveLength(2);
      expect(result.attendees![0].email).toBe('guest1@example.com');
      expect(result.attendees![0].name).toBe('Guest 1');
      expect(result.attendees![1].name).toBeUndefined();
    });

    it('should reject attendees with invalid email', () => {
      expect(() => CreateActivitySchema.parse({
        subject: 'Test',
        type: 'meeting',
        attendees: [{ email: 'not-an-email', name: 'Guest' }],
      })).toThrow();
    });

    it('should reject attendees without email', () => {
      expect(() => CreateActivitySchema.parse({
        subject: 'Test',
        type: 'meeting',
        attendees: [{ name: 'Guest' }],
      })).toThrow();
    });

    // Edge cases
    it('should accept empty participants array', () => {
      const result = CreateActivitySchema.parse({
        subject: 'Test',
        type: 'call',
        participants: [],
      });
      expect(result.participants).toEqual([]);
    });

    it('should accept empty attendees array', () => {
      const result = CreateActivitySchema.parse({
        subject: 'Test',
        type: 'meeting',
        attendees: [],
      });
      expect(result.attendees).toEqual([]);
    });
  });

  describe('UpdateActivitySchema', () => {
    it('should require id', () => {
      expect(() => UpdateActivitySchema.parse({})).toThrow();
    });

    it('should accept id with no updates', () => {
      const result = UpdateActivitySchema.parse({ id: 123 });
      expect(result.id).toBe(123);
    });

    it('should accept all updatable fields', () => {
      const params = {
        id: 123,
        subject: 'Updated Meeting',
        type: 'meeting',
        due_date: '2024-07-01',
        due_time: '10:00',
        duration: '00:45',
        owner_id: 2,
        deal_id: 15,
        lead_id: 'new-lead-id',
        person_id: 25,
        org_id: 35,
        project_id: 45,
        note: 'Updated notes',
        done: true,
        busy: false,
        priority: 3,
        participants: [{ person_id: 3, primary: true }],
        attendees: [{ email: 'new@example.com', name: 'New Guest' }],
        location: 'New Location',
      };

      const result = UpdateActivitySchema.parse(params);
      expect(result.id).toBe(123);
      expect(result.subject).toBe('Updated Meeting');
      expect(result.done).toBe(true);
    });

    it('should validate time format in update', () => {
      const result = UpdateActivitySchema.parse({
        id: 123,
        due_time: '15:45',
      });
      expect(result.due_time).toBe('15:45');
    });

    it('should reject invalid time format in update', () => {
      expect(() => UpdateActivitySchema.parse({
        id: 123,
        due_time: '3:45 PM',
      })).toThrow();
    });

    it('should allow updating just done status', () => {
      const result = UpdateActivitySchema.parse({
        id: 123,
        done: true,
      });
      expect(result.done).toBe(true);
    });
  });

  describe('DeleteActivitySchema', () => {
    it('should require id', () => {
      expect(() => DeleteActivitySchema.parse({})).toThrow();
    });

    it('should accept valid id', () => {
      const result = DeleteActivitySchema.parse({ id: 789 });
      expect(result.id).toBe(789);
    });

    it('should reject non-positive id', () => {
      expect(() => DeleteActivitySchema.parse({ id: 0 })).toThrow();
    });
  });
});

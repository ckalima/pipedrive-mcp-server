/**
 * Integration tests for tools/activities.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  mockApiError,
  fixtures,
  paginationFixtures,
} from '../../helpers/mockFetch.js';
import { createActivitiesFixture } from '../../helpers/fixtures.js';

async function getActivitiesTools() {
  return import('../../../src/tools/activities.js');
}

describe('activities tools', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listActivities', () => {
    it('should return list of activities with summary', async () => {
      const activities = createActivitiesFixture(3);
      mockFetch({ data: activities, additional_data: paginationFixtures.v2NoMore });
      const { listActivities } = await getActivitiesTools();

      const result = await listActivities({ limit: 50 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('3 activit');
      expect(parsed.data).toHaveLength(3);
    });

    it('should pass filter parameters', async () => {
      const mockFn = mockApiSuccess([]);
      const { listActivities } = await getActivitiesTools();

      await listActivities({
        owner_id: 1,
        deal_id: 5,
        person_id: 10,
        type: 'call',
        done: false,
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        sort_by: 'due_date',
      });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('owner_id=1');
      expect(url).toContain('deal_id=5');
      expect(url).toContain('person_id=10');
      expect(url).toContain('type=call');
      expect(url).toContain('done=false');
      expect(url).not.toContain('done=0');
    });

    it('should handle pagination', async () => {
      mockFetch({ data: [], additional_data: paginationFixtures.v2WithMore });
      const { listActivities } = await getActivitiesTools();

      const result = await listActivities({ cursor: 'cursor123' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
    });

    it('should handle API error', async () => {
      mockApiError(401, 'Invalid API key');
      const { listActivities } = await getActivitiesTools();

      const result = await listActivities({});

      expect(result.content[0].text).toContain('INVALID_API_KEY');
      expect(result.isError).toBe(true);
    });
  });

  describe('getActivity', () => {
    it('should return single activity', async () => {
      mockApiSuccess(fixtures.activity);
      const { getActivity } = await getActivitiesTools();

      const result = await getActivity({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Activity 1');
      expect(parsed.data.subject).toBe('Test Activity');
    });

    it('should handle not found', async () => {
      mockApiError(404, 'Activity not found');
      const { getActivity } = await getActivitiesTools();

      const result = await getActivity({ id: 99999 });

      expect(result.content[0].text).toContain('NOT_FOUND');
    });
  });

  describe('createActivity', () => {
    it('should create activity with required fields', async () => {
      mockApiSuccess({ ...fixtures.activity, id: 100, subject: 'New Call' });
      const { createActivity } = await getActivitiesTools();

      const result = await createActivity({
        subject: 'New Call',
        type: 'call',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Activity created');
    });

    it('should pass all fields to API', async () => {
      const mockFn = mockApiSuccess(fixtures.activity);
      const { createActivity } = await getActivitiesTools();

      await createActivity({
        subject: 'Client Meeting',
        type: 'meeting',
        due_date: '2024-06-15',
        due_time: '14:30',
        duration: '01:00',
        deal_id: 10,
        person_id: 20,
        org_id: 30,
        note: 'Meeting notes',
        done: false,
        busy: true,
        location: { value: '123 Main St', locality: 'Springfield', postal_code: '12345' },
        participants: [{ person_id: 1, primary: true }],
        attendees: [{ email: 'guest@example.com', name: 'Guest' }],
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.subject).toBe('Client Meeting');
      expect(body.type).toBe('meeting');
      expect(body.due_date).toBe('2024-06-15');
      expect(body.due_time).toBe('14:30');
      expect(body.participants).toHaveLength(1);
      expect(body.attendees).toHaveLength(1);
      // done must be a boolean, NOT integer 1/0
      expect(body.done).toBe(false);
      expect(typeof body.done).toBe('boolean');
      // location must be the structured object, NOT a string
      expect(body.location).toEqual({ value: '123 Main St', locality: 'Springfield', postal_code: '12345' });
      expect(typeof body.location).toBe('object');
    });

    it('should handle validation error', async () => {
      mockApiError(400, 'Subject is required');
      const { createActivity } = await getActivitiesTools();

      const result = await createActivity({ subject: '', type: 'call' });

      expect(result.content[0].text).toContain('VALIDATION_ERROR');
    });

    it('should send done as boolean true (not integer 1)', async () => {
      const mockFn = mockApiSuccess(fixtures.activity);
      const { createActivity } = await getActivitiesTools();
      await createActivity({ subject: 'Done call', type: 'call', done: true });
      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.done).toBe(true);
    });

    it('should omit done when not provided', async () => {
      const mockFn = mockApiSuccess(fixtures.activity);
      const { createActivity } = await getActivitiesTools();
      await createActivity({ subject: 'No done flag', type: 'call' });
      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect('done' in body).toBe(false);
    });
  });

  describe('updateActivity', () => {
    it('should update activity', async () => {
      mockApiSuccess({ ...fixtures.activity, done: true });
      const { updateActivity } = await getActivitiesTools();

      const result = await updateActivity({ id: 1, done: true });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Activity 1 updated');
    });

    it('should send PATCH request', async () => {
      const mockFn = mockApiSuccess(fixtures.activity);
      const { updateActivity } = await getActivitiesTools();

      await updateActivity({ id: 1, subject: 'Updated Subject' });

      const [, options] = mockFn.mock.calls[0];
      expect(options.method).toBe('PATCH');
    });

    it('should update nested fields', async () => {
      const mockFn = mockApiSuccess(fixtures.activity);
      const { updateActivity } = await getActivitiesTools();

      await updateActivity({
        id: 1,
        participants: [{ person_id: 5, primary: true }],
        attendees: [{ email: 'new@example.com' }],
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.participants).toHaveLength(1);
      expect(body.attendees).toHaveLength(1);
    });

    it('should send done as boolean on update (not integer)', async () => {
      const mockFn = mockApiSuccess(fixtures.activity);
      const { updateActivity } = await getActivitiesTools();
      await updateActivity({ id: 1, done: true });
      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.done).toBe(true);
    });

    it('should send location as structured object on update', async () => {
      const mockFn = mockApiSuccess(fixtures.activity);
      const { updateActivity } = await getActivitiesTools();
      await updateActivity({ id: 1, location: { value: '456 Oak Ave', country: 'US' } });
      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.location).toEqual({ value: '456 Oak Ave', country: 'US' });
    });
  });

  describe('deleteActivity', () => {
    it('should block when destructive operations are disabled', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { deleteActivity } = await getActivitiesTools();

      const result = await deleteActivity({ id: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should delete activity', async () => {
      mockApiSuccess({ id: 1 });
      const { deleteActivity } = await getActivitiesTools();

      const result = await deleteActivity({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('Activity 1 deleted');
    });

    it('should send DELETE request', async () => {
      const mockFn = mockApiSuccess({ id: 1 });
      const { deleteActivity } = await getActivitiesTools();

      await deleteActivity({ id: 123 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/activities/123');
      expect(options.method).toBe('DELETE');
    });
  });
});

/**
 * Integration tests for task tools (U1: list/get; U2: create/update/delete)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  mockApiError,
  paginationFixtures,
} from '../../helpers/mockFetch.js';

const task = {
  id: 1,
  title: 'Test Task',
  creator_id: 1,
  description: null,
  project_id: 10,
  is_done: false,
  is_milestone: false,
  due_date: null,
  start_date: null,
  parent_task_id: null,
  assignee_ids: [],
  priority: null,
  add_time: '2024-01-01T00:00:00Z',
  update_time: '2024-01-01T00:00:00Z',
  marked_as_done_time: null,
};

function createTasksFixture(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...task,
    id: i + 1,
    title: `Test Task ${i + 1}`,
  }));
}

// Dynamic import to avoid module caching issues with mocks
async function getTasksTools() {
  return import('../../../src/tools/tasks.js');
}

describe('tasks tools', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  // ─── listTasks ─────────────────────────────────────────────────────────────

  describe('listTasks', () => {
    it('returns list with summary for 3 tasks', async () => {
      const tasks = createTasksFixture(3);
      mockFetch({ data: tasks, additional_data: paginationFixtures.v2NoMore });
      const { listTasks } = await getTasksTools();

      const result = await listTasks({ limit: 50 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('3 tasks');
      expect(parsed.data).toHaveLength(3);
      expect(parsed.pagination).toBeDefined();
    });

    it('pluralizes correctly for 1 task', async () => {
      mockFetch({ data: createTasksFixture(1), additional_data: paginationFixtures.v2NoMore });
      const { listTasks } = await getTasksTools();

      const result = await listTasks({});

      const parsed = JSON.parse(result.content[0].text);
      // createListSummary returns "Found 1 task."
      expect(parsed.summary).toContain('1 task');
      expect(parsed.summary).not.toContain('1 tasks');
    });

    it('pluralizes correctly for 3 tasks', async () => {
      mockFetch({ data: createTasksFixture(3), additional_data: paginationFixtures.v2NoMore });
      const { listTasks } = await getTasksTools();

      const result = await listTasks({});

      const parsed = JSON.parse(result.content[0].text);
      // createListSummary returns "Found 3 tasks."
      expect(parsed.summary).toContain('3 tasks');
    });

    it('surfaces next_cursor when has_more is true', async () => {
      mockFetch({ data: createTasksFixture(50), additional_data: paginationFixtures.v2WithMore });
      const { listTasks } = await getTasksTools();

      const result = await listTasks({ cursor: 'page1' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });

    it('has_more false when no next_cursor', async () => {
      mockFetch({ data: createTasksFixture(2), additional_data: paginationFixtures.v2NoMore });
      const { listTasks } = await getTasksTools();

      const result = await listTasks({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(false);
    });

    it('forwards cursor in URL', async () => {
      const mockFn = mockApiSuccess([]);
      const { listTasks } = await getTasksTools();

      await listTasks({ cursor: 'pagecursor123' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=pagecursor123');
    });

    it('forwards is_done=true as "true" in query string', async () => {
      const mockFn = mockApiSuccess([]);
      const { listTasks } = await getTasksTools();

      await listTasks({ is_done: true });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('is_done=true');
    });

    it('forwards is_done=false as "false" in query string', async () => {
      const mockFn = mockApiSuccess([]);
      const { listTasks } = await getTasksTools();

      await listTasks({ is_done: false });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('is_done=false');
    });

    it('does not include is_done when absent', async () => {
      const mockFn = mockApiSuccess([]);
      const { listTasks } = await getTasksTools();

      await listTasks({});

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('is_done');
    });

    it('forwards is_milestone when present', async () => {
      const mockFn = mockApiSuccess([]);
      const { listTasks } = await getTasksTools();

      await listTasks({ is_milestone: true });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('is_milestone=true');
    });

    it('does not include is_milestone when absent', async () => {
      const mockFn = mockApiSuccess([]);
      const { listTasks } = await getTasksTools();

      await listTasks({});

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('is_milestone');
    });

    it('forwards assignee_id when present', async () => {
      const mockFn = mockApiSuccess([]);
      const { listTasks } = await getTasksTools();

      await listTasks({ assignee_id: 5 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('assignee_id=5');
    });

    it('does not include assignee_id when absent', async () => {
      const mockFn = mockApiSuccess([]);
      const { listTasks } = await getTasksTools();

      await listTasks({});

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('assignee_id');
    });

    it('forwards project_id when present', async () => {
      const mockFn = mockApiSuccess([]);
      const { listTasks } = await getTasksTools();

      await listTasks({ project_id: 42 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('project_id=42');
    });

    it('does not include project_id when absent', async () => {
      const mockFn = mockApiSuccess([]);
      const { listTasks } = await getTasksTools();

      await listTasks({});

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('project_id');
    });

    it('forwards parent_task_id when present', async () => {
      const mockFn = mockApiSuccess([]);
      const { listTasks } = await getTasksTools();

      await listTasks({ parent_task_id: 'null' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('parent_task_id=null');
    });

    it('does not include parent_task_id when absent', async () => {
      const mockFn = mockApiSuccess([]);
      const { listTasks } = await getTasksTools();

      await listTasks({});

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('parent_task_id');
    });

    it('returns isError:true on API failure', async () => {
      mockApiError(500, 'Internal server error');
      const { listTasks } = await getTasksTools();

      const result = await listTasks({});

      expect(result.isError).toBe(true);
    });

    it('calls GET /api/v2/tasks', async () => {
      const mockFn = mockApiSuccess([]);
      const { listTasks } = await getTasksTools();

      await listTasks({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/tasks');
    });
  });

  // ─── getTask ───────────────────────────────────────────────────────────────

  describe('getTask', () => {
    it('returns task data with summary "Task {id}"', async () => {
      mockApiSuccess(task);
      const { getTask } = await getTasksTools();

      const result = await getTask({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Task 1');
      expect(parsed.data).toBeDefined();
    });

    it('calls GET /api/v2/tasks/{id}', async () => {
      const mockFn = mockApiSuccess(task);
      const { getTask } = await getTasksTools();

      await getTask({ id: 42 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/tasks/42');
    });

    it('returns isError:true on 404', async () => {
      mockApiError(404, 'Task not found');
      const { getTask } = await getTasksTools();

      const result = await getTask({ id: 999 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('NOT_FOUND');
    });

    it('returns isError:true on API failure', async () => {
      mockApiError(500, 'Server error');
      const { getTask } = await getTasksTools();

      const result = await getTask({ id: 1 });

      expect(result.isError).toBe(true);
    });
  });

  // ─── createTask ────────────────────────────────────────────────────────────

  describe('createTask', () => {
    it('returns summary "Task created"', async () => {
      mockApiSuccess({ ...task, id: 100, title: 'New Task' });
      const { createTask } = await getTasksTools();

      const result = await createTask({ title: 'New Task', project_id: 10 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Task created');
      expect(parsed.data).toBeDefined();
    });

    it('sends POST to /api/v2/tasks', async () => {
      const mockFn = mockApiSuccess(task);
      const { createTask } = await getTasksTools();

      await createTask({ title: 'New Task', project_id: 10 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/tasks');
      expect(options.method).toBe('POST');
    });

    it('sends required fields in body', async () => {
      const mockFn = mockApiSuccess(task);
      const { createTask } = await getTasksTools();

      await createTask({ title: 'New Task', project_id: 10 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.title).toBe('New Task');
      expect(body.project_id).toBe(10);
    });

    it('excludes absent optional fields from body', async () => {
      const mockFn = mockApiSuccess(task);
      const { createTask } = await getTasksTools();

      await createTask({ title: 'New Task', project_id: 10 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.description).toBeUndefined();
      expect(body.is_done).toBeUndefined();
      expect(body.is_milestone).toBeUndefined();
      expect(body.due_date).toBeUndefined();
      expect(body.start_date).toBeUndefined();
      expect(body.assignee_id).toBeUndefined();
      expect(body.assignee_ids).toBeUndefined();
      expect(body.priority).toBeUndefined();
      expect(body.parent_task_id).toBeUndefined();
    });

    it('forwards optional fields when provided', async () => {
      const mockFn = mockApiSuccess(task);
      const { createTask } = await getTasksTools();

      await createTask({
        title: 'Full Task',
        project_id: 10,
        description: 'A description',
        is_done: false,
        is_milestone: true,
        due_date: '2026-12-31',
        start_date: '2026-06-01',
        assignee_id: 3,
        assignee_ids: [3, 4],
        priority: 2,
        parent_task_id: 5,
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.description).toBe('A description');
      // booleans on the wire — the live v2 API ignores int done/milestone (issue #81)
      expect(body.is_done).toBe(false);
      expect(body.is_milestone).toBe(true);
      expect(body.due_date).toBe('2026-12-31');
      expect(body.start_date).toBe('2026-06-01');
      expect(body.assignee_id).toBe(3);
      expect(body.assignee_ids).toEqual([3, 4]);
      expect(body.priority).toBe(2);
      expect(body.parent_task_id).toBe(5);
    });

    it('returns isError:true on API failure', async () => {
      mockApiError(400, 'Bad request');
      const { createTask } = await getTasksTools();

      const result = await createTask({ title: 'T', project_id: 1 });

      expect(result.isError).toBe(true);
    });
  });

  // ─── updateTask ────────────────────────────────────────────────────────────

  describe('updateTask', () => {
    it('sends PATCH to /api/v2/tasks/{id}', async () => {
      const mockFn = mockApiSuccess(task);
      const { updateTask } = await getTasksTools();

      await updateTask({ id: 7 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/tasks/7');
      expect(options.method).toBe('PATCH');
    });

    it('id goes into path, not body', async () => {
      const mockFn = mockApiSuccess(task);
      const { updateTask } = await getTasksTools();

      await updateTask({ id: 7, title: 'Updated' });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/tasks/7');
      const body = JSON.parse(options.body);
      expect(body.id).toBeUndefined();
    });

    it('empty update sends empty body', async () => {
      const mockFn = mockApiSuccess(task);
      const { updateTask } = await getTasksTools();

      await updateTask({ id: 7 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(Object.keys(body)).toHaveLength(0);
    });

    it('only forwards defined fields in body', async () => {
      const mockFn = mockApiSuccess(task);
      const { updateTask } = await getTasksTools();

      await updateTask({ id: 7, title: 'New Title', is_done: true });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.title).toBe('New Title');
      expect(body.is_done).toBe(true);
      expect(body.description).toBeUndefined();
      expect(body.is_milestone).toBeUndefined();
    });

    it('returns summary "{id} updated"', async () => {
      mockApiSuccess(task);
      const { updateTask } = await getTasksTools();

      const result = await updateTask({ id: 7, title: 'Updated' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('7');
      expect(parsed.summary).toContain('updated');
    });

    it('returns isError:true on API failure', async () => {
      mockApiError(404, 'Task not found');
      const { updateTask } = await getTasksTools();

      const result = await updateTask({ id: 999, title: 'X' });

      expect(result.isError).toBe(true);
    });
  });

  // ─── deleteTask ────────────────────────────────────────────────────────────

  describe('deleteTask', () => {
    it('returns guard error (no fetch) when PIPEDRIVE_ENABLE_DESTRUCTIVE is unset', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const mockFn = vi.fn();
      vi.stubGlobal('fetch', mockFn);

      const { deleteTask } = await getTasksTools();
      const result = await deleteTask({ id: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('calls DELETE /api/v2/tasks/{id} with PIPEDRIVE_ENABLE_DESTRUCTIVE=true', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: 1 });
      const { deleteTask } = await getTasksTools();

      await deleteTask({ id: 1 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/tasks/1');
      expect(options.method).toBe('DELETE');
    });

    it('summary mentions subtask cascade', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ id: 5 });
      const { deleteTask } = await getTasksTools();

      const result = await deleteTask({ id: 5 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('5');
      expect(parsed.summary).toContain('subtasks also deleted');
    });

    it('returns isError:true on API failure', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiError(404, 'Task not found');
      const { deleteTask } = await getTasksTools();

      const result = await deleteTask({ id: 999 });

      expect(result.isError).toBe(true);
    });
  });
});

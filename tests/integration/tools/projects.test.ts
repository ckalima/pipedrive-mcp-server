/**
 * Integration tests for tools/projects.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  mockApiError,
  paginationFixtures,
} from '../../helpers/mockFetch.js';

const projectFixture = {
  id: 1,
  title: 'Test Project',
  board_id: 1,
  phase_id: 1,
  status: 'open',
  owner_id: 1,
  add_time: '2024-01-01T00:00:00Z',
  update_time: '2024-01-01T00:00:00Z',
};

const createProjectsFixture = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ ...projectFixture, id: i + 1, title: `Test Project ${i + 1}` }));

// Dynamic import to avoid module caching issues with mocks
async function getProjectsTools() {
  return import('../../../src/tools/projects.js');
}

describe('projects tools', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe('listProjects', () => {
    it('should return list of projects with summary', async () => {
      mockFetch({ data: createProjectsFixture(3), additional_data: paginationFixtures.v2NoMore });
      const { listProjects } = await getProjectsTools();

      const result = await listProjects({ limit: 50 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('3 projects');
      expect(parsed.data).toHaveLength(3);
      expect(parsed.pagination.has_more).toBe(false);
    });

    it('should pluralize a single project correctly', async () => {
      mockFetch({ data: createProjectsFixture(1), additional_data: paginationFixtures.v2NoMore });
      const { listProjects } = await getProjectsTools();

      const result = await listProjects({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('1 project');
      expect(parsed.summary).not.toContain('1 projects');
    });

    it('should include pagination info when more items available', async () => {
      mockFetch({ data: createProjectsFixture(50), additional_data: paginationFixtures.v2WithMore });
      const { listProjects } = await getProjectsTools();

      const result = await listProjects({ limit: 50 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('cursor_abc123');
    });

    it('should pass filter parameters to API', async () => {
      const mockFn = mockApiSuccess([projectFixture]);
      const { listProjects } = await getProjectsTools();

      // board_id/include_fields passed directly (bypassing Zod) so the assertions
      // guard the handler-line removals, not just the schema strip.
      await listProjects({ phase_id: 2, status: 'open', filter_id: 3, board_id: 1, include_fields: 'tasks' } as Record<string, unknown>);

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('board_id');
      expect(url).not.toContain('include_fields');
      expect(url).toContain('phase_id=2');
      expect(url).toContain('status=open');
      expect(url).toContain('filter_id=3');
    });

    it('should use cursor for pagination', async () => {
      const mockFn = mockApiSuccess([projectFixture]);
      const { listProjects } = await getProjectsTools();

      await listProjects({ cursor: 'next_page_cursor' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=next_page_cursor');
    });

    it('should call v2 projects endpoint', async () => {
      const mockFn = mockApiSuccess([projectFixture]);
      const { listProjects } = await getProjectsTools();

      await listProjects({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/');
      expect(url).toContain('/projects');
    });

    it('should return isError on API error', async () => {
      mockApiError(401, 'Unauthorized');
      const { listProjects } = await getProjectsTools();

      const result = await listProjects({});

      expect(result.isError).toBe(true);
    });
  });

  describe('getProject', () => {
    it('should return single project with summary', async () => {
      mockApiSuccess(projectFixture);
      const { getProject } = await getProjectsTools();

      const result = await getProject({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Project 1');
      expect(parsed.data.title).toBe('Test Project');
    });

    it('should call v2 API with project ID in URL', async () => {
      const mockFn = mockApiSuccess(projectFixture);
      const { getProject } = await getProjectsTools();

      await getProject({ id: 1 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/');
      expect(url).toContain('/projects/1');
    });

    it('should return NOT_FOUND error on 404', async () => {
      mockApiError(404, 'Project not found');
      const { getProject } = await getProjectsTools();

      const result = await getProject({ id: 999 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('NOT_FOUND');
    });
  });

  describe('createProject', () => {
    it('should return Project created summary on success', async () => {
      mockApiSuccess(projectFixture);
      const { createProject } = await getProjectsTools();

      const result = await createProject({ title: 'New Project', board_id: 1, phase_id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Project created');
    });

    it('should POST to v2 projects endpoint', async () => {
      const mockFn = mockApiSuccess(projectFixture);
      const { createProject } = await getProjectsTools();

      await createProject({ title: 'New Project', board_id: 1, phase_id: 1 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/');
      expect(url).toContain('/projects');
      expect(options.method).toBe('POST');
    });

    it('should send required fields in request body', async () => {
      const mockFn = mockApiSuccess(projectFixture);
      const { createProject } = await getProjectsTools();

      await createProject({ title: 'Project Title', board_id: 2, phase_id: 3 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.title).toBe('Project Title');
      expect(body.board_id).toBe(2);
      expect(body.phase_id).toBe(3);
    });

    it('should include optional fields when provided', async () => {
      const mockFn = mockApiSuccess(projectFixture);
      const { createProject } = await getProjectsTools();

      await createProject({
        title: 'Project',
        board_id: 1,
        phase_id: 1,
        description: 'A description',
        deal_ids: [1, 2],
        org_ids: [4],
        person_ids: [5],
        label_ids: [10, 20],
      });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.description).toBe('A description');
      expect(body.deal_ids).toEqual([1, 2]);
      expect(body.org_ids).toEqual([4]);
      expect(body.person_ids).toEqual([5]);
      expect(body.label_ids).toEqual([10, 20]);
      expect(Array.isArray(body.org_ids)).toBe(true);
      // assert the OLD/WRONG keys are NOT sent (regression guard for #43)
      expect(body).not.toHaveProperty('org_id');
      expect(body).not.toHaveProperty('person_id');
      expect(body).not.toHaveProperty('labels');
    });

    it('should not include undefined fields in body', async () => {
      const mockFn = mockApiSuccess(projectFixture);
      const { createProject } = await getProjectsTools();

      await createProject({ title: 'Minimal Project', board_id: 1, phase_id: 1 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).not.toHaveProperty('description');
      expect(body).not.toHaveProperty('owner_id');
    });

    it('should return isError on API error', async () => {
      mockApiError(400, 'Invalid request');
      const { createProject } = await getProjectsTools();

      const result = await createProject({ title: 'Project', board_id: 1, phase_id: 1 });

      expect(result.isError).toBe(true);
    });
  });

  describe('updateProject', () => {
    it('should return updated summary', async () => {
      mockApiSuccess({ ...projectFixture, title: 'Updated Project' });
      const { updateProject } = await getProjectsTools();

      const result = await updateProject({ id: 1, title: 'Updated Project' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('updated');
      expect(parsed.summary).toContain('1');
    });

    it('should send PATCH request', async () => {
      const mockFn = mockApiSuccess(projectFixture);
      const { updateProject } = await getProjectsTools();

      await updateProject({ id: 1, title: 'Updated' });

      const [, options] = mockFn.mock.calls[0];
      expect(options.method).toBe('PATCH');
    });

    it('should call v2 API with project ID in URL', async () => {
      const mockFn = mockApiSuccess(projectFixture);
      const { updateProject } = await getProjectsTools();

      await updateProject({ id: 1, title: 'Updated' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/projects/1');
    });

    it('should send only provided fields in body', async () => {
      const mockFn = mockApiSuccess(projectFixture);
      const { updateProject } = await getProjectsTools();

      await updateProject({ id: 1, title: 'Updated Title' });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.title).toBe('Updated Title');
      expect(body).not.toHaveProperty('board_id');
      expect(body).not.toHaveProperty('phase_id');
    });

    it('should send v2 plural association arrays in body', async () => {
      const mockFn = mockApiSuccess(projectFixture);
      const { updateProject } = await getProjectsTools();

      await updateProject({ id: 1, org_ids: [5], person_ids: [6], label_ids: [7], deal_ids: [1] });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.org_ids).toEqual([5]);
      expect(body.person_ids).toEqual([6]);
      expect(body.label_ids).toEqual([7]);
      expect(body.deal_ids).toEqual([1]);
      expect(body).not.toHaveProperty('org_id');
      expect(body).not.toHaveProperty('person_id');
      expect(body).not.toHaveProperty('labels');
    });
  });

  describe('deleteProject', () => {
    it('should block when PIPEDRIVE_ENABLE_DESTRUCTIVE is not set', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const { deleteProject } = await getProjectsTools();

      const result = await deleteProject({ id: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
    });

    it('should delete project when env var is set', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ id: 1 });
      const { deleteProject } = await getProjectsTools();

      const result = await deleteProject({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('deleted');
    });

    it('should send DELETE request to v2 projects endpoint', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: 1 });
      const { deleteProject } = await getProjectsTools();

      await deleteProject({ id: 1 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/');
      expect(url).toContain('/projects/1');
      expect(options.method).toBe('DELETE');
    });
  });

  describe('archiveProject', () => {
    it('should return archived summary', async () => {
      mockApiSuccess({ ...projectFixture, status: 'archived' });
      const { archiveProject } = await getProjectsTools();

      const result = await archiveProject({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('archived');
      expect(parsed.summary).toContain('1');
    });

    it('should POST to the v2 /projects/{id}/archive endpoint with an empty body', async () => {
      const mockFn = mockApiSuccess(projectFixture);
      const { archiveProject } = await getProjectsTools();

      await archiveProject({ id: 1 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/projects/1/archive');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({});
      // revert-proof: must NOT be the old PATCH-with-status call
      expect(options.method).not.toBe('PATCH');
      expect(JSON.parse(options.body)).not.toHaveProperty('status');
    });
  });

  describe('searchProjects', () => {
    it('should return summary with search term', async () => {
      mockApiSuccess({ items: [{ result_score: 1.0, item: projectFixture }] });
      const { searchProjects } = await getProjectsTools();

      const result = await searchProjects({ term: 'acme' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('acme');
    });

    it('should call v2 projects search endpoint', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchProjects } = await getProjectsTools();

      await searchProjects({ term: 'test' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/projects/search');
      expect(url).toContain('/api/v2/');
    });

    it('should pass term in query parameters', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchProjects } = await getProjectsTools();

      await searchProjects({ term: 'test project' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('term=test+project');
    });

    it('should pass exact_match=true when specified', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchProjects } = await getProjectsTools();

      await searchProjects({ term: 'exact', exact_match: true });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('exact_match=true');
    });

    it('should not send include_fields (invalid in v2 search)', async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchProjects } = await getProjectsTools();

      await searchProjects({ term: 'test', include_fields: 'tasks' } as Record<string, unknown>);

      const [url] = mockFn.mock.calls[0];
      expect(url).not.toContain('include_fields');
    });

    it('should return isError on API error', async () => {
      mockApiError(400, 'Bad request');
      const { searchProjects } = await getProjectsTools();

      const result = await searchProjects({ term: 'test' });

      expect(result.isError).toBe(true);
    });
  });

  describe('listProjectTasks', () => {
    it('should return tasks with summary', async () => {
      const tasks = [
        { id: 1, title: 'Task 1', project_id: 1 },
        { id: 2, title: 'Task 2', project_id: 1 },
      ];
      mockFetch({ data: tasks, additional_data: paginationFixtures.v2NoMore });
      const { listProjectTasks } = await getProjectsTools();

      const result = await listProjectTasks({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('2 tasks');
      expect(parsed.data).toHaveLength(2);
    });

    it('should call the v2 /tasks endpoint with project_id filter (not v1 /projects/{id}/tasks)', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProjectTasks } = await getProjectsTools();

      await listProjectTasks({ id: 1 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/tasks');
      expect(url).toContain('project_id=1');
      expect(url).not.toContain('/v1/');
      expect(url).not.toContain('/projects/1/tasks');
    });

    it('should handle v2 cursor pagination (has_more=true)', async () => {
      mockFetch({ data: [{ id: 1, project_id: 1 }], additional_data: { next_cursor: 'NEXT' } });
      const { listProjectTasks } = await getProjectsTools();

      const result = await listProjectTasks({ id: 1, cursor: 'c0' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination.has_more).toBe(true);
      expect(parsed.pagination.next_cursor).toBe('NEXT');
    });

    it('should send the cursor on the wire', async () => {
      const mockFn = mockApiSuccess([]);
      const { listProjectTasks } = await getProjectsTools();

      await listProjectTasks({ id: 1, cursor: 'abc' });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('cursor=abc');
    });

    it('should return isError on API error (simulates missing add-on)', async () => {
      mockApiError(403, 'Access denied');
      const { listProjectTasks } = await getProjectsTools();

      const result = await listProjectTasks({ id: 1 });

      expect(result.isError).toBe(true);
    });
  });

  describe('tool registration smoke check', () => {
    it('should have all 8 project tools registered in allTools', async () => {
      const { allTools } = await import('../../../src/tools/index.js');
      const projectToolNames = [
        'pipedrive_list_projects',
        'pipedrive_get_project',
        'pipedrive_create_project',
        'pipedrive_update_project',
        'pipedrive_delete_project',
        'pipedrive_search_projects',
        'pipedrive_archive_project',
        'pipedrive_list_project_tasks',
      ];
      for (const name of projectToolNames) {
        expect(allTools.some(t => t.name === name)).toBe(true);
      }
    });
  });
});

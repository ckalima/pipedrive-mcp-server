/**
 * Integration tests for board and phase tools (U3: full CRUD)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupValidEnv } from '../../helpers/mockEnv.js';
import {
  mockFetch,
  mockApiSuccess,
  mockApiError,
} from '../../helpers/mockFetch.js';

const board = {
  id: 1,
  name: 'Test Board',
  order_nr: 1,
  add_time: '2024-01-01T00:00:00Z',
  update_time: '2024-01-01T00:00:00Z',
};

const phase = {
  id: 10,
  name: 'Test Phase',
  board_id: 1,
  order_nr: 1,
  add_time: '2024-01-01T00:00:00Z',
  update_time: '2024-01-01T00:00:00Z',
};

function createBoardsFixture(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...board,
    id: i + 1,
    name: `Board ${i + 1}`,
    order_nr: i + 1,
  }));
}

function createPhasesFixture(count: number, boardId = 1) {
  return Array.from({ length: count }, (_, i) => ({
    ...phase,
    id: i + 1,
    name: `Phase ${i + 1}`,
    board_id: boardId,
    order_nr: i + 1,
  }));
}

// Dynamic import to avoid module caching issues with mocks
async function getBoardsTools() {
  return import('../../../src/tools/boards.js');
}

describe('boards tools', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  // ─── listBoards ────────────────────────────────────────────────────────────

  describe('listBoards', () => {
    it('returns all boards with summary using "project board"', async () => {
      const boards = createBoardsFixture(3);
      mockFetch({ data: boards });
      const { listBoards } = await getBoardsTools();

      const result = await listBoards({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('project board');
      expect(parsed.summary).toContain('3');
      expect(parsed.data).toHaveLength(3);
    });

    it('pluralizes correctly for 1 board', async () => {
      mockFetch({ data: createBoardsFixture(1) });
      const { listBoards } = await getBoardsTools();

      const result = await listBoards({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('1 project board');
      expect(parsed.summary).not.toContain('1 project boards');
    });

    it('pluralizes correctly for multiple boards', async () => {
      mockFetch({ data: createBoardsFixture(4) });
      const { listBoards } = await getBoardsTools();

      const result = await listBoards({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('project boards');
    });

    it('does NOT include a pagination key in the response', async () => {
      mockFetch({ data: createBoardsFixture(2) });
      const { listBoards } = await getBoardsTools();

      const result = await listBoards({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination).toBeUndefined();
    });

    it('calls GET /api/v2/boards', async () => {
      const mockFn = mockApiSuccess(createBoardsFixture(1));
      const { listBoards } = await getBoardsTools();

      await listBoards({});

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/boards');
    });

    it('returns isError:true on API failure', async () => {
      mockApiError(500, 'Internal server error');
      const { listBoards } = await getBoardsTools();

      const result = await listBoards({});

      expect(result.isError).toBe(true);
    });
  });

  // ─── getBoard ──────────────────────────────────────────────────────────────

  describe('getBoard', () => {
    it('returns board data with summary "Project board {id}"', async () => {
      mockApiSuccess(board);
      const { getBoard } = await getBoardsTools();

      const result = await getBoard({ id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Project board 1');
      expect(parsed.data).toBeDefined();
    });

    it('calls GET /api/v2/boards/{id}', async () => {
      const mockFn = mockApiSuccess(board);
      const { getBoard } = await getBoardsTools();

      await getBoard({ id: 42 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/boards/42');
    });

    it('returns isError:true on 404', async () => {
      mockApiError(404, 'Board not found');
      const { getBoard } = await getBoardsTools();

      const result = await getBoard({ id: 999 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('NOT_FOUND');
    });

    it('returns isError:true on API failure', async () => {
      mockApiError(500, 'Server error');
      const { getBoard } = await getBoardsTools();

      const result = await getBoard({ id: 1 });

      expect(result.isError).toBe(true);
    });
  });

  // ─── createBoard ───────────────────────────────────────────────────────────

  describe('createBoard', () => {
    it('returns summary "Project board created"', async () => {
      mockApiSuccess({ ...board, id: 5, name: 'New Board' });
      const { createBoard } = await getBoardsTools();

      const result = await createBoard({ name: 'New Board' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Project board created');
      expect(parsed.data).toBeDefined();
    });

    it('sends POST to /api/v2/boards', async () => {
      const mockFn = mockApiSuccess(board);
      const { createBoard } = await getBoardsTools();

      await createBoard({ name: 'New Board' });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/boards');
      expect(options.method).toBe('POST');
    });

    it('sends name in body', async () => {
      const mockFn = mockApiSuccess(board);
      const { createBoard } = await getBoardsTools();

      await createBoard({ name: 'Sprint Board' });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.name).toBe('Sprint Board');
    });

    it('sends order_nr in body when provided', async () => {
      const mockFn = mockApiSuccess(board);
      const { createBoard } = await getBoardsTools();

      await createBoard({ name: 'Board', order_nr: 3 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.name).toBe('Board');
      expect(body.order_nr).toBe(3);
    });

    it('excludes order_nr from body when absent', async () => {
      const mockFn = mockApiSuccess(board);
      const { createBoard } = await getBoardsTools();

      await createBoard({ name: 'Board' });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.order_nr).toBeUndefined();
    });

    it('returns isError:true on API failure', async () => {
      mockApiError(400, 'Bad request');
      const { createBoard } = await getBoardsTools();

      const result = await createBoard({ name: 'Board' });

      expect(result.isError).toBe(true);
    });
  });

  // ─── updateBoard ───────────────────────────────────────────────────────────

  describe('updateBoard', () => {
    it('sends PATCH to /api/v2/boards/{id}', async () => {
      const mockFn = mockApiSuccess(board);
      const { updateBoard } = await getBoardsTools();

      await updateBoard({ id: 1 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/boards/1');
      expect(options.method).toBe('PATCH');
    });

    it('id goes into path, not body', async () => {
      const mockFn = mockApiSuccess(board);
      const { updateBoard } = await getBoardsTools();

      await updateBoard({ id: 7, name: 'Updated' });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/boards/7');
      const body = JSON.parse(options.body);
      expect(body.id).toBeUndefined();
    });

    it('sends only defined fields in body', async () => {
      const mockFn = mockApiSuccess(board);
      const { updateBoard } = await getBoardsTools();

      await updateBoard({ id: 1, name: 'Renamed Board' });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.name).toBe('Renamed Board');
      expect(body.order_nr).toBeUndefined();
    });

    it('empty update sends empty body', async () => {
      const mockFn = mockApiSuccess(board);
      const { updateBoard } = await getBoardsTools();

      await updateBoard({ id: 1 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(Object.keys(body)).toHaveLength(0);
    });

    it('returns summary containing "updated"', async () => {
      mockApiSuccess(board);
      const { updateBoard } = await getBoardsTools();

      const result = await updateBoard({ id: 7, name: 'New Name' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('7');
      expect(parsed.summary).toContain('updated');
    });

    it('returns isError:true on API failure', async () => {
      mockApiError(404, 'Board not found');
      const { updateBoard } = await getBoardsTools();

      const result = await updateBoard({ id: 999, name: 'X' });

      expect(result.isError).toBe(true);
    });
  });

  // ─── deleteBoard ───────────────────────────────────────────────────────────

  describe('deleteBoard', () => {
    it('returns guard error (no fetch) when PIPEDRIVE_ENABLE_DESTRUCTIVE is unset', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const mockFn = vi.fn();
      vi.stubGlobal('fetch', mockFn);

      const { deleteBoard } = await getBoardsTools();
      const result = await deleteBoard({ id: 1 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('calls DELETE /api/v2/boards/{id} with PIPEDRIVE_ENABLE_DESTRUCTIVE=true', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: 1 });
      const { deleteBoard } = await getBoardsTools();

      await deleteBoard({ id: 1 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/boards/1');
      expect(options.method).toBe('DELETE');
    });

    it('summary says "Project board {id} deleted"', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ id: 5 });
      const { deleteBoard } = await getBoardsTools();

      const result = await deleteBoard({ id: 5 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Project board 5 deleted');
    });

    it('returns isError:true on API failure', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiError(404, 'Board not found');
      const { deleteBoard } = await getBoardsTools();

      const result = await deleteBoard({ id: 999 });

      expect(result.isError).toBe(true);
    });
  });
});

describe('phases tools', () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  // ─── listPhases ────────────────────────────────────────────────────────────

  describe('listPhases', () => {
    it('returns phases with summary using "project phase"', async () => {
      const phases = createPhasesFixture(3);
      mockFetch({ data: phases });
      const { listPhases } = await getBoardsTools();

      const result = await listPhases({ board_id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('project phase');
      expect(parsed.summary).toContain('3');
      expect(parsed.data).toHaveLength(3);
    });

    it('includes board_id in query string', async () => {
      const mockFn = mockApiSuccess(createPhasesFixture(1));
      const { listPhases } = await getBoardsTools();

      await listPhases({ board_id: 7 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('board_id=7');
    });

    it('calls GET /api/v2/phases', async () => {
      const mockFn = mockApiSuccess(createPhasesFixture(1));
      const { listPhases } = await getBoardsTools();

      await listPhases({ board_id: 1 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/phases');
    });

    it('does NOT include a pagination key in the response', async () => {
      mockFetch({ data: createPhasesFixture(2) });
      const { listPhases } = await getBoardsTools();

      const result = await listPhases({ board_id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.pagination).toBeUndefined();
    });

    it('returns isError:true on API failure', async () => {
      mockApiError(500, 'Internal server error');
      const { listPhases } = await getBoardsTools();

      const result = await listPhases({ board_id: 1 });

      expect(result.isError).toBe(true);
    });
  });

  // ─── getPhase ──────────────────────────────────────────────────────────────

  describe('getPhase', () => {
    it('returns phase data with summary "Project phase {id}"', async () => {
      mockApiSuccess(phase);
      const { getPhase } = await getBoardsTools();

      const result = await getPhase({ id: 10 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Project phase 10');
      expect(parsed.data).toBeDefined();
    });

    it('calls GET /api/v2/phases/{id}', async () => {
      const mockFn = mockApiSuccess(phase);
      const { getPhase } = await getBoardsTools();

      await getPhase({ id: 55 });

      const [url] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/phases/55');
    });

    it('returns isError:true on 404', async () => {
      mockApiError(404, 'Phase not found');
      const { getPhase } = await getBoardsTools();

      const result = await getPhase({ id: 999 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('NOT_FOUND');
    });
  });

  // ─── createPhase ───────────────────────────────────────────────────────────

  describe('createPhase', () => {
    it('returns summary "Project phase created"', async () => {
      mockApiSuccess({ ...phase, id: 20, name: 'New Phase' });
      const { createPhase } = await getBoardsTools();

      const result = await createPhase({ name: 'New Phase', board_id: 1 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Project phase created');
      expect(parsed.data).toBeDefined();
    });

    it('sends POST to /api/v2/phases', async () => {
      const mockFn = mockApiSuccess(phase);
      const { createPhase } = await getBoardsTools();

      await createPhase({ name: 'Phase', board_id: 1 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/phases');
      expect(options.method).toBe('POST');
    });

    it('sends name and board_id in body', async () => {
      const mockFn = mockApiSuccess(phase);
      const { createPhase } = await getBoardsTools();

      await createPhase({ name: 'Sprint Phase', board_id: 5 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.name).toBe('Sprint Phase');
      expect(body.board_id).toBe(5);
    });

    it('sends order_nr in body when provided', async () => {
      const mockFn = mockApiSuccess(phase);
      const { createPhase } = await getBoardsTools();

      await createPhase({ name: 'Phase', board_id: 1, order_nr: 2 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.order_nr).toBe(2);
    });

    it('excludes order_nr from body when absent', async () => {
      const mockFn = mockApiSuccess(phase);
      const { createPhase } = await getBoardsTools();

      await createPhase({ name: 'Phase', board_id: 1 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.order_nr).toBeUndefined();
    });

    it('returns isError:true on API failure', async () => {
      mockApiError(400, 'Bad request');
      const { createPhase } = await getBoardsTools();

      const result = await createPhase({ name: 'Phase', board_id: 1 });

      expect(result.isError).toBe(true);
    });
  });

  // ─── updatePhase ───────────────────────────────────────────────────────────

  describe('updatePhase', () => {
    it('sends PATCH to /api/v2/phases/{id}', async () => {
      const mockFn = mockApiSuccess(phase);
      const { updatePhase } = await getBoardsTools();

      await updatePhase({ id: 10 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/phases/10');
      expect(options.method).toBe('PATCH');
    });

    it('id goes into path, not body', async () => {
      const mockFn = mockApiSuccess(phase);
      const { updatePhase } = await getBoardsTools();

      await updatePhase({ id: 10, name: 'Updated' });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/phases/10');
      const body = JSON.parse(options.body);
      expect(body.id).toBeUndefined();
    });

    it('board_id can be sent in body to re-parent a phase', async () => {
      const mockFn = mockApiSuccess(phase);
      const { updatePhase } = await getBoardsTools();

      await updatePhase({ id: 10, board_id: 99 });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.board_id).toBe(99);
    });

    it('sends only defined fields in body', async () => {
      const mockFn = mockApiSuccess(phase);
      const { updatePhase } = await getBoardsTools();

      await updatePhase({ id: 10, name: 'Renamed Phase' });

      const [, options] = mockFn.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.name).toBe('Renamed Phase');
      expect(body.board_id).toBeUndefined();
      expect(body.order_nr).toBeUndefined();
    });

    it('returns summary containing "updated"', async () => {
      mockApiSuccess(phase);
      const { updatePhase } = await getBoardsTools();

      const result = await updatePhase({ id: 10, name: 'New Name' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toContain('10');
      expect(parsed.summary).toContain('updated');
    });

    it('returns isError:true on API failure', async () => {
      mockApiError(404, 'Phase not found');
      const { updatePhase } = await getBoardsTools();

      const result = await updatePhase({ id: 999 });

      expect(result.isError).toBe(true);
    });
  });

  // ─── deletePhase ───────────────────────────────────────────────────────────

  describe('deletePhase', () => {
    it('returns guard error (no fetch) when PIPEDRIVE_ENABLE_DESTRUCTIVE is unset', async () => {
      delete process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE;
      const mockFn = vi.fn();
      vi.stubGlobal('fetch', mockFn);

      const { deletePhase } = await getBoardsTools();
      const result = await deletePhase({ id: 10 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DESTRUCTIVE_DISABLED');
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('calls DELETE /api/v2/phases/{id} with PIPEDRIVE_ENABLE_DESTRUCTIVE=true', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      const mockFn = mockApiSuccess({ id: 10 });
      const { deletePhase } = await getBoardsTools();

      await deletePhase({ id: 10 });

      const [url, options] = mockFn.mock.calls[0];
      expect(url).toContain('/api/v2/phases/10');
      expect(options.method).toBe('DELETE');
    });

    it('summary says "Project phase {id} deleted"', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiSuccess({ id: 10 });
      const { deletePhase } = await getBoardsTools();

      const result = await deletePhase({ id: 10 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.summary).toBe('Project phase 10 deleted');
    });

    it('returns isError:true on API failure', async () => {
      process.env.PIPEDRIVE_ENABLE_DESTRUCTIVE = 'true';
      mockApiError(404, 'Phase not found');
      const { deletePhase } = await getBoardsTools();

      const result = await deletePhase({ id: 999 });

      expect(result.isError).toBe(true);
    });
  });
});

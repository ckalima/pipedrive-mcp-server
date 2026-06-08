/**
 * Test fixture utilities
 */

import { fixtures as mockFixtures, paginationFixtures } from './mockFetch.js';

// Re-export common fixtures
export { mockFixtures as fixtures, paginationFixtures };

/**
 * Creates a list of deals for testing
 */
export function createDealsFixture(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    ...mockFixtures.deal,
    id: i + 1,
    title: `Test Deal ${i + 1}`,
    value: 10000 * (i + 1),
  }));
}

/**
 * Creates a list of persons for testing
 */
export function createPersonsFixture(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    ...mockFixtures.person,
    id: i + 1,
    name: `Test Person ${i + 1}`,
    emails: [{ value: `person${i + 1}@example.com`, primary: true }],
  }));
}

/**
 * Creates a list of organizations for testing
 */
export function createOrganizationsFixture(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    ...mockFixtures.organization,
    id: i + 1,
    name: `Test Organization ${i + 1}`,
  }));
}

/**
 * Creates a list of activities for testing
 */
export function createActivitiesFixture(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    ...mockFixtures.activity,
    id: i + 1,
    subject: `Test Activity ${i + 1}`,
  }));
}

/**
 * Creates a search result fixture
 */
export function createSearchResultsFixture(items: unknown[]) {
  return {
    items: items.map((item, i) => ({
      result_score: 1 - i * 0.1,
      item,
    })),
  };
}

/**
 * Creates error response fixture
 */
export function createErrorFixture(code: string, message: string, suggestion?: string) {
  return {
    error: {
      code,
      message,
      suggestion,
    },
  };
}

/**
 * Creates field fixture
 */
export function createFieldFixture(key: string, name: string, type: string) {
  return {
    id: 1,
    key,
    name,
    field_type: type,
    add_time: '2024-01-01T00:00:00Z',
    update_time: '2024-01-01T00:00:00Z',
    active_flag: true,
    edit_flag: true,
  };
}

/**
 * Creates mail thread fixture
 */
export function createMailThreadFixture(id: number = 1) {
  return {
    id,
    subject: 'Test Email Thread',
    mail_thread_participants: [
      { person_id: 1, name: 'Test Person', email: 'test@example.com' },
    ],
    snippet: 'This is a test email thread...',
    deal_id: 1,
    message_count: 3,
    read_flag: true,
    archived_flag: false,
    add_time: '2024-01-01T00:00:00Z',
    update_time: '2024-01-02T00:00:00Z',
  };
}

/**
 * Creates mail message fixture
 */
export function createMailMessageFixture(id: number = 1) {
  return {
    id,
    mail_thread_id: 1,
    subject: 'Test Email',
    from: [{ email: 'sender@example.com', name: 'Sender' }],
    to: [{ email: 'recipient@example.com', name: 'Recipient' }],
    body: '<p>Test email body</p>',
    body_html: '<p>Test email body</p>',
    snippet: 'Test email body',
    read_flag: true,
    has_attachments_flag: false,
    add_time: '2024-01-01T00:00:00Z',
  };
}

/**
 * Creates a list of notes for testing
 */
export function createNotesFixture(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    ...mockFixtures.note,
    id: i + 1,
    content: `<p>Test note ${i + 1}</p>`,
  }));
}

/**
 * Creates a list of leads for testing
 */
export function createLeadsFixture(count: number = 3) {
  return Array.from({ length: count }, (_, i) => ({
    ...mockFixtures.lead,
    id: `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`,
    title: `Test Lead ${i + 1}`,
  }));
}

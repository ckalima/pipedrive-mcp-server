/**
 * Contract tests — POST/PATCH request-body conformance against openapi-v2.yaml.
 *
 * Each test drives the REAL handler through the mocked `fetch`, captures the
 * outbound JSON body, and asserts it conforms to the v2 spec for the matching
 * operationId. A wrong shape (key not in v2, or a value whose runtime type
 * contradicts the spec `type`) makes `assertBodyConformsToSpec` throw, failing
 * the test. See plan §2.3 / §2.5.
 *
 * These pass on current `main` (the P0s are fixed). Their value is forward-
 * looking — the comment on each test names the historical src revert under which
 * it MUST fail (the harness is a real gate, not theater).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupValidEnv } from "../helpers/mockEnv.js";
import { mockApiSuccess, fixtures } from "../helpers/mockFetch.js";
import { assertBodyConformsToSpec } from "./helpers/openapiContract.js";

/** Capture the JSON body of the single mocked outbound call. */
function capturedBody(mockFn: ReturnType<typeof mockApiSuccess>): unknown {
  const [, init] = mockFn.mock.calls[0] as [unknown, { body?: string }];
  return JSON.parse(init.body as string);
}

describe("request-body contract (v2)", () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe("persons", () => {
    // Revert-proof: FAILS if the handler reverts to scalar `body.email`/`body.phone`
    // (#42 pre-fix) — `email`/`phone` are not allowed v2 keys, and a string value
    // contradicts the `emails: array` spec type.
    it("addPerson body conforms (emails/phones are arrays)", async () => {
      const mockFn = mockApiSuccess(fixtures.person);
      const { createPerson } = await import("../../src/tools/persons.js");

      await createPerson({
        name: "Jane Doe",
        emails: [{ value: "jane@example.com", primary: true, label: "work" }],
        phones: [{ value: "+1234567890", primary: true }],
        org_id: 5,
        visible_to: 7,
        marketing_status: "subscribed",
        label_ids: [1, 2],
        custom_fields: { abc1234567890abc1234567890abc1234567890a: "x" },
      });

      expect(() => assertBodyConformsToSpec("addPerson", capturedBody(mockFn))).not.toThrow();
    });

    it("updatePerson body conforms (emails/phones are arrays)", async () => {
      const mockFn = mockApiSuccess(fixtures.person);
      const { updatePerson } = await import("../../src/tools/persons.js");

      await updatePerson({
        id: 1,
        name: "Updated",
        emails: [{ value: "new@example.com", primary: true }],
        phones: [{ value: "+1999", primary: true }],
        org_id: 10,
      });

      expect(() => assertBodyConformsToSpec("updatePerson", capturedBody(mockFn))).not.toThrow();
    });
  });

  describe("organizations", () => {
    // Revert-proof: FAILS if `address` reverts to a string (#44 pre-fix) — the spec
    // declares `address: object`, so a string value fails the type check.
    it("addOrganization body conforms (address is an object)", async () => {
      const mockFn = mockApiSuccess(fixtures.organization);
      const { createOrganization } = await import("../../src/tools/organizations.js");

      await createOrganization({
        name: "TechCorp Inc",
        address: { value: "100 Tech Way", locality: "Springfield", postal_code: "00001" },
        owner_id: 3,
        visible_to: 3,
        label_ids: [9],
      });

      expect(() => assertBodyConformsToSpec("addOrganization", capturedBody(mockFn))).not.toThrow();
    });

    it("updateOrganization body conforms (address is an object)", async () => {
      const mockFn = mockApiSuccess(fixtures.organization);
      const { updateOrganization } = await import("../../src/tools/organizations.js");

      await updateOrganization({
        id: 1,
        name: "TechCorp Renamed",
        address: { value: "200 New Way" },
      });

      expect(() => assertBodyConformsToSpec("updateOrganization", capturedBody(mockFn))).not.toThrow();
    });
  });

  describe("activities", () => {
    // Revert-proof: FAILS if `location` reverts to a string or `done` to a number
    // (#45 pre-fix) — spec says `location: object`, `done: boolean`.
    it("addActivity body conforms (location object, done boolean)", async () => {
      const mockFn = mockApiSuccess(fixtures.activity);
      const { createActivity } = await import("../../src/tools/activities.js");

      await createActivity({
        subject: "Kickoff",
        type: "meeting",
        due_date: "2024-02-01",
        due_time: "10:00",
        done: true,
        busy: false,
        location: { value: "1 Infinite Loop", locality: "Cupertino" },
        participants: [{ person_id: 1, primary: true }],
        attendees: [{ email: "ext@example.com", name: "Ext" }],
        priority: 2,
      });

      expect(() => assertBodyConformsToSpec("addActivity", capturedBody(mockFn))).not.toThrow();
    });

    it("updateActivity body conforms (location object, done boolean)", async () => {
      const mockFn = mockApiSuccess(fixtures.activity);
      const { updateActivity } = await import("../../src/tools/activities.js");

      await updateActivity({
        id: 1,
        done: true,
        location: { value: "Conference Room B" },
      });

      expect(() => assertBodyConformsToSpec("updateActivity", capturedBody(mockFn))).not.toThrow();
    });
  });

  describe("deals", () => {
    // Revert-proof: FAILS if `add_time` is re-added to the create body (#48 1i) —
    // `add_time` is NOT an allowed property of the addDeal request body.
    it("addDeal body conforms (no add_time on create; valid status)", async () => {
      const mockFn = mockApiSuccess(fixtures.deal);
      const { createDeal } = await import("../../src/tools/deals.js");

      await createDeal({
        title: "Big Deal",
        value: 10000,
        currency: "USD",
        pipeline_id: 1,
        stage_id: 2,
        status: "open",
        probability: 50,
        visible_to: 7,
        label_ids: [4],
      });

      expect(() => assertBodyConformsToSpec("addDeal", capturedBody(mockFn))).not.toThrow();
    });

    it("updateDeal body conforms", async () => {
      const mockFn = mockApiSuccess(fixtures.deal);
      const { updateDeal } = await import("../../src/tools/deals.js");

      await updateDeal({
        id: 1,
        title: "Renamed Deal",
        value: 12000,
        status: "won",
        won_time: "2024-03-01 12:00:00",
        lost_reason: undefined,
      });

      expect(() => assertBodyConformsToSpec("updateDeal", capturedBody(mockFn))).not.toThrow();
    });
  });

  describe("projects", () => {
    // Revert-proof: FAILS if the handler reverts to singular `person_id`/`org_id`/
    // `labels` (#43 pre-fix) — only the plural `*_ids` arrays are allowed v2 keys.
    it("addProject body conforms (person_ids/org_ids/label_ids are arrays)", async () => {
      const mockFn = mockApiSuccess({ id: 1, title: "P" });
      const { createProject } = await import("../../src/tools/projects.js");

      await createProject({
        title: "Launch",
        board_id: 1,
        phase_id: 2,
        description: "desc",
        status: "open",
        start_date: "2024-01-01",
        end_date: "2024-06-01",
        deal_ids: [1, 2],
        person_ids: [3, 4],
        org_ids: [5],
        label_ids: [6],
      });

      expect(() => assertBodyConformsToSpec("addProject", capturedBody(mockFn))).not.toThrow();
    });

    it("updateProject body conforms (person_ids/org_ids/label_ids are arrays)", async () => {
      const mockFn = mockApiSuccess({ id: 1, title: "P" });
      const { updateProject } = await import("../../src/tools/projects.js");

      await updateProject({
        id: 1,
        title: "Launch v2",
        person_ids: [7],
        org_ids: [8],
        label_ids: [9],
      });

      expect(() => assertBodyConformsToSpec("updateProject", capturedBody(mockFn))).not.toThrow();
    });
  });

  describe("products", () => {
    // Products were deferred from the contract harness at ship time (#50 → #75).
    // Revert-proof: FAILS if `prices` is sent as a scalar/object instead of an
    // array, or `custom_fields` as a non-object — the spec declares `prices: array`,
    // `custom_fields: object`.
    it("addProduct body conforms (prices array, custom_fields object)", async () => {
      const mockFn = mockApiSuccess({ id: 1, name: "Widget" });
      const { createProduct } = await import("../../src/tools/products.js");

      await createProduct({
        name: "Widget",
        code: "W-1",
        description: "A widget",
        unit: "each",
        tax: 10,
        category: 5,
        owner_id: 3,
        is_linkable: true,
        visible_to: 7,
        prices: [{ currency: "USD", price: 100, cost: 40 }],
        custom_fields: { abc1234567890abc1234567890abc1234567890a: "x" },
        billing_frequency: "monthly",
        billing_frequency_cycles: 12,
      });

      expect(() => assertBodyConformsToSpec("addProduct", capturedBody(mockFn))).not.toThrow();
    });

    it("updateProduct body conforms (prices array, custom_fields object)", async () => {
      const mockFn = mockApiSuccess({ id: 1, name: "Widget" });
      const { updateProduct } = await import("../../src/tools/products.js");

      await updateProduct({
        id: 1,
        name: "Widget v2",
        code: "W-2",
        tax: 12,
        prices: [{ currency: "EUR", price: 90 }],
        custom_fields: { abc1234567890abc1234567890abc1234567890a: "y" },
      });

      expect(() => assertBodyConformsToSpec("updateProduct", capturedBody(mockFn))).not.toThrow();
    });
  });
});

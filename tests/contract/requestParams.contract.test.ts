/**
 * Contract tests — GET list/search query-param conformance against openapi-v2.yaml.
 *
 * Each test drives the REAL handler through the mocked `fetch`, captures the
 * outbound URL, and asserts every query param is an allowed v2 parameter and
 * (where the spec constrains it) carries an in-enum value. `assertQueryConforms-
 * ToSpec` throws on an unknown param (catches re-added invalid params — #48) or
 * an out-of-enum value (catches `status=all_not_deleted` — #46). See plan §2.3.
 *
 * Auth is ignored by the checker: v2 sends the token as the `x-api-token` header,
 * not a query param, so no `api_token` key appears here.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupValidEnv } from "../helpers/mockEnv.js";
import { mockApiSuccess } from "../helpers/mockFetch.js";
import { assertQueryConformsToSpec } from "./helpers/openapiContract.js";

/** Capture the outbound URL of the single mocked call. */
function capturedUrl(mockFn: ReturnType<typeof mockApiSuccess>): string {
  const [url] = mockFn.mock.calls[0] as [unknown];
  return String(url);
}

describe("request-params contract (v2)", () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe("list endpoints", () => {
    // Revert-proof: FAILS if a removed invalid param (e.g. `first_char`) is re-sent
    // on the wire — it is not an allowed getPersons query parameter (#48 revert).
    it("getPersons list query conforms (no first_char)", async () => {
      const mockFn = mockApiSuccess([]);
      const { listPersons } = await import("../../src/tools/persons.js");

      await listPersons({
        limit: 50,
        owner_id: 1,
        org_id: 5,
        sort_by: "update_time",
        sort_direction: "asc",
      });

      expect(() => assertQueryConformsToSpec("getPersons", capturedUrl(mockFn))).not.toThrow();
    });

    it("getOrganizations list query conforms (no first_char)", async () => {
      const mockFn = mockApiSuccess([]);
      const { listOrganizations } = await import("../../src/tools/organizations.js");

      await listOrganizations({
        limit: 50,
        owner_id: 2,
        sort_by: "add_time",
        sort_direction: "desc",
      });

      expect(() => assertQueryConformsToSpec("getOrganizations", capturedUrl(mockFn))).not.toThrow();
    });

    // Revert-proof: FAILS if removed params `type`/`start_date`/`end_date`/`project_id`
    // are re-sent — none are allowed getActivities query parameters (#48 revert).
    it("getActivities list query conforms (no type/start_date/end_date/project_id)", async () => {
      const mockFn = mockApiSuccess([]);
      const { listActivities } = await import("../../src/tools/activities.js");

      await listActivities({
        limit: 50,
        owner_id: 1,
        deal_id: 2,
        done: true,
        sort_by: "due_date",
      });

      expect(() => assertQueryConformsToSpec("getActivities", capturedUrl(mockFn))).not.toThrow();
    });

    // Revert-proof: FAILS if `board_id`/`include_fields` are re-sent — neither is an
    // allowed getProjects query parameter (#48 revert).
    it("getProjects list query conforms (no board_id/include_fields)", async () => {
      const mockFn = mockApiSuccess([]);
      const { listProjects } = await import("../../src/tools/projects.js");

      await listProjects({
        limit: 50,
        filter_id: 7,
        phase_id: 3,
        status: "open",
      });

      expect(() => assertQueryConformsToSpec("getProjects", capturedUrl(mockFn))).not.toThrow();
    });

    // Revert-proof: FAILS if `status=all_not_deleted` is re-sent (#46) — the value is
    // outside the getDeals `status` enum [open, won, lost, deleted].
    it("getDeals list query conforms (status in enum)", async () => {
      const mockFn = mockApiSuccess([]);
      const { listDeals } = await import("../../src/tools/deals.js");

      await listDeals({
        limit: 50,
        pipeline_id: 1,
        stage_id: 2,
        status: "open",
        sort_by: "update_time",
      });

      expect(() => assertQueryConformsToSpec("getDeals", capturedUrl(mockFn))).not.toThrow();
    });

    // Products were deferred from the contract harness at ship time (#50 → #75).
    // Revert-proof: FAILS if a non-v2 param (e.g. a re-added `start`/`first_char`)
    // or an out-of-enum `sort_by` ever lands on the getProducts list query.
    it("getProducts list query conforms", async () => {
      const mockFn = mockApiSuccess([]);
      const { listProducts } = await import("../../src/tools/products.js");

      await listProducts({
        limit: 50,
        owner_id: 1,
        ids: "1,2,3",
        filter_id: 7,
        sort_by: "update_time",
        sort_direction: "asc",
        updated_since: "2024-01-01T00:00:00Z",
        custom_fields: "abc1234567890abc1234567890abc1234567890a",
      });

      expect(() => assertQueryConformsToSpec("getProducts", capturedUrl(mockFn))).not.toThrow();
    });
  });

  describe("search endpoints", () => {
    it("searchPersons query conforms", async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchPersons } = await import("../../src/tools/persons.js");

      await searchPersons({
        term: "jane",
        fields: "email,phone",
        org_id: 5,
        exact_match: true,
        limit: 25,
        cursor: "cur1",
      });

      expect(() => assertQueryConformsToSpec("searchPersons", capturedUrl(mockFn))).not.toThrow();
    });

    // NOTE: the v2 org-search operationId is `searchOrganization` (singular), not
    // `searchOrganizations` — verified against the spec (/organizations/search).
    it("searchOrganization query conforms", async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchOrganizations } = await import("../../src/tools/organizations.js");

      await searchOrganizations({
        term: "techcorp",
        exact_match: true,
        limit: 25,
      });

      expect(() => assertQueryConformsToSpec("searchOrganization", capturedUrl(mockFn))).not.toThrow();
    });

    // Revert-proof: FAILS if a status outside [open, won, lost] is sent on the wire —
    // the searchDeals `status` enum has no `deleted`/`all_not_deleted`.
    it("searchDeals query conforms (status in enum)", async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchDeals } = await import("../../src/tools/deals.js");

      await searchDeals({
        term: "big",
        fields: "title,notes",
        person_id: 1,
        org_id: 2,
        status: "open",
        exact_match: false,
        limit: 25,
      });

      expect(() => assertQueryConformsToSpec("searchDeals", capturedUrl(mockFn))).not.toThrow();
    });

    it("searchProjects query conforms", async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchProjects } = await import("../../src/tools/projects.js");

      await searchProjects({
        term: "launch",
        exact_match: true,
        limit: 25,
      });

      expect(() => assertQueryConformsToSpec("searchProjects", capturedUrl(mockFn))).not.toThrow();
    });

    // Revert-proof: FAILS if `fields` carries a token outside [code, custom_fields,
    // name] or `include_fields` outside [product.price] — both are enum-constrained
    // on searchProducts, unlike the looser person/deal search field lists.
    it("searchProducts query conforms (fields/include_fields in enum)", async () => {
      const mockFn = mockApiSuccess({ items: [] });
      const { searchProducts } = await import("../../src/tools/products.js");

      await searchProducts({
        term: "widget",
        fields: "name,code",
        exact_match: true,
        include_fields: "product.price",
        limit: 25,
        cursor: "cur1",
      });

      expect(() => assertQueryConformsToSpec("searchProducts", capturedUrl(mockFn))).not.toThrow();
    });
  });

  describe("field list endpoints", () => {
    it("getPersonFields query conforms", async () => {
      const mockFn = mockApiSuccess([]);
      const { listPersonFields } = await import("../../src/tools/fields.js");

      await listPersonFields({ limit: 50 });

      expect(() => assertQueryConformsToSpec("getPersonFields", capturedUrl(mockFn))).not.toThrow();
    });

    it("getDealFields query conforms", async () => {
      const mockFn = mockApiSuccess([]);
      const { listDealFields } = await import("../../src/tools/fields.js");

      await listDealFields({ limit: 50 });

      expect(() => assertQueryConformsToSpec("getDealFields", capturedUrl(mockFn))).not.toThrow();
    });

    it("getOrganizationFields query conforms", async () => {
      const mockFn = mockApiSuccess([]);
      const { listOrganizationFields } = await import("../../src/tools/fields.js");

      await listOrganizationFields({ limit: 50 });

      expect(() => assertQueryConformsToSpec("getOrganizationFields", capturedUrl(mockFn))).not.toThrow();
    });
  });
});

/**
 * Contract tests — response-field-name conformance against openapi-v2.yaml,
 * including the #60-catching test.
 *
 * Two parts (plan §2.4):
 *   1. Spec assertions proving the v2 field-list response keys each field on
 *      `field_code` (NOT `key`). These read the parsed spec directly and are
 *      revert-proof against the contract (claim G; field_code at
 *      openapi-v2.yaml:1456).
 *   2. A handler-level test that feeds `getField` a v2-shaped fixture keyed by
 *      `field_code` and asserts the field is found. #60 fixed `getField` to match
 *      on `field_code` (with a legacy `key` fallback), so this now passes as a
 *      normal `it` and serves as the regression guard: revert the handler to
 *      `.key`-only and this test goes red.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupValidEnv } from "../helpers/mockEnv.js";
import { mockApiSuccess } from "../helpers/mockFetch.js";
import { fieldResponseHasProperty } from "./helpers/openapiContract.js";

describe("response-shape contract (v2)", () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  describe("field response keys on field_code, not key (spec)", () => {
    it("getActivityFields response items declare field_code and NOT key", () => {
      expect(fieldResponseHasProperty("getActivityFields", "field_code")).toBe(true);
      expect(fieldResponseHasProperty("getActivityFields", "key")).toBe(false);
    });

    it("getPersonFields / getDealFields / getOrganizationFields key on field_code", () => {
      expect(fieldResponseHasProperty("getPersonFields", "field_code")).toBe(true);
      expect(fieldResponseHasProperty("getDealFields", "field_code")).toBe(true);
      expect(fieldResponseHasProperty("getOrganizationFields", "field_code")).toBe(true);
      // and none of them expose the legacy `key` property the handler matches on
      expect(fieldResponseHasProperty("getPersonFields", "key")).toBe(false);
      expect(fieldResponseHasProperty("getDealFields", "key")).toBe(false);
      expect(fieldResponseHasProperty("getOrganizationFields", "key")).toBe(false);
    });
  });

  describe("getField finds a v2 field_code-keyed field", () => {
    // #60 (FIXED): v2 field responses key on `field_code`, not `key`. getField now
    // matches `field_code` first (falling back to legacy `key`), so a field_code-only
    // (v2-shaped) field is found. This regression-guards the fix: revert getField to
    // `.key`-only and the narrow identity assertion below goes red.
    it("finds an activity field by its field_code (#60)", async () => {
      // v2-shaped field: keyed by `field_code`, with NO legacy `key` property.
      const v2Field = {
        field_code: "subject",
        field_name: "Subject",
        field_type: "varchar",
        is_custom_field: false,
        is_optional_response_field: false,
      };
      mockApiSuccess([v2Field]);
      const { getField } = await import("../../src/tools/fields.js");

      const result = await getField({ entity_type: "activity", key: "subject" });

      // Narrow assertion: the returned payload must carry the matched field's
      // field_code. Assert field_code identity FIRST (whitespace-robust) so a
      // regression (getField reverting to `.key`-only → "Field not found") lands
      // here, not on a JSON.parse crash of the not-found string.
      const text = result.content[0].text;
      expect(text).toContain('"field_code"');
      const parsed = JSON.parse(text);
      expect(parsed.data.field_code).toBe("subject");
    });
  });
});

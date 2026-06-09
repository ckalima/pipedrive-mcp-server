/**
 * Contract tests — response-field-name conformance against openapi-v2.yaml,
 * including the #60-catching test.
 *
 * Two parts (plan §2.4):
 *   1. Spec assertions proving the v2 field-list response keys each field on
 *      `field_code` (NOT `key`). These read the parsed spec directly and are
 *      revert-proof against the contract (claim G; field_code at
 *      openapi-v2.yaml:1456).
 *   2. A handler-level `it.fails` test that feeds `getField` a v2-shaped fixture
 *      keyed by `field_code` and asserts the field is found. `getField` currently
 *      matches on `.key` (src/tools/fields.ts:154), so it does NOT find a
 *      field_code-only object today — the test is EXPECTED to fail now. `it.fails`
 *      keeps the suite green while the gap exists AND turns RED the moment #60
 *      fixes the handler to read `field_code`, forcing follow-through.
 *
 * Out of scope here: fixing getField. That is #60.
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
    // KNOWN GAP #60: getField matches on `f.key` while v2 field responses key on
    // `field_code`. This test feeds a field_code-only (v2-shaped) field and asserts
    // it is found. It is EXPECTED TO FAIL today (handler looks up `.key`), hence
    // `it.fails`. When #60 fixes getField to read `field_code`, this starts passing,
    // which `it.fails` reports as a failure — forcing #60 to flip it back to `it`.
    // The assertion is narrow (one identity check) so a different failure cannot
    // masquerade as the expected gap.
    it.fails("finds an activity field by its field_code (KNOWN GAP #60)", async () => {
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
      // field_code. Today getField cannot match (it reads `.key`) and returns a
      // "Field not found" message, so this single check fails as expected.
      // Assert field_code identity FIRST (whitespace-robust) so the expected-fail
      // lands on the gap itself, not on a JSON.parse crash of the not-found string.
      const text = result.content[0].text;
      expect(text).toContain('"field_code"'); // #60: today text is "Field not found: ..." — fails here, not at JSON.parse
      const parsed = JSON.parse(text);
      expect(parsed.data.field_code).toBe("subject");
    });
  });
});

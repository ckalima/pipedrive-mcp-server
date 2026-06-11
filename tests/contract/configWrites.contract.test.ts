/**
 * Contract tests — config-write request-body conformance against openapi-v2.yaml.
 *
 * Covers the #70 config writes (PR #74), deferred from the harness at ship time
 * and tracked by #75: custom-field CRUD bodies, the field-option bulk verbs, and
 * pipeline/stage create/update bodies. Each test drives the REAL handler through
 * the mocked `fetch`, captures the outbound JSON body, and asserts it conforms to
 * the v2 spec for the matching operationId.
 *
 * Two body *shapes* appear here:
 *  - object bodies (field/pipeline/stage create+update) → `assertBodyConformsToSpec`.
 *  - top-level ARRAY bodies (updateDealFieldOptions PATCH, deleteDealFieldOptions
 *    body-bearing DELETE) → `assertArrayBodyConformsToSpec`.
 *
 * The forward-looking value (per test comment) is the v2-rename guard: field
 * writes must send `field_name`/`field_type` (not v1 `name`/`type`); pipelines
 * `is_deal_probability_enabled` (not v1 `deal_probability`); stages
 * `is_deal_rot_enabled`/`days_to_rotten` (not v1 `rotten_flag`/`rotten_days`).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupValidEnv } from "../helpers/mockEnv.js";
import { mockApiSuccess, fixtures } from "../helpers/mockFetch.js";
import {
  assertBodyConformsToSpec,
  assertArrayBodyConformsToSpec,
} from "./helpers/openapiContract.js";

/** Capture the JSON body of the single mocked outbound call (object or array). */
function capturedBody(mockFn: ReturnType<typeof mockApiSuccess>): unknown {
  const [, init] = mockFn.mock.calls[0] as [unknown, { body?: string }];
  return JSON.parse(init.body as string);
}

const FIELD_CODE = "abc1234567890abc1234567890abc1234567890a"; // 40-char field_code hash

describe("config-write request-body contract (v2)", () => {
  beforeEach(() => {
    setupValidEnv();
    vi.unstubAllGlobals();
  });

  // ── Custom-field CRUD bodies ──────────────────────────────────────────────
  describe("custom-field create/update", () => {
    // Revert-proof: FAILS if the handler reverts to the v1 `name`/`type` keys —
    // v2 renamed them to `field_name`/`field_type`, and neither v1 key is an
    // allowed addDealField body property.
    it("addDealField body conforms (field_name/field_type, object sub-shapes)", async () => {
      const mockFn = mockApiSuccess({ id: 1, field_code: FIELD_CODE });
      const { createDealField } = await import("../../src/tools/fields.js");

      await createDealField({
        field_name: "Priority",
        field_type: "enum",
        options: [{ label: "High" }, { label: "Low" }],
        ui_visibility: { add_visible_flag: true, details_visible_flag: true },
        important_fields: { enabled: true, stage_ids: [1, 2] },
        required_fields: { enabled: false },
        description: "Deal priority",
      });

      expect(() => assertBodyConformsToSpec("addDealField", capturedBody(mockFn))).not.toThrow();
    });

    it("updateDealField body conforms (no field_type on update)", async () => {
      const mockFn = mockApiSuccess({ id: 1, field_code: FIELD_CODE });
      const { updateDealField } = await import("../../src/tools/fields.js");

      await updateDealField({
        field_code: FIELD_CODE,
        field_name: "Priority (renamed)",
        ui_visibility: { details_visible_flag: false },
        important_fields: { enabled: false },
        required_fields: { enabled: true, stage_ids: [3] },
        description: "Updated description",
      });

      expect(() => assertBodyConformsToSpec("updateDealField", capturedBody(mockFn))).not.toThrow();
    });

    // Person/org fields share the deal builder. Revert-proof: FAILS if the handler
    // sends the v1 `name`/`type` keys instead of v2 `field_name`/`field_type` (the
    // input sets the v2 names; the v1 names are not addPersonField properties).
    // The narrower person/org body (no `description`) is enforced by the Zod schema,
    // not by this body-shape check, which is fed a raw object and bypasses Zod.
    it("addPersonField body conforms (field_name/field_type, narrower body)", async () => {
      const mockFn = mockApiSuccess({ id: 1, field_code: FIELD_CODE });
      const { createPersonField } = await import("../../src/tools/fields.js");

      await createPersonField({
        field_name: "Segment",
        field_type: "set",
        options: [{ label: "A" }, { label: "B" }],
        ui_visibility: { details_visible_flag: true },
      });

      expect(() => assertBodyConformsToSpec("addPersonField", capturedBody(mockFn))).not.toThrow();
    });

    it("updatePersonField body conforms", async () => {
      const mockFn = mockApiSuccess({ id: 1, field_code: FIELD_CODE });
      const { updatePersonField } = await import("../../src/tools/fields.js");

      await updatePersonField({
        field_code: FIELD_CODE,
        field_name: "Segment (renamed)",
        ui_visibility: { add_visible_flag: false },
      });

      expect(() => assertBodyConformsToSpec("updatePersonField", capturedBody(mockFn))).not.toThrow();
    });

    it("addOrganizationField body conforms (no description)", async () => {
      const mockFn = mockApiSuccess({ id: 1, field_code: FIELD_CODE });
      const { createOrganizationField } = await import("../../src/tools/fields.js");

      await createOrganizationField({
        field_name: "Tier",
        field_type: "varchar",
        ui_visibility: { details_visible_flag: true },
      });

      expect(() => assertBodyConformsToSpec("addOrganizationField", capturedBody(mockFn))).not.toThrow();
    });

    it("updateOrganizationField body conforms", async () => {
      const mockFn = mockApiSuccess({ id: 1, field_code: FIELD_CODE });
      const { updateOrganizationField } = await import("../../src/tools/fields.js");

      await updateOrganizationField({
        field_code: FIELD_CODE,
        field_name: "Tier (renamed)",
        important_fields: { enabled: true, stage_ids: [] },
      });

      expect(() => assertBodyConformsToSpec("updateOrganizationField", capturedBody(mockFn))).not.toThrow();
    });

    // Product fields have the NARROWEST spec body: create allows only field_name/
    // field_type/options/ui_visibility; update allows only field_name/ui_visibility.
    // Revert-proof: FAILS if the handler sends v1 `name`/`type` instead of
    // `field_name`/`field_type`. The deal-only keys (description/important_fields/
    // required_fields) are excluded by the Zod schema, which this check bypasses.
    it("addProductField body conforms (narrow create shape)", async () => {
      const mockFn = mockApiSuccess({ id: 1, field_code: FIELD_CODE });
      const { createProductField } = await import("../../src/tools/fields.js");

      await createProductField({
        field_name: "Material",
        field_type: "enum",
        options: [{ label: "Steel" }, { label: "Wood" }],
        ui_visibility: { add_visible_flag: true },
      });

      expect(() => assertBodyConformsToSpec("addProductField", capturedBody(mockFn))).not.toThrow();
    });

    it("updateProductField body conforms (only field_name/ui_visibility)", async () => {
      const mockFn = mockApiSuccess({ id: 1, field_code: FIELD_CODE });
      const { updateProductField } = await import("../../src/tools/fields.js");

      await updateProductField({
        field_code: FIELD_CODE,
        field_name: "Material (renamed)",
        ui_visibility: { add_visible_flag: false },
      });

      expect(() => assertBodyConformsToSpec("updateProductField", capturedBody(mockFn))).not.toThrow();
    });
  });

  // ── Field-option bulk verbs (top-level ARRAY bodies) ──────────────────────
  describe("field-option bulk verbs (array bodies)", () => {
    // The PATCH body is a top-level array of {id, label}. Revert-proof: FAILS if
    // an element carries a key outside [id, label] or a label of the wrong type.
    it("updateDealFieldOptions body conforms (array of {id, label})", async () => {
      const mockFn = mockApiSuccess([{ id: 1, label: "Critical" }]);
      const { updateDealFieldOptions } = await import("../../src/tools/fields.js");

      await updateDealFieldOptions({
        field_code: FIELD_CODE,
        options: [
          { id: 1, label: "Critical" },
          { id: 2, label: "Normal" },
        ],
      });

      expect(() => assertArrayBodyConformsToSpec("updateDealFieldOptions", capturedBody(mockFn))).not.toThrow();
    });

    // Body-bearing DELETE: the handler maps option_ids → [{id}]. Revert-proof:
    // FAILS if it reverts to sending `{ option_id }` (key not in [id]) or raw
    // numbers instead of objects. (destructiveOperationGuard is satisfied by
    // setupValidEnv, which sets PIPEDRIVE_ENABLE_DESTRUCTIVE=true.)
    it("deleteDealFieldOptions body conforms (array of {id})", async () => {
      const mockFn = mockApiSuccess([{ id: 4, label: "Critical" }]);
      const { deleteDealFieldOptions } = await import("../../src/tools/fields.js");

      await deleteDealFieldOptions({
        field_code: FIELD_CODE,
        option_ids: [4, 5],
      });

      expect(() => assertArrayBodyConformsToSpec("deleteDealFieldOptions", capturedBody(mockFn))).not.toThrow();
    });
  });

  // ── Pipeline / stage bodies (v2 boolean-rename guards) ─────────────────────
  describe("pipelines", () => {
    // Revert-proof: FAILS if the handler reverts to the v1 `deal_probability`
    // flag key — v2 renamed it to `is_deal_probability_enabled`.
    it("addPipeline body conforms (is_deal_probability_enabled)", async () => {
      const mockFn = mockApiSuccess(fixtures.pipeline);
      const { createPipeline } = await import("../../src/tools/pipelines.js");

      await createPipeline({
        name: "Enterprise",
        is_deal_probability_enabled: true,
      });

      expect(() => assertBodyConformsToSpec("addPipeline", capturedBody(mockFn))).not.toThrow();
    });

    it("updatePipeline body conforms (is_deal_probability_enabled)", async () => {
      const mockFn = mockApiSuccess(fixtures.pipeline);
      const { updatePipeline } = await import("../../src/tools/pipelines.js");

      await updatePipeline({
        id: 1,
        name: "Enterprise (renamed)",
        is_deal_probability_enabled: false,
      });

      expect(() => assertBodyConformsToSpec("updatePipeline", capturedBody(mockFn))).not.toThrow();
    });
  });

  describe("stages", () => {
    // Revert-proof: FAILS if the handler reverts to v1 `rotten_flag`/`rotten_days`
    // — v2 renamed them to `is_deal_rot_enabled`/`days_to_rotten`.
    it("addStage body conforms (is_deal_rot_enabled/days_to_rotten)", async () => {
      const mockFn = mockApiSuccess(fixtures.stage);
      const { createStage } = await import("../../src/tools/pipelines.js");

      await createStage({
        name: "Qualified",
        pipeline_id: 1,
        deal_probability: 50,
        is_deal_rot_enabled: true,
        days_to_rotten: 30,
      });

      expect(() => assertBodyConformsToSpec("addStage", capturedBody(mockFn))).not.toThrow();
    });

    it("updateStage body conforms (is_deal_rot_enabled/days_to_rotten)", async () => {
      const mockFn = mockApiSuccess(fixtures.stage);
      const { updateStage } = await import("../../src/tools/pipelines.js");

      await updateStage({
        id: 1,
        name: "Qualified (renamed)",
        pipeline_id: 2,
        deal_probability: 75,
        is_deal_rot_enabled: false,
        days_to_rotten: 10,
      });

      expect(() => assertBodyConformsToSpec("updateStage", capturedBody(mockFn))).not.toThrow();
    });
  });
});

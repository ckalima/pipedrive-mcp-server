/**
 * Zod schemas for Field metadata operations (v2 API for deal/person/organization)
 */

import { z } from "zod";
import {
  PaginationParamsSchema,
  PathSegmentSchema,
  BoundedNameSchema,
  BoundedTextSchema,
  boundedArray,
} from "./common.js";

/**
 * Field entity types
 */
export const FieldEntityTypeSchema = z.enum(["organization", "deal", "person", "product", "activity", "project"])
  .describe("Entity type to get fields for");

/**
 * List organization fields parameters
 */
export const ListOrganizationFieldsSchema = PaginationParamsSchema;

/**
 * List deal fields parameters
 */
export const ListDealFieldsSchema = PaginationParamsSchema;

/**
 * List person fields parameters
 */
export const ListPersonFieldsSchema = PaginationParamsSchema;

/**
 * List product fields parameters
 */
export const ListProductFieldsSchema = PaginationParamsSchema.extend({
  include_fields: z.enum(["ui_visibility"]).optional()
    .describe("Additional data namespaces to include (ui_visibility)"),
});

/**
 * List project fields parameters
 */
export const ListProjectFieldsSchema = PaginationParamsSchema;

/**
 * Get field by key parameters
 */
export const GetFieldSchema = z.object({
  entity_type: FieldEntityTypeSchema
    .describe("Entity type (organization, deal, person, etc.)"),
  key: BoundedNameSchema
    .describe("Field key (40-character hash for custom fields, or standard field name)"),
});

// ─── U3: Field write schemas (deal / person / organization) ───────────────────

/**
 * Custom field types accepted by the v2 field create endpoints. Identical
 * write-allowed subset across deal / person / organization / product fields.
 */
export const FieldTypeSchema = z.enum([
  "varchar", "text", "double", "phone", "date", "daterange", "time",
  "timerange", "set", "enum", "varchar_auto", "address", "monetary",
  "org", "people", "user",
]).describe("Field type (varchar, text, double, enum, set, monetary, date, etc.)");

/**
 * A single option label for an enum/set field (create body).
 */
export const FieldOptionInputSchema = z.object({
  label: BoundedNameSchema.min(1).describe("The option label"),
}).strict();

/**
 * `field_code` is the server-generated 40-character hash for a field (e.g.
 * "946947d1b02fd3ef20798d6112ec5d895a686a21"), returned by the create call and
 * in list/read responses. It is NOT the human field name and NOT an integer id;
 * passing the field name yields a 404.
 *
 * It is interpolated into the request path (`/dealFields/${field_code}`), so the
 * value is restricted to the shared path-segment allowlist (`PathSegmentSchema`,
 * `[A-Za-z0-9_-]`) to prevent it from redirecting the request to a different
 * endpoint. See that schema for why a `/`-only blocklist is insufficient. The
 * allowlist admits the 40-char hex hash and snake_case built-in keys (e.g.
 * `title`, `org_id`); the 40-char hex format is deliberately NOT hard-enforced
 * because built-in (non-custom) fields use readable keys.
 */
export const FieldCodeSchema = PathSegmentSchema
  .describe("The field_code (40-char hash for custom fields) from the field create/list response");

// Shared option-list shapes for the bulk options sub-verbs.

/** One option to update: id + new label (PATCH /{entity}Fields/{field_code}/options). */
export const OptionUpdateInputSchema = z.object({
  id: z.number().int().positive().describe("The option ID to update"),
  label: z.string().min(1).max(255).describe("The new option label"),
}).strict();

/**
 * Explicit sub-object shapes (not .passthrough()): unknown / v1-named keys are
 * stripped, never forwarded, preserving the "v2 names exclusively" guarantee.
 * The spec marks these objects additionalProperties:true, but we intentionally
 * enumerate only the documented keys.
 */

/** Pipeline-scoped visibility (deal fields only). */
export const ShowInPipelinesSchema = z.object({
  show_in_all: z.boolean().optional(),
  pipeline_ids: boundedArray(z.number().int()).optional(),
});

/** Add-dialog visibility ({show, order}) used by person/org fields. */
export const ShowInDialogSchema = z.object({
  show: z.boolean().optional(),
  order: z.number().int().nullable().optional(),
});

/**
 * important_fields config. `stage_ids` always references DEAL stages, even on
 * person and organization fields.
 */
export const ImportantFieldsSchema = z.object({
  enabled: z.boolean().optional(),
  stage_ids: boundedArray(z.number().int()).optional(),
});

/** Deal-field UI visibility (has show_in_pipelines + projects flag). */
export const DealUiVisibilitySchema = z.object({
  add_visible_flag: z.boolean().optional(),
  details_visible_flag: z.boolean().optional(),
  projects_detail_visible_flag: z.boolean().optional(),
  show_in_pipelines: ShowInPipelinesSchema.optional(),
});

/** Person-field UI visibility (has show_in_add_deal_dialog, no show_in_pipelines). */
export const PersonUiVisibilitySchema = z.object({
  add_visible_flag: z.boolean().optional(),
  details_visible_flag: z.boolean().optional(),
  show_in_add_deal_dialog: ShowInDialogSchema.optional(),
});

/** Org-field UI visibility (adds show_in_add_person_dialog). */
export const OrgUiVisibilitySchema = z.object({
  add_visible_flag: z.boolean().optional(),
  details_visible_flag: z.boolean().optional(),
  show_in_add_deal_dialog: ShowInDialogSchema.optional(),
  show_in_add_person_dialog: ShowInDialogSchema.optional(),
});

/** Deal required_fields: enabled + deal stage_ids + per-pipeline won/lost statuses. */
export const DealRequiredFieldsSchema = z.object({
  enabled: z.boolean().optional(),
  stage_ids: boundedArray(z.number().int()).optional(),
  statuses: z.record(z.string(), z.array(z.enum(["won", "lost"]))).optional(),
});

/** Person/org required_fields: only `enabled` (no stage_ids / statuses). */
export const SimpleRequiredFieldsSchema = z.object({
  enabled: z.boolean().optional(),
});

/**
 * Shared validity check: enum/set field types require a non-empty `options`
 * array in the create body. The spec marks `options` optional, but the API
 * rejects enum/set creates without it.
 */
const optionsPresentForEnumSet = (v: { field_type: string; options?: unknown[] }): boolean =>
  !((v.field_type === "enum" || v.field_type === "set") && (!v.options || v.options.length === 0));

const ENUM_SET_OPTIONS_REFINE = {
  message: "options is required for enum and set field types",
  path: ["options"] as PropertyKey[],
};

// ── Deal field write schemas ──

export const CreateDealFieldSchema = z.object({
  field_name: z.string().min(1).max(255).describe("Field name (required, 1-255 chars)"),
  field_type: FieldTypeSchema.describe("Field type (required). Use 'enum' or 'set' for option fields."),
  options: boundedArray(FieldOptionInputSchema).optional()
    .describe("Field options (required for enum and set field types)"),
  ui_visibility: DealUiVisibilitySchema.optional()
    .describe("UI visibility settings (where the field appears in the web UI)"),
  important_fields: ImportantFieldsSchema.optional()
    .describe("Important-field highlighting (stage_ids reference deal stages)"),
  required_fields: DealRequiredFieldsSchema.optional()
    .describe("Required-field configuration"),
  description: BoundedTextSchema.nullable().optional().describe("Field description"),
}).refine(optionsPresentForEnumSet, ENUM_SET_OPTIONS_REFINE);

export const UpdateDealFieldSchema = z.object({
  field_code: FieldCodeSchema,
  field_name: z.string().min(1).max(255).optional().describe("New field name"),
  ui_visibility: DealUiVisibilitySchema.optional(),
  important_fields: ImportantFieldsSchema.optional(),
  required_fields: DealRequiredFieldsSchema.optional(),
  description: BoundedTextSchema.nullable().optional().describe("Field description"),
});

export const DeleteDealFieldSchema = z.object({ field_code: FieldCodeSchema });

export const UpdateDealFieldOptionsSchema = z.object({
  field_code: FieldCodeSchema,
  options: boundedArray(OptionUpdateInputSchema).min(1)
    .describe("Options to update (at least one). Atomic: fails if any option ID does not exist."),
});

export const DeleteDealFieldOptionsSchema = z.object({
  field_code: FieldCodeSchema,
  option_ids: boundedArray(z.number().int().positive()).min(1)
    .describe("IDs of the options to delete (at least one). Atomic: fails if any ID does not exist."),
});

// ── Person field write schemas ──

export const CreatePersonFieldSchema = z.object({
  field_name: z.string().min(1).max(255).describe("Field name (required, 1-255 chars)"),
  field_type: FieldTypeSchema.describe("Field type (required). Use 'enum' or 'set' for option fields."),
  options: boundedArray(FieldOptionInputSchema).optional()
    .describe("Field options (required for enum and set field types)"),
  ui_visibility: PersonUiVisibilitySchema.optional()
    .describe("UI visibility settings (where the field appears in the web UI)"),
  important_fields: ImportantFieldsSchema.optional()
    .describe("Important-field highlighting (stage_ids reference deal stages)"),
  required_fields: SimpleRequiredFieldsSchema.optional()
    .describe("Required-field configuration (person fields support only `enabled`)"),
}).refine(optionsPresentForEnumSet, ENUM_SET_OPTIONS_REFINE);

export const UpdatePersonFieldSchema = z.object({
  field_code: FieldCodeSchema,
  field_name: z.string().min(1).max(255).optional().describe("New field name"),
  ui_visibility: PersonUiVisibilitySchema.optional(),
  important_fields: ImportantFieldsSchema.optional(),
  required_fields: SimpleRequiredFieldsSchema.optional(),
});

export const DeletePersonFieldSchema = z.object({ field_code: FieldCodeSchema });

export const UpdatePersonFieldOptionsSchema = z.object({
  field_code: FieldCodeSchema,
  options: boundedArray(OptionUpdateInputSchema).min(1)
    .describe("Options to update (at least one). Atomic: fails if any option ID does not exist."),
});

export const DeletePersonFieldOptionsSchema = z.object({
  field_code: FieldCodeSchema,
  option_ids: boundedArray(z.number().int().positive()).min(1)
    .describe("IDs of the options to delete (at least one). Atomic: fails if any ID does not exist."),
});

// ── Organization field write schemas ──

export const CreateOrganizationFieldSchema = z.object({
  field_name: z.string().min(1).max(255).describe("Field name (required, 1-255 chars)"),
  field_type: FieldTypeSchema.describe("Field type (required). Use 'enum' or 'set' for option fields."),
  options: boundedArray(FieldOptionInputSchema).optional()
    .describe("Field options (required for enum and set field types)"),
  ui_visibility: OrgUiVisibilitySchema.optional()
    .describe("UI visibility settings (where the field appears in the web UI)"),
  important_fields: ImportantFieldsSchema.optional()
    .describe("Important-field highlighting (stage_ids reference deal stages)"),
  required_fields: SimpleRequiredFieldsSchema.optional()
    .describe("Required-field configuration (organization fields support only `enabled`)"),
}).refine(optionsPresentForEnumSet, ENUM_SET_OPTIONS_REFINE);

export const UpdateOrganizationFieldSchema = z.object({
  field_code: FieldCodeSchema,
  field_name: z.string().min(1).max(255).optional().describe("New field name"),
  ui_visibility: OrgUiVisibilitySchema.optional(),
  important_fields: ImportantFieldsSchema.optional(),
  required_fields: SimpleRequiredFieldsSchema.optional(),
});

export const DeleteOrganizationFieldSchema = z.object({ field_code: FieldCodeSchema });

export const UpdateOrganizationFieldOptionsSchema = z.object({
  field_code: FieldCodeSchema,
  options: boundedArray(OptionUpdateInputSchema).min(1)
    .describe("Options to update (at least one). Atomic: fails if any option ID does not exist."),
});

export const DeleteOrganizationFieldOptionsSchema = z.object({
  field_code: FieldCodeSchema,
  option_ids: boundedArray(z.number().int().positive()).min(1)
    .describe("IDs of the options to delete (at least one). Atomic: fails if any ID does not exist."),
});

// ─── U4: Product field write schemas ──────────────────────────────────────────
// Product fields use a NARROWER model than other entities: ui_visibility has only
// add_visible_flag/details_visible_flag, and there is NO description,
// important_fields, or required_fields. These schemas are enumerated explicitly
// (NOT derived from the deal schemas) so those fields cannot leak in.

/** Product-field UI visibility (the simplest model: two flags only). */
export const ProductUiVisibilitySchema = z.object({
  add_visible_flag: z.boolean().optional(),
  details_visible_flag: z.boolean().optional(),
});

export const CreateProductFieldSchema = z.object({
  field_name: z.string().min(1).max(255).describe("Field name (required, 1-255 chars)"),
  field_type: FieldTypeSchema.describe("Field type (required). Use 'enum' or 'set' for option fields."),
  options: boundedArray(FieldOptionInputSchema).optional()
    .describe("Field options (required for enum and set field types)"),
  ui_visibility: ProductUiVisibilitySchema.optional()
    .describe("UI visibility settings (add_visible_flag, details_visible_flag)"),
}).refine(optionsPresentForEnumSet, ENUM_SET_OPTIONS_REFINE);

export const UpdateProductFieldSchema = z.object({
  field_code: FieldCodeSchema,
  field_name: z.string().min(1).max(255).optional().describe("New field name"),
  ui_visibility: ProductUiVisibilitySchema.optional()
    .describe("UI visibility settings (add_visible_flag, details_visible_flag)"),
});

export const DeleteProductFieldSchema = z.object({ field_code: FieldCodeSchema });

export const UpdateProductFieldOptionsSchema = z.object({
  field_code: FieldCodeSchema,
  options: boundedArray(OptionUpdateInputSchema).min(1)
    .describe("Options to update (at least one). Atomic: fails if any option ID does not exist."),
});

export const DeleteProductFieldOptionsSchema = z.object({
  field_code: FieldCodeSchema,
  option_ids: boundedArray(z.number().int().positive()).min(1)
    .describe("IDs of the options to delete (at least one). Atomic: fails if any ID does not exist."),
});

/**
 * Type exports
 */
export type ListOrganizationFieldsParams = z.infer<typeof ListOrganizationFieldsSchema>;
export type ListDealFieldsParams = z.infer<typeof ListDealFieldsSchema>;
export type ListPersonFieldsParams = z.infer<typeof ListPersonFieldsSchema>;
export type ListProductFieldsParams = z.infer<typeof ListProductFieldsSchema>;
export type ListProjectFieldsParams = z.infer<typeof ListProjectFieldsSchema>;
export type GetFieldParams = z.infer<typeof GetFieldSchema>;

export type CreateDealFieldParams = z.infer<typeof CreateDealFieldSchema>;
export type UpdateDealFieldParams = z.infer<typeof UpdateDealFieldSchema>;
export type DeleteDealFieldParams = z.infer<typeof DeleteDealFieldSchema>;
export type UpdateDealFieldOptionsParams = z.infer<typeof UpdateDealFieldOptionsSchema>;
export type DeleteDealFieldOptionsParams = z.infer<typeof DeleteDealFieldOptionsSchema>;

export type CreatePersonFieldParams = z.infer<typeof CreatePersonFieldSchema>;
export type UpdatePersonFieldParams = z.infer<typeof UpdatePersonFieldSchema>;
export type DeletePersonFieldParams = z.infer<typeof DeletePersonFieldSchema>;
export type UpdatePersonFieldOptionsParams = z.infer<typeof UpdatePersonFieldOptionsSchema>;
export type DeletePersonFieldOptionsParams = z.infer<typeof DeletePersonFieldOptionsSchema>;

export type CreateOrganizationFieldParams = z.infer<typeof CreateOrganizationFieldSchema>;
export type UpdateOrganizationFieldParams = z.infer<typeof UpdateOrganizationFieldSchema>;
export type DeleteOrganizationFieldParams = z.infer<typeof DeleteOrganizationFieldSchema>;
export type UpdateOrganizationFieldOptionsParams = z.infer<typeof UpdateOrganizationFieldOptionsSchema>;
export type DeleteOrganizationFieldOptionsParams = z.infer<typeof DeleteOrganizationFieldOptionsSchema>;

export type CreateProductFieldParams = z.infer<typeof CreateProductFieldSchema>;
export type UpdateProductFieldParams = z.infer<typeof UpdateProductFieldSchema>;
export type DeleteProductFieldParams = z.infer<typeof DeleteProductFieldSchema>;
export type UpdateProductFieldOptionsParams = z.infer<typeof UpdateProductFieldOptionsSchema>;
export type DeleteProductFieldOptionsParams = z.infer<typeof DeleteProductFieldOptionsSchema>;

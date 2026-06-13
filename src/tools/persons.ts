/**
 * Person-related MCP tools for Pipedrive
 */

import { getClient } from "../client.js";
import {
  ListPersonsSchema,
  GetPersonSchema,
  CreatePersonSchema,
  UpdatePersonSchema,
  SearchPersonsSchema,
  DeletePersonSchema,
  ListPersonFollowersSchema,
  AddPersonFollowerSchema,
  DeletePersonFollowerSchema,
  PersonFollowersChangelogSchema,
  GetPersonPictureSchema,
  type ListPersonsParams,
  type GetPersonParams,
  type CreatePersonParams,
  type UpdatePersonParams,
  type SearchPersonsParams,
  type DeletePersonParams,
  type ListPersonFollowersParams,
  type AddPersonFollowerParams,
  type DeletePersonFollowerParams,
  type PersonFollowersChangelogParams,
  type GetPersonPictureParams,
} from "../schemas/persons.js";
import { buildPaginationParamsV2, extractPaginationV2 } from "../utils/pagination.js";
import { mcpErrorResult, destructiveOperationGuard } from "../utils/errors.js";
import { createListSummary } from "../utils/formatting.js";

/**
 * List persons with optional filtering
 */
export async function listPersons(params: ListPersonsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  if (params.filter_id) queryParams.set("filter_id", String(params.filter_id));
  if (params.ids) queryParams.set("ids", params.ids);
  if (params.owner_id) queryParams.set("owner_id", String(params.owner_id));
  if (params.org_id) queryParams.set("org_id", String(params.org_id));
  if (params.updated_since) queryParams.set("updated_since", params.updated_since);
  if (params.updated_until) queryParams.set("updated_until", params.updated_until);
  if (params.sort_by) queryParams.set("sort_by", params.sort_by);
  if (params.sort_direction) queryParams.set("sort_direction", params.sort_direction);
  if (params.include_fields) queryParams.set("include_fields", params.include_fields);
  if (params.custom_fields) queryParams.set("custom_fields", params.custom_fields);

  const response = await client.get<unknown[]>("/persons", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const persons = response.data;
  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("person", persons.length, pagination.has_more),
        data: persons,
        pagination,
      }, null, 2),
    }],
  };
}

/**
 * Get a single person by ID
 */
export async function getPerson(params: GetPersonParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();
  if (params.include_fields) queryParams.set("include_fields", params.include_fields);
  if (params.custom_fields) queryParams.set("custom_fields", params.custom_fields);

  const response = await client.get<unknown>(
    `/persons/${params.id}`,
    queryParams.toString() ? queryParams : undefined,
    "v2"
  );

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Person ${params.id}`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Create a new person
 */
export async function createPerson(params: CreatePersonParams) {
  const client = getClient();

  const body: Record<string, unknown> = {
    name: params.name,
  };

  if (params.emails) body.emails = params.emails;
  if (params.phones) body.phones = params.phones;
  if (params.owner_id) body.owner_id = params.owner_id;
  if (params.org_id) body.org_id = params.org_id;
  if (params.visible_to) body.visible_to = params.visible_to;
  if (params.marketing_status) body.marketing_status = params.marketing_status;
  if (params.label_ids) body.label_ids = params.label_ids;
  if (params.add_time) body.add_time = params.add_time;
  if (params.custom_fields) body.custom_fields = params.custom_fields;

  const response = await client.post<unknown>("/persons", body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: "Person created",
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Update an existing person
 */
export async function updatePerson(params: UpdatePersonParams) {
  const client = getClient();

  const { id, ...updateFields } = params;
  const body: Record<string, unknown> = {};

  if (updateFields.name) body.name = updateFields.name;
  if (updateFields.emails) body.emails = updateFields.emails;
  if (updateFields.phones) body.phones = updateFields.phones;
  if (updateFields.owner_id) body.owner_id = updateFields.owner_id;
  if (updateFields.org_id) body.org_id = updateFields.org_id;
  if (updateFields.visible_to) body.visible_to = updateFields.visible_to;
  if (updateFields.marketing_status) body.marketing_status = updateFields.marketing_status;
  if (updateFields.label_ids) body.label_ids = updateFields.label_ids;
  if (updateFields.custom_fields) body.custom_fields = updateFields.custom_fields;

  const response = await client.patch<unknown>(`/persons/${id}`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Person ${id} updated`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Search persons by name/email/phone
 */
export async function searchPersons(params: SearchPersonsParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();
  queryParams.set("term", params.term);
  if (params.fields) queryParams.set("fields", params.fields);
  if (params.org_id) queryParams.set("organization_id", String(params.org_id));
  if (params.exact_match) queryParams.set("exact_match", "true");
  if (params.limit) queryParams.set("limit", String(params.limit));
  if (params.cursor) queryParams.set("cursor", params.cursor);

  const response = await client.get<{ items?: unknown[] }>("/persons/search", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Search results for "${params.term}"`,
        data: response.data,
        pagination,
      }, null, 2),
    }],
  };
}

/**
 * Delete a person
 */
export async function deletePerson(params: DeletePersonParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/persons/${params.id}`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Person ${params.id} deleted (will be permanently removed after 30 days)`,
        data: response.data,
      }, null, 2),
    }],
  };
}

// ─── Follower handlers (U2, #69) ──────────────────────────────────────────────

/**
 * List followers for a person
 */
export async function listPersonFollowers(params: ListPersonFollowersParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  const response = await client.get<unknown[]>(`/persons/${params.id}/followers`, queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const data = response.data;
  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("follower", data.length, pagination.has_more),
        data,
        pagination,
      }, null, 2),
    }],
  };
}

/**
 * Add a follower to a person
 */
export async function addPersonFollower(params: AddPersonFollowerParams) {
  const client = getClient();

  const body = { user_id: params.user_id };

  const response = await client.post<unknown>(`/persons/${params.id}/followers`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: "Follower added to person",
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Get the followers changelog for a person
 */
export async function getPersonFollowersChangelog(params: PersonFollowersChangelogParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  const response = await client.get<unknown[]>(`/persons/${params.id}/followers/changelog`, queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const data = response.data;
  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Followers changelog for person ${params.id}`,
        data,
        pagination,
      }, null, 2),
    }],
  };
}

/**
 * Delete a person follower
 */
export async function deletePersonFollower(params: DeletePersonFollowerParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ user_id: number }>(`/persons/${params.id}/followers/${params.follower_id}`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Follower ${params.follower_id} removed from person ${params.id}`,
        data: response.data,
      }, null, 2),
    }],
  };
}

// ─── Picture handler (U2, #69; read-only — no v2 upload endpoint) ─────────────

/**
 * Get the picture for a person (read-only; the v2 API exposes no upload endpoint)
 */
export async function getPersonPicture(params: GetPersonPictureParams) {
  const client = getClient();

  const response = await client.get<unknown>(`/persons/${params.id}/picture`, undefined, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Picture for person ${params.id}`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Tool definitions for MCP registration
 */
export const personTools = [
  {
    name: "pipedrive_list_persons",
    description: "List persons (contacts) from Pipedrive with optional filtering by owner, organization, or first letter of name.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination" },
        limit: { type: "number", description: "Number of items (1-100)" },
        filter_id: { type: "number", description: "Filter by saved filter ID" },
        ids: { type: "string", description: "Comma-separated person IDs to fetch (max 100)" },
        owner_id: { type: "number", description: "Filter by owner user ID" },
        org_id: { type: "number", description: "Filter by organization ID" },
        updated_since: { type: "string", description: "Filter persons updated after this time (RFC3339 format)" },
        updated_until: { type: "string", description: "Filter persons updated before this time (RFC3339 format)" },
        sort_by: { type: "string", enum: ["id", "update_time", "add_time"], description: "Field to sort by" },
        sort_direction: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
        include_fields: { type: "string", description: "Comma-separated extra fields (v2 enum, e.g. next_activity_id, open_deals_count, won_deals_count, notes_count, followers_count)" },
        custom_fields: { type: "string", description: "Include custom fields in response (comma-separated field keys or 'all')" },
      },
    },
    handler: listPersons,
    schema: ListPersonsSchema,
  },
  {
    name: "pipedrive_get_person",
    description: "Get detailed information about a specific person by ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The person ID" },
        include_fields: { type: "string", description: "Comma-separated extra fields (v2 enum, e.g. next_activity_id, open_deals_count, won_deals_count, notes_count, followers_count)" },
        custom_fields: { type: "string", description: "Include custom fields in response (comma-separated field keys or 'all')" },
      },
      required: ["id"],
    },
    handler: getPerson,
    schema: GetPersonSchema,
  },
  {
    name: "pipedrive_create_person",
    description: "Create a new person (contact) in Pipedrive. Only name is required.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Person name (required)" },
        emails: {
          type: "array",
          items: {
            type: "object",
            properties: {
              value: { type: "string", description: "Email address" },
              primary: { type: "boolean", description: "Is primary email" },
              label: { type: "string", description: "Label (work, home, other)" },
            },
            required: ["value"],
          },
          description: "Email addresses (array of objects, e.g. [{ value, primary, label }])",
        },
        phones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              value: { type: "string", description: "Phone number" },
              primary: { type: "boolean", description: "Is primary phone" },
              label: { type: "string", description: "Label (work, home, mobile)" },
            },
            required: ["value"],
          },
          description: "Phone numbers (array of objects, e.g. [{ value, primary, label }])",
        },
        owner_id: { type: "number", description: "Owner user ID" },
        org_id: { type: "number", description: "Organization ID to link to" },
        visible_to: { type: "number", enum: [1, 3, 5, 7], description: "Visibility: 1=Owner, 3=Group, 5=Subgroups, 7=Company" },
        marketing_status: { type: "string", enum: ["no_consent", "unsubscribed", "subscribed", "archived"], description: "Marketing status" },
        label_ids: { type: "array", items: { type: "number" }, description: "Label IDs to attach to person" },
        add_time: { type: "string", description: "Creation time (RFC3339 format) - backdate the person" },
        custom_fields: { type: "object", description: "Custom field values as object with field keys" },
      },
      required: ["name"],
    },
    handler: createPerson,
    schema: CreatePersonSchema,
  },
  {
    name: "pipedrive_update_person",
    description: "Update an existing person in Pipedrive.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Person ID to update" },
        name: { type: "string", description: "New name" },
        emails: {
          type: "array",
          items: {
            type: "object",
            properties: {
              value: { type: "string" },
              primary: { type: "boolean" },
              label: { type: "string" },
            },
            required: ["value"],
          },
          description: "New email addresses (array of objects)",
        },
        phones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              value: { type: "string" },
              primary: { type: "boolean" },
              label: { type: "string" },
            },
            required: ["value"],
          },
          description: "New phone numbers (array of objects)",
        },
        owner_id: { type: "number", description: "New owner user ID" },
        org_id: { type: "number", description: "New organization ID" },
        visible_to: { type: "number", enum: [1, 3, 5, 7], description: "New visibility: 1=Owner, 3=Group, 5=Subgroups, 7=Company" },
        marketing_status: { type: "string", enum: ["no_consent", "unsubscribed", "subscribed", "archived"], description: "New marketing status" },
        label_ids: { type: "array", items: { type: "number" }, description: "Label IDs to set on person" },
        custom_fields: { type: "object", description: "Custom field values as object with field keys" },
      },
      required: ["id"],
    },
    handler: updatePerson,
    schema: UpdatePersonSchema,
  },
  {
    name: "pipedrive_search_persons",
    description: "Search for persons by name, email, or phone number.",
    inputSchema: {
      type: "object" as const,
      properties: {
        term: { type: "string", description: "Search term" },
        fields: { type: "string", description: "Comma-separated fields to search (name, email, phone, notes, custom_fields). Defaults to all." },
        org_id: { type: "number", description: "Filter by organization" },
        exact_match: { type: "boolean", description: "Use exact match" },
        limit: { type: "number", description: "Number of results (1-100)" },
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
      },
      required: ["term"],
    },
    handler: searchPersons,
    schema: SearchPersonsSchema,
  },
  {
    name: "pipedrive_delete_person",
    description: "Delete a person. The person will be marked as deleted and permanently removed after 30 days.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Person ID to delete" },
      },
      required: ["id"],
    },
    destructive: true,
    handler: deletePerson,
    schema: DeletePersonSchema,
  },
  // Follower tools (U2, #69)
  {
    name: "pipedrive_list_person_followers",
    description: "List all followers for a person.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The person ID" },
        cursor: { type: "string", description: "Cursor for pagination" },
        limit: { type: "number", description: "Number of items (1-100)" },
      },
      required: ["id"],
    },
    handler: listPersonFollowers,
    schema: ListPersonFollowersSchema,
  },
  {
    name: "pipedrive_add_person_follower",
    description: "Add a follower to a person.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The person ID" },
        user_id: { type: "number", description: "The ID of the user to add as a follower (required)" },
      },
      required: ["id", "user_id"],
    },
    handler: addPersonFollower,
    schema: AddPersonFollowerSchema,
  },
  {
    name: "pipedrive_delete_person_follower",
    description: "Remove a follower from a person.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The person ID" },
        follower_id: { type: "number", description: "The ID of the follower (user) to remove" },
      },
      required: ["id", "follower_id"],
    },
    destructive: true,
    handler: deletePersonFollower,
    schema: DeletePersonFollowerSchema,
  },
  {
    name: "pipedrive_get_person_followers_changelog",
    description: "Get the followers changelog for a person.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The person ID" },
        cursor: { type: "string", description: "Cursor for pagination" },
        limit: { type: "number", description: "Number of items (1-100)" },
      },
      required: ["id"],
    },
    handler: getPersonFollowersChangelog,
    schema: PersonFollowersChangelogSchema,
  },
  // Picture tool (U2, #69; read-only)
  {
    name: "pipedrive_get_person_picture",
    description: "Get the picture for a person (read-only; returns picture metadata and sized image URLs). Returns an error if the person has no picture.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The person ID" },
      },
      required: ["id"],
    },
    handler: getPersonPicture,
    schema: GetPersonPictureSchema,
  },
];

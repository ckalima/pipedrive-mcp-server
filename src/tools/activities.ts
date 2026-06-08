/**
 * Activity-related MCP tools for Pipedrive
 */

import { getClient } from "../client.js";
import {
  ListActivitiesSchema,
  GetActivitySchema,
  CreateActivitySchema,
  UpdateActivitySchema,
  DeleteActivitySchema,
  type ListActivitiesParams,
  type GetActivityParams,
  type CreateActivityParams,
  type UpdateActivityParams,
  type DeleteActivityParams,
} from "../schemas/activities.js";
import { buildPaginationParamsV2, extractPaginationV2 } from "../utils/pagination.js";
import { mcpErrorResult, destructiveOperationGuard } from "../utils/errors.js";
import { createListSummary } from "../utils/formatting.js";

/**
 * List activities with optional filtering
 */
export async function listActivities(params: ListActivitiesParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  if (params.filter_id) queryParams.set("filter_id", String(params.filter_id));
  if (params.ids) queryParams.set("ids", params.ids);
  if (params.owner_id) queryParams.set("owner_id", String(params.owner_id));
  if (params.deal_id) queryParams.set("deal_id", String(params.deal_id));
  if (params.lead_id) queryParams.set("lead_id", params.lead_id);
  if (params.person_id) queryParams.set("person_id", String(params.person_id));
  if (params.org_id) queryParams.set("org_id", String(params.org_id));
  if (params.project_id) queryParams.set("project_id", String(params.project_id));
  if (params.type) queryParams.set("type", params.type);
  if (params.done !== undefined) queryParams.set("done", String(params.done));
  if (params.start_date) queryParams.set("start_date", params.start_date);
  if (params.end_date) queryParams.set("end_date", params.end_date);
  if (params.updated_since) queryParams.set("updated_since", params.updated_since);
  if (params.updated_until) queryParams.set("updated_until", params.updated_until);
  if (params.sort_by) queryParams.set("sort_by", params.sort_by);
  if (params.sort_direction) queryParams.set("sort_direction", params.sort_direction);
  if (params.include_fields) queryParams.set("include_fields", params.include_fields);

  const response = await client.get<unknown[]>("/activities", queryParams);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const activities = response.data;
  const pagination = extractPaginationV2(response);

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("activity", activities.length, pagination.has_more),
        data: activities,
        pagination,
      }, null, 2),
    }],
  };
}

/**
 * Get a single activity by ID
 */
export async function getActivity(params: GetActivityParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();
  if (params.include_fields) queryParams.set("include_fields", params.include_fields);

  const response = await client.get<unknown>(
    `/activities/${params.id}`,
    queryParams.toString() ? queryParams : undefined
  );

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Activity ${params.id}`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Create a new activity
 */
export async function createActivity(params: CreateActivityParams) {
  const client = getClient();

  const body: Record<string, unknown> = {
    subject: params.subject,
    type: params.type,
  };

  if (params.due_date) body.due_date = params.due_date;
  if (params.due_time) body.due_time = params.due_time;
  if (params.duration) body.duration = params.duration;
  if (params.owner_id) body.owner_id = params.owner_id;
  if (params.deal_id) body.deal_id = params.deal_id;
  if (params.lead_id) body.lead_id = params.lead_id;
  if (params.person_id) body.person_id = params.person_id;
  if (params.org_id) body.org_id = params.org_id;
  if (params.project_id) body.project_id = params.project_id;
  if (params.note) body.note = params.note;
  if (params.done !== undefined) body.done = params.done;
  if (params.busy !== undefined) body.busy = params.busy;
  if (params.priority) body.priority = params.priority;
  if (params.participants) body.participants = params.participants;
  if (params.attendees) body.attendees = params.attendees;
  if (params.location) body.location = params.location;
  if (params.public_description) body.public_description = params.public_description;

  const response = await client.post<unknown>("/activities", body);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: "Activity created",
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Update an existing activity
 */
export async function updateActivity(params: UpdateActivityParams) {
  const client = getClient();

  const { id, ...updateFields } = params;
  const body: Record<string, unknown> = {};

  if (updateFields.subject) body.subject = updateFields.subject;
  if (updateFields.type) body.type = updateFields.type;
  if (updateFields.due_date) body.due_date = updateFields.due_date;
  if (updateFields.due_time) body.due_time = updateFields.due_time;
  if (updateFields.duration) body.duration = updateFields.duration;
  if (updateFields.owner_id) body.owner_id = updateFields.owner_id;
  if (updateFields.deal_id) body.deal_id = updateFields.deal_id;
  if (updateFields.lead_id) body.lead_id = updateFields.lead_id;
  if (updateFields.person_id) body.person_id = updateFields.person_id;
  if (updateFields.org_id) body.org_id = updateFields.org_id;
  if (updateFields.project_id) body.project_id = updateFields.project_id;
  if (updateFields.note) body.note = updateFields.note;
  if (updateFields.done !== undefined) body.done = updateFields.done;
  if (updateFields.busy !== undefined) body.busy = updateFields.busy;
  if (updateFields.priority) body.priority = updateFields.priority;
  if (updateFields.participants) body.participants = updateFields.participants;
  if (updateFields.attendees) body.attendees = updateFields.attendees;
  if (updateFields.location) body.location = updateFields.location;

  const response = await client.patch<unknown>(`/activities/${id}`, body);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Activity ${id} updated`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Delete an activity
 */
export async function deleteActivity(params: DeleteActivityParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/activities/${params.id}`);

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Activity ${params.id} deleted`,
        data: response.data,
      }, null, 2),
    }],
  };
}

/**
 * Tool definitions for MCP registration
 */
export const activityTools = [
  {
    name: "pipedrive_list_activities",
    description: "List activities from Pipedrive with optional filtering by owner, deal, person, organization, type, or completion status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination" },
        limit: { type: "number", description: "Number of items (1-100)" },
        filter_id: { type: "number", description: "Filter by saved filter ID" },
        ids: { type: "string", description: "Comma-separated activity IDs to fetch (max 100)" },
        owner_id: { type: "number", description: "Filter by owner user ID" },
        deal_id: { type: "number", description: "Filter by deal ID" },
        lead_id: { type: "string", description: "Filter by lead ID (UUID format)" },
        person_id: { type: "number", description: "Filter by person ID" },
        org_id: { type: "number", description: "Filter by organization ID" },
        project_id: { type: "number", description: "Filter by project ID" },
        type: { type: "string", description: "Filter by type (call, meeting, task, etc.)" },
        done: { type: "boolean", description: "Filter by completion (true=done, false=pending)" },
        start_date: { type: "string", description: "Filter from date (YYYY-MM-DD)" },
        end_date: { type: "string", description: "Filter to date (YYYY-MM-DD)" },
        updated_since: { type: "string", description: "Filter activities updated after this time (RFC3339 format)" },
        updated_until: { type: "string", description: "Filter activities updated before this time (RFC3339 format)" },
        sort_by: { type: "string", enum: ["id", "update_time", "add_time", "due_date"], description: "Field to sort by" },
        sort_direction: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
        include_fields: { type: "string", description: "Include additional data in response" },
      },
    },
    handler: listActivities,
    schema: ListActivitiesSchema,
  },
  {
    name: "pipedrive_get_activity",
    description: "Get detailed information about a specific activity by ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The activity ID" },
        include_fields: { type: "string", description: "Include additional data in response" },
      },
      required: ["id"],
    },
    handler: getActivity,
    schema: GetActivitySchema,
  },
  {
    name: "pipedrive_create_activity",
    description: "Create a new activity in Pipedrive. Subject and type are required.",
    inputSchema: {
      type: "object" as const,
      properties: {
        subject: { type: "string", description: "Activity subject (required)" },
        type: { type: "string", description: "Activity type: call, meeting, task, deadline, email, lunch (required)" },
        due_date: { type: "string", description: "Due date (YYYY-MM-DD)" },
        due_time: { type: "string", description: "Due time (HH:MM)" },
        duration: { type: "string", description: "Duration (HH:MM)" },
        owner_id: { type: "number", description: "Owner user ID" },
        deal_id: { type: "number", description: "Link to deal ID" },
        lead_id: { type: "string", description: "Link to lead ID (UUID format)" },
        person_id: { type: "number", description: "Link to person ID" },
        org_id: { type: "number", description: "Link to organization ID" },
        project_id: { type: "number", description: "Link to project ID" },
        note: { type: "string", description: "Activity notes (HTML supported)" },
        done: { type: "boolean", description: "Mark as completed" },
        busy: { type: "boolean", description: "Show as busy in calendar" },
        priority: { type: "number", description: "Activity priority (integer)" },
        participants: {
          type: "array",
          items: {
            type: "object",
            properties: {
              person_id: { type: "number", description: "Person ID" },
              primary: { type: "boolean", description: "Is primary participant" },
            },
            required: ["person_id"],
          },
          description: "Activity participants (person IDs)",
        },
        attendees: {
          type: "array",
          items: {
            type: "object",
            properties: {
              email: { type: "string", description: "Attendee email" },
              name: { type: "string", description: "Attendee name" },
            },
            required: ["email"],
          },
          description: "External attendees (email addresses)",
        },
        location: {
          type: "object",
          description: "Activity location (structured object)",
          properties: {
            value: { type: "string", description: "The full address" },
            country: { type: "string", description: "Country" },
            admin_area_level_1: { type: "string", description: "Admin area level 1 (e.g. state)" },
            admin_area_level_2: { type: "string", description: "Admin area level 2 (e.g. county)" },
            locality: { type: "string", description: "Locality (e.g. city)" },
            sublocality: { type: "string", description: "Sublocality (e.g. neighborhood)" },
            route: { type: "string", description: "Route (e.g. street)" },
            street_number: { type: "string", description: "Street number" },
            subpremise: { type: "string", description: "Subpremise (e.g. apartment/suite)" },
            postal_code: { type: "string", description: "Postal code" },
          },
        },
        public_description: { type: "string", description: "Public description for guests" },
      },
      required: ["subject", "type"],
    },
    handler: createActivity,
    schema: CreateActivitySchema,
  },
  {
    name: "pipedrive_update_activity",
    description: "Update an existing activity in Pipedrive. Use this to mark activities as done.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Activity ID to update" },
        subject: { type: "string", description: "New subject" },
        type: { type: "string", description: "New type" },
        due_date: { type: "string", description: "New due date (YYYY-MM-DD)" },
        due_time: { type: "string", description: "New due time (HH:MM)" },
        duration: { type: "string", description: "New duration (HH:MM)" },
        owner_id: { type: "number", description: "New owner" },
        deal_id: { type: "number", description: "New deal ID" },
        lead_id: { type: "string", description: "New lead ID (UUID format)" },
        person_id: { type: "number", description: "New person ID" },
        org_id: { type: "number", description: "New organization ID" },
        project_id: { type: "number", description: "New project ID" },
        note: { type: "string", description: "New notes" },
        done: { type: "boolean", description: "Mark as completed/pending" },
        busy: { type: "boolean", description: "Show as busy" },
        priority: { type: "number", description: "New priority (integer)" },
        participants: {
          type: "array",
          items: {
            type: "object",
            properties: {
              person_id: { type: "number" },
              primary: { type: "boolean" },
            },
            required: ["person_id"],
          },
          description: "New participants",
        },
        attendees: {
          type: "array",
          items: {
            type: "object",
            properties: {
              email: { type: "string" },
              name: { type: "string" },
            },
            required: ["email"],
          },
          description: "New attendees",
        },
        location: {
          type: "object",
          description: "New location (structured object)",
          properties: {
            value: { type: "string", description: "The full address" },
            country: { type: "string", description: "Country" },
            admin_area_level_1: { type: "string", description: "Admin area level 1 (e.g. state)" },
            admin_area_level_2: { type: "string", description: "Admin area level 2 (e.g. county)" },
            locality: { type: "string", description: "Locality (e.g. city)" },
            sublocality: { type: "string", description: "Sublocality (e.g. neighborhood)" },
            route: { type: "string", description: "Route (e.g. street)" },
            street_number: { type: "string", description: "Street number" },
            subpremise: { type: "string", description: "Subpremise (e.g. apartment/suite)" },
            postal_code: { type: "string", description: "Postal code" },
          },
        },
      },
      required: ["id"],
    },
    handler: updateActivity,
    schema: UpdateActivitySchema,
  },
  {
    name: "pipedrive_delete_activity",
    description: "Delete an activity.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Activity ID to delete" },
      },
      required: ["id"],
    },
    handler: deleteActivity,
    schema: DeleteActivitySchema,
  },
];

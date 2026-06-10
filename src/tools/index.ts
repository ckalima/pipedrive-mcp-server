/**
 * Tool registration for Pipedrive MCP Server
 * Exports all tools for MCP server registration
 */

import { dealTools } from "./deals.js";
import { personTools } from "./persons.js";
import { activityTools } from "./activities.js";
import { organizationTools } from "./organizations.js";
import { mailTools } from "./mail.js";
import { fieldTools } from "./fields.js";
import { pipelineTools } from "./pipelines.js";
import { userTools } from "./users.js";
import { noteTools } from "./notes.js";
import { leadsTools } from "./leads.js";
import { projectTools } from "./projects.js";
import { productTools } from "./products.js";
import { taskTools } from "./tasks.js";
import { boardTools, phaseTools } from "./boards.js";

/**
 * All available tools
 */
export const allTools = [
  // Tier 1: Core CRM Operations
  ...dealTools,
  ...personTools,
  ...activityTools,
  ...noteTools,
  ...leadsTools,
  ...projectTools,
  ...productTools,
  ...taskTools,
  ...boardTools,
  ...phaseTools,

  // Tier 2: Email/Mail Tools
  ...mailTools,

  // Tier 3: Field Metadata
  ...fieldTools,

  // Tier 4: Supporting Resources
  ...organizationTools,
  ...pipelineTools,
  ...userTools,
];

/**
 * Tool definitions for MCP listTools
 */
export const toolDefinitions = allTools.map(tool => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
}));

/**
 * Get a tool handler by name
 */
export function getToolHandler(name: string) {
  const tool = allTools.find(t => t.name === name);
  return tool?.handler;
}

/**
 * Get a tool schema by name
 */
export function getToolSchema(name: string) {
  const tool = allTools.find(t => t.name === name);
  return tool?.schema;
}


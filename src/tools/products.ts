/**
 * Product-related MCP tools for Pipedrive
 */

import { readFile, realpath, stat } from "node:fs/promises";
import { resolve as resolvePath, relative as relativePath, isAbsolute } from "node:path";
import { getClient } from "../client.js";
import { getImageReadBaseDir } from "../config.js";
import {
  ListProductsSchema,
  GetProductSchema,
  SearchProductsSchema,
  CreateProductSchema,
  UpdateProductSchema,
  DeleteProductSchema,
  ListProductVariationsSchema,
  AddProductVariationSchema,
  UpdateProductVariationSchema,
  DeleteProductVariationSchema,
  ListProductFollowersSchema,
  AddProductFollowerSchema,
  DeleteProductFollowerSchema,
  ProductFollowersChangelogSchema,
  GetProductImageSchema,
  DeleteProductImageSchema,
  UploadProductImageSchema,
  UpdateProductImageSchema,
  type ListProductsParams,
  type GetProductParams,
  type SearchProductsParams,
  type CreateProductParams,
  type UpdateProductParams,
  type DeleteProductParams,
  type ListProductVariationsParams,
  type AddProductVariationParams,
  type UpdateProductVariationParams,
  type DeleteProductVariationParams,
  type ListProductFollowersParams,
  type AddProductFollowerParams,
  type DeleteProductFollowerParams,
  type ProductFollowersChangelogParams,
  type GetProductImageParams,
  type DeleteProductImageParams,
  type UploadProductImageParams,
  type UpdateProductImageParams,
} from "../schemas/products.js";
import { buildPaginationParamsV2, extractPaginationV2 } from "../utils/pagination.js";
import { mcpErrorResult, mcpErrorFromCode, destructiveOperationGuard, type McpToolErrorResult } from "../utils/errors.js";
import { createListSummary, formatToolResponse } from "../utils/formatting.js";

/** Maps a lowercase file extension to an image MIME type for multipart uploads. */
const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** Infers the image MIME type from an explicit value or the file_name extension. */
function inferImageMimeType(fileName: string, explicit?: string): string {
  if (explicit) return explicit;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_MIME_BY_EXT[ext] ?? "application/octet-stream";
}

// ─── U10: bounded, operator-gated product-image file reads (F6, KTD10) ─────────
// A caller-supplied `file_path` is a first-class dangerous surface: over a local
// STDIO transport a manipulated agent can name any path the process can read.
// Reads are deny-by-default, confined to the operator's PIPEDRIVE_IMAGE_BASE_DIR,
// size-capped before allocation, and never reflect the resolved path or raw fs
// error back to the model (errors route through fixed, path-free strings).

/**
 * Upper bound on bytes a `file_path` read may return (~5 MB), mirroring the
 * base64 input cap so neither image input vector can force a huge allocation (OOM).
 */
export const MAX_IMAGE_FILE_BYTES = 5_000_000;

/** Fixed error for a path that escapes the allowlisted base directory. */
function outsideBaseDirError(): McpToolErrorResult {
  return mcpErrorFromCode(
    "VALIDATION_ERROR",
    "The requested file is outside the permitted image directory.",
    "Place the file under the directory named by PIPEDRIVE_IMAGE_BASE_DIR, or pass base64_data instead."
  );
}

/** Fixed, path-free error for any filesystem read failure (no path or raw fs error). */
function imageReadFailedError(): McpToolErrorResult {
  return mcpErrorFromCode(
    "VALIDATION_ERROR",
    "Could not read the image file.",
    "Verify the file exists under the permitted directory and is readable, or pass base64_data instead."
  );
}

/** True when `target` is the base directory itself or nested within it. */
function isWithinBaseDir(baseDir: string, target: string): boolean {
  if (target === baseDir) return true;
  const rel = relativePath(baseDir, target);
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Reads an image from a caller-supplied path under the deny-by-default,
 * base-dir-confined, size-capped policy. Returns the bytes or an MCP error
 * result; never throws and never reflects the path or raw fs error.
 */
async function readGuardedImageFile(
  filePath: string
): Promise<{ buffer: Buffer } | { error: McpToolErrorResult }> {
  const baseDir = getImageReadBaseDir();

  // Deny-by-default: reads stay off until the operator opts in. Emit a stderr
  // hint naming the enabling mechanism so the documented use is not silently broken.
  if (!baseDir) {
    console.error(
      "[pipedrive-mcp-server] Rejected a product-image file_path read: filesystem reads are disabled. Set PIPEDRIVE_IMAGE_BASE_DIR to an allowed directory to enable them, or pass base64_data."
    );
    return {
      error: mcpErrorFromCode(
        "VALIDATION_ERROR",
        "Reading images from a file path is disabled on this server.",
        "Set PIPEDRIVE_IMAGE_BASE_DIR to an allowed directory to enable file_path reads, or pass base64_data instead."
      ),
    };
  }

  // Lexical containment: reject a traversal path before touching the filesystem.
  const resolved = resolvePath(baseDir, filePath);
  if (!isWithinBaseDir(baseDir, resolved)) {
    return { error: outsideBaseDirError() };
  }

  // Canonicalize both base and target to defeat symlink escape, then re-check
  // containment against the canonical base.
  let canonicalBase: string;
  let canonicalTarget: string;
  try {
    canonicalBase = await realpath(baseDir);
    canonicalTarget = await realpath(resolved);
  } catch {
    return { error: imageReadFailedError() };
  }
  if (!isWithinBaseDir(canonicalBase, canonicalTarget)) {
    return { error: outsideBaseDirError() };
  }

  // Size cap before reading the bytes (bounds the allocation; OOM defense).
  try {
    const info = await stat(canonicalTarget);
    if (info.size > MAX_IMAGE_FILE_BYTES) {
      return {
        error: mcpErrorFromCode(
          "VALIDATION_ERROR",
          `Image file exceeds the ${MAX_IMAGE_FILE_BYTES}-byte read limit.`,
          "Use a smaller image, or pass base64_data within the documented size limit."
        ),
      };
    }
  } catch {
    return { error: imageReadFailedError() };
  }

  try {
    return { buffer: await readFile(canonicalTarget) };
  } catch {
    return { error: imageReadFailedError() };
  }
}

/**
 * Resolves the hybrid file_path/base64_data input into a FormData with the image
 * bytes under the `data` field. Returns an MCP error result if a file_path read
 * fails or is disallowed (never throws).
 */
async function buildImageFormData(
  params: UploadProductImageParams
): Promise<{ formData: FormData } | { error: McpToolErrorResult }> {
  let buffer: Buffer;

  if (params.file_path) {
    const read = await readGuardedImageFile(params.file_path);
    if ("error" in read) return { error: read.error };
    buffer = read.buffer;
  } else {
    buffer = Buffer.from(params.base64_data!, "base64");
  }

  const mimeType = inferImageMimeType(params.file_name, params.mime_type);
  // Wrap in a fresh Uint8Array so the BlobPart type resolves to ArrayBuffer-backed
  // bytes (Node's Buffer is typed over ArrayBufferLike, which Blob rejects).
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  const formData = new FormData();
  formData.append("data", blob, params.file_name);
  return { formData };
}

// ─── U1: Read handlers ────────────────────────────────────────────────────────

/**
 * List products with optional filtering
 */
export async function listProducts(params: ListProductsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  if (params.owner_id) queryParams.set("owner_id", String(params.owner_id));
  if (params.ids) queryParams.set("ids", params.ids);
  if (params.filter_id) queryParams.set("filter_id", String(params.filter_id));
  if (params.sort_by) queryParams.set("sort_by", params.sort_by);
  if (params.sort_direction) queryParams.set("sort_direction", params.sort_direction);
  if (params.updated_since) queryParams.set("updated_since", params.updated_since);
  if (params.custom_fields) queryParams.set("custom_fields", params.custom_fields);

  const response = await client.get<unknown[]>("/products", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const products = response.data;
  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: createListSummary("product", products.length, pagination.has_more),
    data: products,
    pagination,
  });
}

/**
 * Get a single product by ID
 */
export async function getProduct(params: GetProductParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();

  const response = await client.get<unknown>(
    `/products/${params.id}`,
    queryParams.toString() ? queryParams : undefined,
    "v2"
  );

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Product ${params.id}`,
    data: response.data,
  });
}

/**
 * Search products by name, code, or custom fields
 */
export async function searchProducts(params: SearchProductsParams) {
  const client = getClient();

  const queryParams = new URLSearchParams();
  queryParams.set("term", params.term);
  if (params.fields) queryParams.set("fields", params.fields);
  if (params.exact_match) queryParams.set("exact_match", "true");
  if (params.include_fields) queryParams.set("include_fields", params.include_fields);
  if (params.limit) queryParams.set("limit", String(params.limit));
  if (params.cursor) queryParams.set("cursor", params.cursor);

  const response = await client.get<{ items?: unknown[] }>("/products/search", queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: `Search results for "${params.term}"`,
    data: response.data,
    pagination,
  });
}

// ─── U2: Write handlers ───────────────────────────────────────────────────────

/**
 * Create a new product
 */
export async function createProduct(params: CreateProductParams) {
  const client = getClient();

  const body: Record<string, unknown> = {
    name: params.name,
  };

  if (params.code !== undefined) body.code = params.code;
  if (params.description !== undefined) body.description = params.description;
  if (params.unit !== undefined) body.unit = params.unit;
  if (params.tax !== undefined) body.tax = params.tax;
  if (params.category !== undefined) body.category = params.category;
  if (params.owner_id !== undefined) body.owner_id = params.owner_id;
  if (params.is_linkable !== undefined) body.is_linkable = params.is_linkable;
  if (params.visible_to !== undefined) body.visible_to = params.visible_to;
  if (params.prices !== undefined) body.prices = params.prices;
  if (params.custom_fields !== undefined) body.custom_fields = params.custom_fields;
  if (params.billing_frequency !== undefined) body.billing_frequency = params.billing_frequency;
  if (params.billing_frequency_cycles !== undefined) body.billing_frequency_cycles = params.billing_frequency_cycles;

  const response = await client.post<unknown>("/products", body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: "Product created",
    data: response.data,
  });
}

/**
 * Update an existing product
 */
export async function updateProduct(params: UpdateProductParams) {
  const client = getClient();

  const { id, ...updateFields } = params;
  const body: Record<string, unknown> = {};

  if (updateFields.name !== undefined) body.name = updateFields.name;
  if (updateFields.code !== undefined) body.code = updateFields.code;
  if (updateFields.description !== undefined) body.description = updateFields.description;
  if (updateFields.unit !== undefined) body.unit = updateFields.unit;
  if (updateFields.tax !== undefined) body.tax = updateFields.tax;
  if (updateFields.category !== undefined) body.category = updateFields.category;
  if (updateFields.owner_id !== undefined) body.owner_id = updateFields.owner_id;
  if (updateFields.is_linkable !== undefined) body.is_linkable = updateFields.is_linkable;
  if (updateFields.visible_to !== undefined) body.visible_to = updateFields.visible_to;
  if (updateFields.prices !== undefined) body.prices = updateFields.prices;
  if (updateFields.custom_fields !== undefined) body.custom_fields = updateFields.custom_fields;
  if (updateFields.billing_frequency !== undefined) body.billing_frequency = updateFields.billing_frequency;
  if (updateFields.billing_frequency_cycles !== undefined) body.billing_frequency_cycles = updateFields.billing_frequency_cycles;

  const response = await client.patch<unknown>(`/products/${id}`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Product ${id} updated`,
    data: response.data,
  });
}

/**
 * Delete a product
 */
export async function deleteProduct(params: DeleteProductParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/products/${params.id}`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Product ${params.id} deleted (will be permanently removed after 30 days)`,
    data: response.data,
  });
}

// ─── U3: Product variation handlers ──────────────────────────────────────────

/**
 * List variations for a product
 */
export async function listProductVariations(params: ListProductVariationsParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  const response = await client.get<unknown[]>(`/products/${params.id}/variations`, queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const data = response.data;
  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: createListSummary("product variation", data.length, pagination.has_more),
    data,
    pagination,
  });
}

/**
 * Add a variation to a product
 */
export async function addProductVariation(params: AddProductVariationParams) {
  const client = getClient();

  const body: Record<string, unknown> = { name: params.name };
  if (params.prices !== undefined) body.prices = params.prices;

  const response = await client.post<unknown>(`/products/${params.id}/variations`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: "Product variation created",
    data: response.data,
  });
}

/**
 * Update a product variation
 */
export async function updateProductVariation(params: UpdateProductVariationParams) {
  const client = getClient();

  const { id, product_variation_id, ...fields } = params;
  const body: Record<string, unknown> = {};

  if (fields.name !== undefined) body.name = fields.name;
  if (fields.prices !== undefined) body.prices = fields.prices;

  const response = await client.patch<unknown>(`/products/${id}/variations/${product_variation_id}`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Product variation ${product_variation_id} updated`,
    data: response.data,
  });
}

/**
 * Delete a product variation
 */
export async function deleteProductVariation(params: DeleteProductVariationParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/products/${params.id}/variations/${params.product_variation_id}`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Product variation ${params.product_variation_id} deleted`,
    data: response.data,
  });
}

// ─── U4: Product follower handlers ────────────────────────────────────────────

/**
 * List followers for a product
 */
export async function listProductFollowers(params: ListProductFollowersParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  const response = await client.get<unknown[]>(`/products/${params.id}/followers`, queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const data = response.data;
  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: createListSummary("follower", data.length, pagination.has_more),
    data,
    pagination,
  });
}

/**
 * Add a follower to a product
 */
export async function addProductFollower(params: AddProductFollowerParams) {
  const client = getClient();

  const body = { user_id: params.user_id };

  const response = await client.post<unknown>(`/products/${params.id}/followers`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: "Follower added to product",
    data: response.data,
  });
}

/**
 * Get the followers changelog for a product
 */
export async function getProductFollowersChangelog(params: ProductFollowersChangelogParams) {
  const client = getClient();

  const queryParams = buildPaginationParamsV2(params.cursor, params.limit);

  const response = await client.get<unknown[]>(`/products/${params.id}/followers/changelog`, queryParams, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  const data = response.data;
  const pagination = extractPaginationV2(response);

  return formatToolResponse({
    summary: `Followers changelog for product ${params.id}`,
    data,
    pagination,
  });
}

/**
 * Delete a product follower
 */
export async function deleteProductFollower(params: DeleteProductFollowerParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ user_id: number }>(`/products/${params.id}/followers/${params.follower_id}`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Follower ${params.follower_id} removed from product ${params.id}`,
    data: response.data,
  });
}

// ─── U6: Product image handlers ───────────────────────────────────────────────

/**
 * Get the image for a product
 */
export async function getProductImage(params: GetProductImageParams) {
  const client = getClient();

  const response = await client.get<unknown>(`/products/${params.id}/images`, undefined, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Image for product ${params.id}`,
    data: response.data,
  });
}

/**
 * Delete the image of a product
 */
export async function deleteProductImage(params: DeleteProductImageParams) {
  const guard = destructiveOperationGuard();
  if (guard) return guard;

  const client = getClient();

  const response = await client.delete<{ id: number }>(`/products/${params.id}/images`, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Image deleted from product ${params.id}`,
    data: response.data,
  });
}

// ─── Product image upload/update handlers (#69 U5) ────────────────────────────

/**
 * Upload an image for a product (multipart/form-data)
 */
export async function uploadProductImage(params: UploadProductImageParams) {
  const client = getClient();

  const built = await buildImageFormData(params);
  if ("error" in built) return built.error;

  const response = await client.postMultipart<unknown>(`/products/${params.id}/images`, built.formData, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Image uploaded for product ${params.id}`,
    data: response.data,
  });
}

/**
 * Update (replace) the image of a product (multipart/form-data)
 */
export async function updateProductImage(params: UpdateProductImageParams) {
  const client = getClient();

  const built = await buildImageFormData(params);
  if ("error" in built) return built.error;

  const response = await client.putMultipart<unknown>(`/products/${params.id}/images`, built.formData, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return formatToolResponse({
    summary: `Image updated for product ${params.id}`,
    data: response.data,
  });
}

// ─── Tool definitions for MCP registration ───────────────────────────────────

export const productTools = [
  // U1: Read tools
  {
    name: "pipedrive_list_products",
    description: "List products from Pipedrive with optional filtering by owner, IDs, or filter.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cursor: { type: "string", description: "Cursor for pagination" },
        limit: { type: "number", description: "Number of items (1-100)" },
        owner_id: { type: "number", description: "Filter by owner user ID" },
        ids: { type: "string", description: "Comma-separated product IDs to fetch (max 100)" },
        filter_id: { type: "number", description: "Filter by saved filter ID" },
        sort_by: { type: "string", enum: ["id", "name", "add_time", "update_time"], description: "Field to sort by" },
        sort_direction: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
        updated_since: { type: "string", description: "Filter products updated after this time (RFC3339 format)" },
        custom_fields: { type: "string", description: "Include custom fields in response (comma-separated field keys, max 15)" },
      },
    },
    handler: listProducts,
    schema: ListProductsSchema,
  },
  {
    name: "pipedrive_get_product",
    description: "Get detailed information about a specific product by ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The product ID" },
      },
      required: ["id"],
    },
    handler: getProduct,
    schema: GetProductSchema,
  },
  {
    name: "pipedrive_search_products",
    description: "Search for products by name, code, or custom fields.",
    inputSchema: {
      type: "object" as const,
      properties: {
        term: { type: "string", description: "Search term" },
        fields: { type: "string", enum: ["code", "custom_fields", "name"], description: "Field to search in. Defaults to all." },
        exact_match: { type: "boolean", description: "Use exact match" },
        include_fields: { type: "string", enum: ["product.price"], description: "Extra fields to include (product.price)" },
        limit: { type: "number", description: "Number of results (1-100)" },
        cursor: { type: "string", description: "Cursor for pagination (from previous response)" },
      },
      required: ["term"],
    },
    handler: searchProducts,
    schema: SearchProductsSchema,
  },
  // U2: Write tools
  {
    name: "pipedrive_create_product",
    description: "Create a new product in Pipedrive. Only name is required.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Product name (required)" },
        code: { type: "string", description: "Product code" },
        description: { type: "string", description: "Product description" },
        unit: { type: "string", description: "Unit of measurement" },
        tax: { type: "number", description: "Tax percentage (default 0)" },
        category: { type: "number", description: "Product category ID" },
        owner_id: { type: "number", description: "Owner user ID" },
        is_linkable: { type: "boolean", description: "Whether the product can be linked to deals (default true)" },
        visible_to: { type: "number", enum: [1, 3, 5, 7], description: "Visibility: 1=Owner, 3=Group, 5=Subgroups, 7=Company" },
        prices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              currency: { type: "string", description: "3-letter ISO currency code" },
              price: { type: "number", description: "Price amount" },
              cost: { type: "number", description: "Cost amount" },
              direct_cost: { type: "number", description: "Direct cost amount" },
            },
            required: ["price"],
          },
          description: "Array of price objects per currency",
        },
        custom_fields: { type: "object", description: "Custom field values as object with field keys" },
        billing_frequency: {
          type: "string",
          enum: ["one-time", "annually", "semi-annually", "quarterly", "monthly", "weekly"],
          description: "Billing frequency (default one-time)",
        },
        billing_frequency_cycles: { type: "number", description: "Number of billing cycles (max 208, null = unlimited)" },
      },
      required: ["name"],
    },
    handler: createProduct,
    schema: CreateProductSchema,
  },
  {
    name: "pipedrive_update_product",
    description: "Update an existing product in Pipedrive.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Product ID to update" },
        name: { type: "string", description: "New product name" },
        code: { type: "string", description: "New product code" },
        description: { type: "string", description: "New product description" },
        unit: { type: "string", description: "New unit of measurement" },
        tax: { type: "number", description: "New tax percentage" },
        category: { type: "number", description: "New product category ID" },
        owner_id: { type: "number", description: "New owner user ID" },
        is_linkable: { type: "boolean", description: "Whether the product can be linked to deals" },
        visible_to: { type: "number", enum: [1, 3, 5, 7], description: "New visibility: 1=Owner, 3=Group, 5=Subgroups, 7=Company" },
        prices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              currency: { type: "string", description: "3-letter ISO currency code" },
              price: { type: "number", description: "Price amount" },
              cost: { type: "number", description: "Cost amount" },
              direct_cost: { type: "number", description: "Direct cost amount" },
            },
            required: ["price"],
          },
          description: "Array of price objects per currency",
        },
        custom_fields: { type: "object", description: "Custom field values as object with field keys" },
        billing_frequency: {
          type: "string",
          enum: ["one-time", "annually", "semi-annually", "quarterly", "monthly", "weekly"],
          description: "Billing frequency",
        },
        billing_frequency_cycles: { type: "number", description: "Number of billing cycles (max 208, null = unlimited)" },
      },
      required: ["id"],
    },
    handler: updateProduct,
    schema: UpdateProductSchema,
  },
  {
    name: "pipedrive_delete_product",
    description: "Delete a product. The product will be marked as deleted and permanently removed after 30 days.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Product ID to delete" },
      },
      required: ["id"],
    },
    destructive: true,
    handler: deleteProduct,
    schema: DeleteProductSchema,
  },
  // U3: Product variation tools
  {
    name: "pipedrive_list_product_variations",
    description: "List all variations for a product.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The product ID" },
        cursor: { type: "string", description: "Cursor for pagination" },
        limit: { type: "number", description: "Number of items (1-100)" },
      },
      required: ["id"],
    },
    handler: listProductVariations,
    schema: ListProductVariationsSchema,
  },
  {
    name: "pipedrive_add_product_variation",
    description: "Add a variation to a product.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The product ID" },
        name: { type: "string", description: "Product variation name (required, max 255 chars)" },
        prices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              currency: { type: "string", description: "3-letter ISO currency code" },
              price: { type: "number", description: "Price amount" },
              cost: { type: "number", description: "Cost amount" },
              direct_cost: { type: "number", description: "Direct cost amount" },
              notes: { type: "string", description: "Notes about this price" },
            },
            required: ["price"],
          },
          description: "Array of price objects per currency",
        },
      },
      required: ["id", "name"],
    },
    handler: addProductVariation,
    schema: AddProductVariationSchema,
  },
  {
    name: "pipedrive_update_product_variation",
    description: "Update an existing product variation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The product ID" },
        product_variation_id: { type: "number", description: "The product variation ID" },
        name: { type: "string", description: "Product variation name (max 255 chars)" },
        prices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              currency: { type: "string", description: "3-letter ISO currency code" },
              price: { type: "number", description: "Price amount" },
              cost: { type: "number", description: "Cost amount" },
              direct_cost: { type: "number", description: "Direct cost amount" },
              notes: { type: "string", description: "Notes about this price" },
            },
            required: ["price"],
          },
          description: "Array of price objects per currency",
        },
      },
      required: ["id", "product_variation_id"],
    },
    handler: updateProductVariation,
    schema: UpdateProductVariationSchema,
  },
  {
    name: "pipedrive_delete_product_variation",
    description: "Delete a product variation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The product ID" },
        product_variation_id: { type: "number", description: "The product variation ID" },
      },
      required: ["id", "product_variation_id"],
    },
    destructive: true,
    handler: deleteProductVariation,
    schema: DeleteProductVariationSchema,
  },
  // U4: Product follower tools
  {
    name: "pipedrive_list_product_followers",
    description: "List all followers for a product.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The product ID" },
        cursor: { type: "string", description: "Cursor for pagination" },
        limit: { type: "number", description: "Number of items (1-100)" },
      },
      required: ["id"],
    },
    handler: listProductFollowers,
    schema: ListProductFollowersSchema,
  },
  {
    name: "pipedrive_add_product_follower",
    description: "Add a follower to a product.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The product ID" },
        user_id: { type: "number", description: "The ID of the user to add as a follower (required)" },
      },
      required: ["id", "user_id"],
    },
    handler: addProductFollower,
    schema: AddProductFollowerSchema,
  },
  {
    name: "pipedrive_delete_product_follower",
    description: "Remove a follower from a product.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The product ID" },
        follower_id: { type: "number", description: "The ID of the follower (user) to remove" },
      },
      required: ["id", "follower_id"],
    },
    destructive: true,
    handler: deleteProductFollower,
    schema: DeleteProductFollowerSchema,
  },
  {
    name: "pipedrive_get_product_followers_changelog",
    description: "Get the followers changelog for a product.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The product ID" },
        cursor: { type: "string", description: "Cursor for pagination" },
        limit: { type: "number", description: "Number of items (1-100)" },
      },
      required: ["id"],
    },
    handler: getProductFollowersChangelog,
    schema: ProductFollowersChangelogSchema,
  },
  // U6: Product image tools
  {
    name: "pipedrive_get_product_image",
    description: "Get the image of a product (returns a single image with a public URL valid for 7 days).",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The product ID" },
      },
      required: ["id"],
    },
    handler: getProductImage,
    schema: GetProductImageSchema,
  },
  {
    name: "pipedrive_delete_product_image",
    description: "Delete the image of a product.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The product ID" },
      },
      required: ["id"],
    },
    destructive: true,
    handler: deleteProductImage,
    schema: DeleteProductImageSchema,
  },
  // Product image upload/update tools (#69 U5)
  {
    name: "pipedrive_upload_product_image",
    description: "Upload an image for a product. Provide the image via EITHER file_path OR base64_data (exactly one required). Supports png, jpeg, gif, and webp. Note: file_path is read by the SERVER process via the filesystem and is disabled by default; the operator must set PIPEDRIVE_IMAGE_BASE_DIR and the path must resolve within it; otherwise use base64_data, which is transport-safe.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The product ID" },
        file_path: { type: "string", description: "Path the server reads via fs.readFile, confined to PIPEDRIVE_IMAGE_BASE_DIR (filesystem reads are disabled unless that variable is set). Mutually exclusive with base64_data." },
        base64_data: { type: "string", description: "Base64-encoded image bytes (transport-safe). Mutually exclusive with file_path." },
        file_name: { type: "string", description: "Original filename including extension (e.g. product.png)" },
        mime_type: { type: "string", enum: ["image/png", "image/jpeg", "image/gif", "image/webp"], description: "MIME type. Inferred from file_name if omitted." },
      },
      required: ["id", "file_name"],
    },
    handler: uploadProductImage,
    schema: UploadProductImageSchema,
  },
  {
    name: "pipedrive_update_product_image",
    description: "Update (replace) the image of a product. Provide the image via EITHER file_path OR base64_data (exactly one required). Supports png, jpeg, gif, and webp. Note: file_path is read by the SERVER process via the filesystem and is disabled by default; the operator must set PIPEDRIVE_IMAGE_BASE_DIR and the path must resolve within it; otherwise use base64_data, which is transport-safe.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "The product ID" },
        file_path: { type: "string", description: "Path the server reads via fs.readFile, confined to PIPEDRIVE_IMAGE_BASE_DIR (filesystem reads are disabled unless that variable is set). Mutually exclusive with base64_data." },
        base64_data: { type: "string", description: "Base64-encoded image bytes (transport-safe). Mutually exclusive with file_path." },
        file_name: { type: "string", description: "Original filename including extension (e.g. product.png)" },
        mime_type: { type: "string", enum: ["image/png", "image/jpeg", "image/gif", "image/webp"], description: "MIME type. Inferred from file_name if omitted." },
      },
      required: ["id", "file_name"],
    },
    handler: updateProductImage,
    schema: UpdateProductImageSchema,
  },
];

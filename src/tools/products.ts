/**
 * Product-related MCP tools for Pipedrive
 */

import { getClient } from "../client.js";
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
} from "../schemas/products.js";
import { buildPaginationParamsV2, extractPaginationV2 } from "../utils/pagination.js";
import { mcpErrorResult, destructiveOperationGuard } from "../utils/errors.js";
import { createListSummary } from "../utils/formatting.js";

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

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("product", products.length, pagination.has_more),
        data: products,
        pagination,
      }, null, 2),
    }],
  };
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

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Product ${params.id}`,
        data: response.data,
      }, null, 2),
    }],
  };
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

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: "Product created",
        data: response.data,
      }, null, 2),
    }],
  };
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

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Product ${id} updated`,
        data: response.data,
      }, null, 2),
    }],
  };
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

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Product ${params.id} deleted (will be permanently removed after 30 days)`,
        data: response.data,
      }, null, 2),
    }],
  };
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

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: createListSummary("product variation", data.length, pagination.has_more),
        data,
        pagination,
      }, null, 2),
    }],
  };
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

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: "Product variation created",
        data: response.data,
      }, null, 2),
    }],
  };
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

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Product variation ${product_variation_id} updated`,
        data: response.data,
      }, null, 2),
    }],
  };
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

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Product variation ${params.product_variation_id} deleted`,
        data: response.data,
      }, null, 2),
    }],
  };
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
 * Add a follower to a product
 */
export async function addProductFollower(params: AddProductFollowerParams) {
  const client = getClient();

  const body = { user_id: params.user_id };

  const response = await client.post<unknown>(`/products/${params.id}/followers`, body, "v2");

  if (!response.success || !response.data) {
    return mcpErrorResult(response);
  }

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: "Follower added to product",
        data: response.data,
      }, null, 2),
    }],
  };
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

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Followers changelog for product ${params.id}`,
        data,
        pagination,
      }, null, 2),
    }],
  };
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

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Follower ${params.follower_id} removed from product ${params.id}`,
        data: response.data,
      }, null, 2),
    }],
  };
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

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Image for product ${params.id}`,
        data: response.data,
      }, null, 2),
    }],
  };
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

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        summary: `Image deleted from product ${params.id}`,
        data: response.data,
      }, null, 2),
    }],
  };
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
    handler: deleteProductImage,
    schema: DeleteProductImageSchema,
  },
];

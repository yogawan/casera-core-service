// @/app/scalar/docs/paths/shavings.ts
const shavingResponse = {
  "application/json": {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: { shaving: { $ref: "#/components/schemas/Shaving" } },
        },
      },
    },
  },
};

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
};

const revenueSharing = {
  type: "object",
  description:
    "ownerPercentage + employeePercentage must sum to exactly 100. Optional on create — defaults to 50/50 if omitted.",
  properties: {
    ownerPercentage: { type: "number", minimum: 0, maximum: 100 },
    employeePercentage: { type: "number", minimum: 0, maximum: 100 },
  },
};

export const shavingPaths = {
  "/api/v1/shavings": {
    get: {
      tags: ["Shavings"],
      operationId: "listShavings",
      summary: "List shavings — HOST and AGENT both see the full catalog",
      description:
        "Unlike the old Service catalog, this model has no isActive field, so there is no inactive subset to hide.",
      responses: {
        "200": {
          description: "List of shavings",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      shavings: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Shaving" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { description: "Not authenticated" },
        "402": {
          $ref: "#/components/responses/SubscriptionRequiredAgentExempt",
        },
        "403": { description: "Not HOST/AGENT" },
      },
    },
    post: {
      tags: ["Shavings"],
      operationId: "createShaving",
      summary: "Create a shaving (HOST only)",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string", minLength: 1, maxLength: 100 },
                price: { type: "number", minimum: 0 },
                revenueSharing,
              },
              required: ["name", "price"],
            },
          },
        },
      },
      responses: {
        "201": { description: "Shaving created", content: shavingResponse },
        "400": {
          description:
            "Validation error, or revenueSharing percentages don't sum to 100",
        },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
        "403": { description: "Not HOST" },
      },
    },
  },
  "/api/v1/shavings/{id}": {
    get: {
      tags: ["Shavings"],
      operationId: "getShaving",
      summary: "Get shaving detail (HOST/AGENT)",
      parameters: [idParam],
      responses: {
        "200": { description: "Shaving detail", content: shavingResponse },
        "401": { description: "Not authenticated" },
        "402": {
          $ref: "#/components/responses/SubscriptionRequiredAgentExempt",
        },
        "403": { description: "Not HOST/AGENT" },
        "404": { description: "Shaving not found" },
      },
    },
    patch: {
      tags: ["Shavings"],
      operationId: "updateShaving",
      summary: "Update a shaving (HOST only)",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string", minLength: 1, maxLength: 100 },
                price: { type: "number", minimum: 0 },
                revenueSharing,
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Shaving updated", content: shavingResponse },
        "400": {
          description:
            "Validation error, or revenueSharing percentages don't sum to 100",
        },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
        "403": { description: "Not HOST" },
        "404": { description: "Shaving not found" },
      },
    },
  },
};

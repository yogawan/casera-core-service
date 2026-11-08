// @/app/scalar/docs/paths/chemicals.ts
const chemicalResponse = {
  "application/json": {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: { chemical: { $ref: "#/components/schemas/Chemical" } },
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
    "ownerPercentage + employeePercentage must sum to exactly 100. Optional on create — defaults to 60/40 if omitted.",
  properties: {
    ownerPercentage: { type: "number", minimum: 0, maximum: 100 },
    employeePercentage: { type: "number", minimum: 0, maximum: 100 },
  },
};

export const chemicalPaths = {
  "/api/v1/chemicals": {
    get: {
      tags: ["Chemicals"],
      operationId: "listChemicals",
      summary: "List chemicals — HOST and AGENT both see the full catalog",
      description:
        "Unlike the old Service catalog, this model has no isActive field, so there is no inactive subset to hide.",
      responses: {
        "200": {
          description: "List of chemicals",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      chemicals: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Chemical" },
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
      tags: ["Chemicals"],
      operationId: "createChemical",
      summary: "Create a chemical (HOST only)",
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
        "201": { description: "Chemical created", content: chemicalResponse },
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
  "/api/v1/chemicals/{id}": {
    get: {
      tags: ["Chemicals"],
      operationId: "getChemical",
      summary: "Get chemical detail (HOST/AGENT)",
      parameters: [idParam],
      responses: {
        "200": { description: "Chemical detail", content: chemicalResponse },
        "401": { description: "Not authenticated" },
        "402": {
          $ref: "#/components/responses/SubscriptionRequiredAgentExempt",
        },
        "403": { description: "Not HOST/AGENT" },
        "404": { description: "Chemical not found" },
      },
    },
    patch: {
      tags: ["Chemicals"],
      operationId: "updateChemical",
      summary: "Update a chemical (HOST only)",
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
        "200": { description: "Chemical updated", content: chemicalResponse },
        "400": {
          description:
            "Validation error, or revenueSharing percentages don't sum to 100",
        },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
        "403": { description: "Not HOST" },
        "404": { description: "Chemical not found" },
      },
    },
  },
};

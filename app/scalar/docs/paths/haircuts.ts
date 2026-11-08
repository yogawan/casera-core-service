// @/app/scalar/docs/paths/haircuts.ts
const haircutResponse = {
  "application/json": {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: { haircut: { $ref: "#/components/schemas/Haircut" } },
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

export const haircutPaths = {
  "/api/v1/haircuts": {
    get: {
      tags: ["Haircuts"],
      operationId: "listHaircuts",
      summary: "List haircuts — HOST and AGENT both see the full catalog",
      description:
        "Unlike the old Service catalog, this model has no isActive field, so there is no inactive subset to hide.",
      responses: {
        "200": {
          description: "List of haircuts",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      haircuts: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Haircut" },
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
      tags: ["Haircuts"],
      operationId: "createHaircut",
      summary: "Create a haircut (HOST only)",
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
        "201": { description: "Haircut created", content: haircutResponse },
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
  "/api/v1/haircuts/{id}": {
    get: {
      tags: ["Haircuts"],
      operationId: "getHaircut",
      summary: "Get haircut detail (HOST/AGENT)",
      parameters: [idParam],
      responses: {
        "200": { description: "Haircut detail", content: haircutResponse },
        "401": { description: "Not authenticated" },
        "402": {
          $ref: "#/components/responses/SubscriptionRequiredAgentExempt",
        },
        "403": { description: "Not HOST/AGENT" },
        "404": { description: "Haircut not found" },
      },
    },
    patch: {
      tags: ["Haircuts"],
      operationId: "updateHaircut",
      summary: "Update a haircut (HOST only)",
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
        "200": { description: "Haircut updated", content: haircutResponse },
        "400": {
          description:
            "Validation error, or revenueSharing percentages don't sum to 100",
        },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
        "403": { description: "Not HOST" },
        "404": { description: "Haircut not found" },
      },
    },
  },
};

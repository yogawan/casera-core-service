// @/app/scalar/docs/paths/colourings.ts
const colouringResponse = {
  "application/json": {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: {
            colouring: { $ref: "#/components/schemas/Colouring" },
          },
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

export const colouringPaths = {
  "/api/v1/colourings": {
    get: {
      tags: ["Colourings"],
      operationId: "listColourings",
      summary: "List colourings — HOST and AGENT both see the full catalog",
      description:
        "Unlike the old Service catalog, this model has no isActive field, so there is no inactive subset to hide.",
      responses: {
        "200": {
          description: "List of colourings",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      colourings: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Colouring" },
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
      tags: ["Colourings"],
      operationId: "createColouring",
      summary: "Create a colouring (HOST only)",
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
        "201": {
          description: "Colouring created",
          content: colouringResponse,
        },
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
  "/api/v1/colourings/{id}": {
    get: {
      tags: ["Colourings"],
      operationId: "getColouring",
      summary: "Get colouring detail (HOST/AGENT)",
      parameters: [idParam],
      responses: {
        "200": {
          description: "Colouring detail",
          content: colouringResponse,
        },
        "401": { description: "Not authenticated" },
        "402": {
          $ref: "#/components/responses/SubscriptionRequiredAgentExempt",
        },
        "403": { description: "Not HOST/AGENT" },
        "404": { description: "Colouring not found" },
      },
    },
    patch: {
      tags: ["Colourings"],
      operationId: "updateColouring",
      summary: "Update a colouring (HOST only)",
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
        "200": {
          description: "Colouring updated",
          content: colouringResponse,
        },
        "400": {
          description:
            "Validation error, or revenueSharing percentages don't sum to 100",
        },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
        "403": { description: "Not HOST" },
        "404": { description: "Colouring not found" },
      },
    },
  },
};

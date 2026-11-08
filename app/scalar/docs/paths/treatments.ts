// @/app/scalar/docs/paths/treatments.ts
const treatmentResponse = {
  "application/json": {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: {
            treatment: { $ref: "#/components/schemas/Treatment" },
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
    "ownerPercentage + employeePercentage must sum to exactly 100. Optional on create — defaults to 50/50 if omitted.",
  properties: {
    ownerPercentage: { type: "number", minimum: 0, maximum: 100 },
    employeePercentage: { type: "number", minimum: 0, maximum: 100 },
  },
};

export const treatmentPaths = {
  "/api/v1/treatments": {
    get: {
      tags: ["Treatments"],
      operationId: "listTreatments",
      summary: "List treatments — HOST and AGENT both see the full catalog",
      description:
        "Unlike the old Service catalog, this model has no isActive field, so there is no inactive subset to hide.",
      responses: {
        "200": {
          description: "List of treatments",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      treatments: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Treatment" },
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
      tags: ["Treatments"],
      operationId: "createTreatment",
      summary: "Create a treatment (HOST only)",
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
          description: "Treatment created",
          content: treatmentResponse,
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
  "/api/v1/treatments/{id}": {
    get: {
      tags: ["Treatments"],
      operationId: "getTreatment",
      summary: "Get treatment detail (HOST/AGENT)",
      parameters: [idParam],
      responses: {
        "200": {
          description: "Treatment detail",
          content: treatmentResponse,
        },
        "401": { description: "Not authenticated" },
        "402": {
          $ref: "#/components/responses/SubscriptionRequiredAgentExempt",
        },
        "403": { description: "Not HOST/AGENT" },
        "404": { description: "Treatment not found" },
      },
    },
    patch: {
      tags: ["Treatments"],
      operationId: "updateTreatment",
      summary: "Update a treatment (HOST only)",
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
          description: "Treatment updated",
          content: treatmentResponse,
        },
        "400": {
          description:
            "Validation error, or revenueSharing percentages don't sum to 100",
        },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
        "403": { description: "Not HOST" },
        "404": { description: "Treatment not found" },
      },
    },
  },
};

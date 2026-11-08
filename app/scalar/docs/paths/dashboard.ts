// @/app/scalar/docs/paths/dashboard.ts
// Shared across summary/revenue/services/agents/transactions — not inventory,
// which takes its own (branchId, threshold) pair instead.
const baseDashboardParams = [
  {
    name: "period",
    in: "query",
    schema: {
      type: "string",
      enum: ["DAY", "WEEK", "MONTH", "YEAR"],
      default: "MONTH",
    },
    description: "Ignored if both from and to are given.",
  },
  {
    name: "from",
    in: "query",
    schema: { type: "string", format: "date-time" },
  },
  { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
  {
    name: "compare",
    in: "query",
    schema: { type: "boolean", default: false },
    description:
      "Accepted but currently ignored server-side — not yet implemented.",
  },
  {
    name: "branchId",
    in: "query",
    schema: { type: "string" },
    description: "HOST only; AGENT is scoped to their own branch.",
  },
  {
    name: "agentId",
    in: "query",
    schema: { type: "string" },
    description: "HOST only; AGENT always sees only themselves.",
  },
];

export const dashboardPaths = {
  "/api/v1/dashboard/summary": {
    get: {
      tags: ["Dashboard"],
      operationId: "getDashboardSummary",
      summary:
        "Headline totals for the period (revenue, transaction count, AOV, unique customers)",
      description:
        "Excludes CANCELLED transactions; totalRevenue only counts paymentStatus=PAID.",
      parameters: baseDashboardParams,
      responses: {
        "200": {
          description: "Summary totals",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      summary: {
                        type: "object",
                        properties: {
                          totalRevenue: { type: "number" },
                          transactionCount: { type: "integer" },
                          avgOrderValue: { type: "number" },
                          uniqueCustomers: { type: "integer" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "400": { description: "Validation error (e.g. from after to)" },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
      },
    },
  },
  "/api/v1/dashboard/revenue": {
    get: {
      tags: ["Dashboard"],
      operationId: "getDashboardRevenue",
      summary: "Revenue broken down by period bucket and by payment method",
      parameters: baseDashboardParams,
      responses: {
        "200": {
          description: "Revenue breakdown",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      revenue: {
                        type: "object",
                        properties: {
                          byPeriod: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                revenue: { type: "number" },
                                transactionCount: { type: "integer" },
                                ownerRevenue: { type: "number" },
                                agentRevenue: { type: "number" },
                              },
                            },
                          },
                          paymentBreakdown: {
                            type: "array",
                            description:
                              "Always exactly one row per payment method (CASH, QRIS), in that order — zero-filled when a method has no transactions in range.",
                            items: {
                              type: "object",
                              properties: {
                                _id: { type: "string", enum: ["CASH", "QRIS"] },
                                count: { type: "integer" },
                                revenue: { type: "number" },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
      },
    },
  },
  "/api/v1/dashboard/services": {
    get: {
      tags: ["Dashboard"],
      operationId: "getDashboardServicePerformance",
      summary:
        "Top services by revenue for the period, ranked across all five categories",
      description:
        "PRD §5.14: Service (one collection) is replaced by five category collections, each ranked independently then merged into one combined, revenue-sorted list — `category` on each row disambiguates which collection `_id` belongs to. `revenue` is each category document's own gross snapshot price (PAID-gated), never a discount-prorated figure. Capped (not paginated, see docs/PAGINATION-CONTRACT.md §6); `meta.limit`/`meta.total`/`meta.truncated` describe the cap.",
      parameters: baseDashboardParams,
      responses: {
        "200": {
          description: "Service performance",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      services: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            _id: {
                              type: "string",
                              description:
                                "Haircut/Shaving/Treatment/Colouring/Chemical id — disambiguated by the category field below.",
                            },
                            category: {
                              type: "string",
                              enum: [
                                "HAIRCUT",
                                "SHAVING",
                                "TREATMENT",
                                "COLOURING",
                                "CHEMICAL",
                              ],
                            },
                            serviceName: { type: "string" },
                            count: { type: "integer" },
                            revenue: { type: "number" },
                            avgOrderValue: { type: "number" },
                          },
                        },
                      },
                      meta: {
                        type: "object",
                        properties: {
                          limit: { type: "integer" },
                          total: {
                            type: "integer",
                            description:
                              "Untruncated count across all five categories combined.",
                          },
                          truncated: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
      },
    },
  },
  "/api/v1/dashboard/agents": {
    get: {
      tags: ["Dashboard"],
      operationId: "getDashboardAgentPerformance",
      summary:
        "Per-agent performance for the period — AGENT sees only themselves",
      description:
        "agentName is currently the raw agent ObjectId, not a hydrated display name — look up full user details via GET /users/{id} if needed.",
      parameters: baseDashboardParams,
      responses: {
        "200": {
          description: "Agent performance",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      agents: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            _id: { type: "string", description: "Agent id" },
                            agentName: {
                              type: "string",
                              description:
                                "Actually the agent's ObjectId, not a name.",
                            },
                            transactionCount: { type: "integer" },
                            totalRevenue: { type: "number" },
                            agentRevenue: { type: "number" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
      },
    },
  },
  "/api/v1/dashboard/transactions": {
    get: {
      tags: ["Dashboard"],
      operationId: "getDashboardTransactionStats",
      summary:
        "Transaction counts grouped by status, payment status, and payment method",
      parameters: baseDashboardParams,
      responses: {
        "200": {
          description: "Transaction stats",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      stats: {
                        type: "object",
                        properties: {
                          byStatus: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: { count: { type: "integer" } },
                            },
                          },
                          byPaymentStatus: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: { count: { type: "integer" } },
                            },
                          },
                          byPaymentMethod: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: { count: { type: "integer" } },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
      },
    },
  },
  "/api/v1/dashboard/inventory": {
    get: {
      tags: ["Dashboard"],
      operationId: "getDashboardLowStock",
      summary:
        "Up to 20 active items at or below their own minimumStock, lowest quantity first",
      parameters: [
        {
          name: "branchId",
          in: "query",
          schema: { type: "string" },
          description: "HOST only",
        },
        {
          name: "threshold",
          in: "query",
          schema: { type: "number", default: 0 },
          description:
            "Accepted but currently unused — low-stock detection always compares against each item's own minimumStock.",
        },
      ],
      responses: {
        "200": {
          description: "Low-stock items",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      inventory: {
                        type: "array",
                        items: { $ref: "#/components/schemas/InventoryItem" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
      },
    },
  },
};

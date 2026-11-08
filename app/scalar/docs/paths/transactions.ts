// @/app/scalar/docs/paths/transactions.ts
const transactionResponse = {
  "application/json": {
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: {
            transaction: { $ref: "#/components/schemas/Transaction" },
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

export const transactionPaths = {
  "/api/v1/transactions": {
    get: {
      tags: ["Transactions"],
      operationId: "listTransactions",
      summary:
        "List transactions — HOST can filter by branch/agent, AGENT is scoped to their own branch",
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 20, maximum: 100 },
        },
        {
          name: "search",
          in: "query",
          schema: { type: "string" },
          description: "Matches transactionCode",
        },
        {
          name: "paymentStatus",
          in: "query",
          schema: {
            type: "string",
            enum: [
              "PENDING",
              "PAID",
              "FAILED",
              "REFUNDED",
              "PARTIALLY_REFUNDED",
            ],
          },
        },
        {
          name: "transactionStatus",
          in: "query",
          schema: {
            type: "string",
            enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
          },
        },
        {
          name: "from",
          in: "query",
          schema: { type: "string", format: "date-time" },
        },
        {
          name: "to",
          in: "query",
          schema: { type: "string", format: "date-time" },
        },
        {
          name: "branchId",
          in: "query",
          schema: { type: "string" },
          description: "HOST only",
        },
        {
          name: "agentId",
          in: "query",
          schema: { type: "string" },
          description: "HOST only",
        },
      ],
      responses: {
        "200": {
          description: "Paginated list of transactions",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      transactions: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Transaction" },
                      },
                      pagination: { $ref: "#/components/schemas/Pagination" },
                    },
                  },
                },
              },
            },
          },
        },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "402": {
          $ref: "#/components/responses/SubscriptionRequiredAgentExempt",
        },
        "403": { description: "Not HOST/AGENT" },
      },
    },
    post: {
      tags: ["Transactions"],
      operationId: "createTransaction",
      summary: "Create a transaction (AGENT only — HOST cannot create sales)",
      description:
        "agent/branch come from the session, never the request body. Price and revenue split are computed server-side from the chosen category documents' current price, never trusted from the client. At least one of haircutId/shavingId/treatmentId/colouringId/chemicalId is required — up to all five may be set at once (never more than one per category). Exactly one category filled uses the original single-category formula (ownerRevenue split from the post-discount total); more than one switches to a gross-per-category formula where discountAmount only reduces `total`, never ownerRevenue/employeeRevenue. CASH is paymentStatus=PAID immediately; QRIS stays PENDING and a Payment is created inline — if the Midtrans charge call fails, the transaction is still created and `paymentError` describes the failure so the client can retry via POST /payments/qris.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                customerId: { type: "string" },
                haircutId: { type: "string" },
                shavingId: { type: "string" },
                treatmentId: { type: "string" },
                colouringId: { type: "string" },
                chemicalId: {
                  type: "string",
                  description:
                    "At least one of haircutId/shavingId/treatmentId/colouringId/chemicalId is required; any combination of the five may be set together.",
                },
                employeeId: {
                  type: "string",
                  description:
                    "Who performed the service — distinct from the agent (session). Must resolve to an Employee that is employmentStatus=ACTIVE and in the same branch as this transaction.",
                },
                paymentMethod: { type: "string", enum: ["CASH", "QRIS"] },
                discountAmount: { type: "number", minimum: 0, default: 0 },
                serviceHourType: {
                  type: "string",
                  enum: ["REGULAR", "OVERTIME"],
                  default: "REGULAR",
                  description:
                    "Stored for reporting only — does not affect pricing.",
                },
              },
              required: ["employeeId", "paymentMethod"],
            },
          },
        },
      },
      responses: {
        "201": {
          description: "Transaction created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", enum: [true] },
                  data: {
                    type: "object",
                    properties: {
                      transaction: { $ref: "#/components/schemas/Transaction" },
                      payment: {
                        oneOf: [
                          { $ref: "#/components/schemas/Payment" },
                          { type: "null" },
                        ],
                      },
                      paymentError: {
                        type: "string",
                        nullable: true,
                        description:
                          "Set only if paymentMethod=QRIS and the Midtrans charge call failed.",
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
        "402": {
          $ref: "#/components/responses/SubscriptionRequiredAgentExempt",
        },
        "403": { description: "Not AGENT" },
        "422": {
          description:
            "Agent has no assigned branch, branch inactive, a requested category document unavailable, employee unavailable, or customer unavailable",
        },
      },
    },
  },
  "/api/v1/transactions/{id}": {
    get: {
      tags: ["Transactions"],
      operationId: "getTransaction",
      summary:
        "Get transaction detail (HOST, or the AGENT whose branch owns it)",
      parameters: [idParam],
      responses: {
        "200": {
          description: "Transaction detail",
          content: transactionResponse,
        },
        "401": { description: "Not authenticated" },
        "402": {
          $ref: "#/components/responses/SubscriptionRequiredAgentExempt",
        },
        "403": { description: "AGENT from a different branch" },
        "404": { description: "Transaction not found" },
      },
    },
  },
  "/api/v1/transactions/{id}/complete": {
    post: {
      tags: ["Transactions"],
      operationId: "completeTransaction",
      summary: "Mark a transaction's service as completed (AGENT only)",
      description:
        "No payment-status gate — completion is a service-lifecycle action, independent of QRIS settlement.",
      parameters: [idParam],
      responses: {
        "200": {
          description: "Transaction completed",
          content: transactionResponse,
        },
        "401": { description: "Not authenticated" },
        "402": {
          $ref: "#/components/responses/SubscriptionRequiredAgentExempt",
        },
        "403": { description: "Not AGENT, or different branch" },
        "404": { description: "Transaction not found" },
        "409": { description: "Transaction is already CANCELLED or COMPLETED" },
      },
    },
  },
  "/api/v1/transactions/{id}/cancel": {
    post: {
      tags: ["Transactions"],
      operationId: "cancelTransaction",
      summary: "Cancel a transaction (HOST/AGENT)",
      description:
        "Never touches paymentStatus and never triggers a refund — refunding an already-paid cancelled transaction is a manual/future process.",
      parameters: [idParam],
      responses: {
        "200": {
          description: "Transaction cancelled",
          content: transactionResponse,
        },
        "401": { description: "Not authenticated" },
        "402": {
          $ref: "#/components/responses/SubscriptionRequiredAgentExempt",
        },
        "403": { description: "Different branch" },
        "404": { description: "Transaction not found" },
        "409": { description: "Transaction is already CANCELLED or COMPLETED" },
      },
    },
  },
  "/api/v1/transactions/{id}/receipt": {
    get: {
      tags: ["Transactions"],
      operationId: "getTransactionReceipt",
      summary:
        "Get a transaction's receipt data (HOST/AGENT) — increments printCount as a side effect",
      description:
        "branch is populated with { name, branchCode, address, phone } here (richer than other transaction endpoints, which only populate branch name).",
      parameters: [idParam],
      responses: {
        "200": { description: "Receipt data", content: transactionResponse },
        "401": { description: "Not authenticated" },
        "402": {
          $ref: "#/components/responses/SubscriptionRequiredAgentExempt",
        },
        "403": { description: "Different branch" },
        "404": { description: "Transaction not found" },
      },
    },
  },
  "/api/v1/transactions/{id}/change-requests": {
    post: {
      tags: ["Approvals"],
      operationId: "submitChangeRequest",
      summary: "Submit a change request against a transaction (HOST/AGENT)",
      description:
        "Only haircutId/shavingId/treatmentId/colouringId/chemicalId, customerId, discountAmount, and serviceHourType can be requested — paymentMethod and status fields are deliberately excluded. Each category id sets/changes that one category on the transaction; categories not mentioned are left untouched. Only one PENDING request is allowed per transaction at a time.",
      parameters: [idParam],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                reason: { type: "string", minLength: 1, maxLength: 1000 },
                requestedChanges: {
                  type: "object",
                  description: "At least one key is required.",
                  properties: {
                    haircutId: { type: "string" },
                    shavingId: { type: "string" },
                    treatmentId: { type: "string" },
                    colouringId: { type: "string" },
                    chemicalId: { type: "string" },
                    customerId: { type: "string", nullable: true },
                    discountAmount: { type: "number", minimum: 0 },
                    serviceHourType: {
                      type: "string",
                      enum: ["REGULAR", "OVERTIME"],
                    },
                  },
                },
              },
              required: ["reason", "requestedChanges"],
            },
          },
        },
      },
      responses: {
        "201": {
          description: "Request submitted",
          content: transactionResponse,
        },
        "400": { description: "Validation error" },
        "401": { description: "Not authenticated" },
        "402": { $ref: "#/components/responses/SubscriptionRequired" },
        "403": { description: "Different branch" },
        "404": { description: "Transaction not found" },
        "409": {
          description:
            "Transaction is CANCELLED, or a PENDING change request already exists",
        },
        "422": {
          description: "Requested category document/customer is not available",
        },
      },
    },
  },
};

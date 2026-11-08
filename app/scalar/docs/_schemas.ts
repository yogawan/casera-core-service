// @/app/scalar/docs/_schemas.ts
export const securitySchemes = {
  sessionCookie: {
    type: "apiKey",
    in: "cookie",
    name: "grooma_session",
    description: "HttpOnly session cookie set by POST /api/v1/auth/login.",
  },
  cronSecret: {
    type: "http",
    scheme: "bearer",
    description:
      "Static INTERNAL_CRON_SECRET value, for the billing-cycle cron job only — not a user session.",
  },
};

// requireAuth (lib/authorization.ts) enforces this by default on every
// endpoint. Which of the two shapes below applies is decided by that
// endpoint's `subscriptionPolicy` (§23.4.1): ENFORCED -> SubscriptionRequired,
// EXEMPT_AGENT -> SubscriptionRequiredAgentExempt. Only the handful marked
// EXEMPT_ALL there (profile, auth/me, change-password, /subscription*) never
// return 402 at all and so reference neither.
//
// These were one combined component until §23.4.1 split the behaviour by
// role; a single description can no longer state the rule correctly.
export const responses = {
  // policy: ENFORCED
  SubscriptionRequired: {
    description:
      "The HOST's subscription is PAST_DUE, EXPIRED, or CANCELLED (§23.4). Refused for BOTH roles — an AGENT is blocked here too, because this endpoint is not part of the POS flow §23.4.1 keeps open.",
  },

  // policy: EXEMPT_AGENT
  SubscriptionRequiredAgentExempt: {
    description:
      "The HOST's subscription is PAST_DUE, EXPIRED, or CANCELLED (§23.4). Returned to a HOST only — an AGENT may still call this endpoint while the subscription is lapsed, because it is part of the POS flow needed to finish serving a customer already in the chair (§23.4.1).",
  },
};

// Every success response is `{ success: true, data: <one of the schemas
// below> }` (see lib/errors.ts successResponse) — individual paths wrap
// these schemas in that envelope rather than repeating it per-operation.
export const ErrorSchema = {
  type: "object",
  properties: {
    success: { type: "boolean", enum: [false] },
    error: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description:
            "UNAUTHENTICATED | INVALID_CREDENTIALS | ACCOUNT_INACTIVE | FORBIDDEN | VALIDATION_ERROR | NOT_FOUND | CONFLICT | BUSINESS_RULE_VIOLATION | PAYMENT_REQUIRED | RATE_LIMITED | PAYMENT_GATEWAY_ERROR | INTERNAL_ERROR",
        },
        message: { type: "string" },
      },
      required: ["code", "message"],
    },
  },
  required: ["success", "error"],
};

// Most list endpoints paginate this way (transactions, inventory, stock
// movements, change requests).
export const Pagination = {
  type: "object",
  properties: {
    page: { type: "integer" },
    limit: { type: "integer" },
    total: { type: "integer" },
    totalPages: { type: "integer" },
  },
  required: ["page", "limit", "total", "totalPages"],
};

// Subscriptions and subscription invoices use `pages` instead of
// `totalPages` — a real inconsistency in the current implementation, not a
// documentation typo.
export const PaginationAlt = {
  type: "object",
  properties: {
    page: { type: "integer" },
    limit: { type: "integer" },
    total: { type: "integer" },
    pages: { type: "integer" },
  },
  required: ["page", "limit", "total", "pages"],
};

const BranchRef = {
  type: "object",
  description: "Populated branch reference.",
  properties: {
    _id: { type: "string" },
    name: { type: "string" },
  },
};

const UserRef = {
  type: "object",
  description: "Populated user reference.",
  properties: {
    _id: { type: "string" },
    name: { type: "string" },
  },
};

const CustomerRef = {
  type: "object",
  description: "Populated customer reference.",
  properties: {
    _id: { type: "string" },
    name: { type: "string" },
    phone: { type: "string", nullable: true },
  },
};

// services/branchService.ts returns the raw Mongoose document (no
// serializer), so the id key is `_id`, not `id` — unlike User/Customer below.
export const Branch = {
  type: "object",
  properties: {
    _id: { type: "string" },
    branchCode: { type: "string" },
    name: { type: "string" },
    address: { type: "string", nullable: true },
    phone: { type: "string", nullable: true },
    timezone: { type: "string", example: "Asia/Jakarta" },
    status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

// services/userService.ts runs every response through serializeUser(), which
// normalizes to `id` and nests branch as { id, name } | null — unlike most
// other entities in this file, which serialize straight from the Mongoose
// document.
export const User = {
  type: "object",
  properties: {
    id: { type: "string" },
    username: { type: "string" },
    name: { type: "string" },
    role: { type: "string", enum: ["HOST", "AGENT"] },
    branch: {
      type: "object",
      nullable: true,
      properties: {
        id: { type: "string" },
        name: { type: "string" },
      },
    },
    phone: { type: "string", nullable: true },
    status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

// PRD §5.3 (narrowed 2026-11-08): customerCode/email/gender/birthDate/
// address/notes/customerType/lastVisitAt no longer exist on the model.
// Replaced by cityFrom/age/busyness — all visible to both HOST and AGENT,
// there is no role-gated field left on Customer at all (services/
// customerService.ts's serializeCustomer() no longer branches on role).
export const Customer = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    cityFrom: { type: "string", nullable: true },
    age: { type: "integer", nullable: true, minimum: 0 },
    busyness: {
      type: "string",
      nullable: true,
      description: "Free text — descriptive, not an enum.",
    },
    phone: { type: "string", nullable: true },
    loyaltyPoints: { type: "integer" },
    isActive: { type: "boolean" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

// PRD §5.14: Service (single catalog, serviceCode/description/
// durationMinutes/isActive) is replaced by five category collections —
// Haircut, Shaving, Treatment, Colouring, Chemical. All five share this
// exact shape; only the revenueSharing defaults differ per category
// (Haircut/Shaving/Treatment 50/50, Colouring/Chemical 60/40 — still
// editable per document, not locked).
const categorySchema = {
  type: "object",
  properties: {
    _id: { type: "string" },
    name: { type: "string" },
    price: { type: "number" },
    revenueSharing: {
      type: "object",
      description: "ownerPercentage + employeePercentage always sum to 100.",
      properties: {
        ownerPercentage: { type: "number" },
        employeePercentage: { type: "number" },
      },
    },
    timestamp: { type: "string", format: "date-time" },
  },
};

export const Haircut = categorySchema;
export const Shaving = categorySchema;
export const Treatment = categorySchema;
export const Colouring = categorySchema;
export const Chemical = categorySchema;

// Shared shape for Transaction.{haircut,shaving,treatment,colouring,chemical}Snapshot
// below — deliberately excludes quantity/total (PRD §5.14: their meaning on
// the catalog documents themselves is unresolved, so nothing from them is
// copied forward into transaction history).
export const CategorySnapshot = {
  type: "object",
  nullable: true,
  description:
    "Null/absent when the corresponding category ref is unset on this transaction.",
  properties: {
    name: { type: "string" },
    price: { type: "number" },
    ownerPercentage: { type: "number" },
    employeePercentage: { type: "number" },
  },
};

export const Transaction = {
  type: "object",
  properties: {
    _id: { type: "string" },
    transactionCode: { type: "string", example: "GRM-20261014-123456" },
    branch: {
      oneOf: [{ type: "string" }, BranchRef],
      description:
        "Populated as { _id, name } on list/detail/receipt endpoints (receipt also includes branchCode, address, phone).",
    },
    agent: { oneOf: [{ type: "string" }, UserRef] },
    employee: {
      type: "string",
      description:
        "Employee ObjectId (not populated) — who performed the service, distinct from agent.",
    },
    customer: {
      oneOf: [{ type: "string" }, CustomerRef, { type: "null" }],
    },
    // PRD §5.14: Service (one required ref) is replaced by five
    // independent optional refs — a transaction fills 1 to 5 of these at
    // once (never more than one document per category), with at least one
    // required. Each *Snapshot is a point-in-time copy of
    // {name, price, ownerPercentage, employeePercentage} from the chosen
    // category document at creation time, so the transaction's own numbers
    // never drift if that catalog entry changes later.
    haircut: {
      type: "string",
      nullable: true,
      description: "Haircut ObjectId (not populated), or null if unset.",
    },
    haircutSnapshot: { $ref: "#/components/schemas/CategorySnapshot" },
    shaving: {
      type: "string",
      nullable: true,
      description: "Shaving ObjectId (not populated), or null if unset.",
    },
    shavingSnapshot: { $ref: "#/components/schemas/CategorySnapshot" },
    treatment: {
      type: "string",
      nullable: true,
      description: "Treatment ObjectId (not populated), or null if unset.",
    },
    treatmentSnapshot: { $ref: "#/components/schemas/CategorySnapshot" },
    colouring: {
      type: "string",
      nullable: true,
      description: "Colouring ObjectId (not populated), or null if unset.",
    },
    colouringSnapshot: { $ref: "#/components/schemas/CategorySnapshot" },
    chemical: {
      type: "string",
      nullable: true,
      description: "Chemical ObjectId (not populated), or null if unset.",
    },
    chemicalSnapshot: { $ref: "#/components/schemas/CategorySnapshot" },
    paymentMethod: { type: "string", enum: ["CASH", "QRIS"] },
    paymentStatus: {
      type: "string",
      enum: ["PENDING", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"],
    },
    transactionStatus: {
      type: "string",
      enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
    },
    serviceHourType: { type: "string", enum: ["REGULAR", "OVERTIME"] },
    subtotal: { type: "number" },
    discountAmount: { type: "number" },
    total: { type: "number" },
    ownerRevenue: { type: "number" },
    employeeRevenue: { type: "number" },
    pointsEarned: {
      type: "integer",
      description:
        "floor(total / 1000) — 1,000 IDR = 1 point. Set at creation regardless of paymentStatus (what this sale is worth), but only credited to the customer's loyaltyPoints once paymentStatus is/becomes PAID.",
    },
    paymentReference: { type: "string", nullable: true },
    paidAt: { type: "string", format: "date-time", nullable: true },
    completedAt: { type: "string", format: "date-time", nullable: true },
    changeRequest: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["NONE", "PENDING", "APPROVED", "REJECTED"],
        },
        requestedBy: { oneOf: [{ type: "string" }, UserRef] },
        reason: { type: "string" },
        requestedChanges: {
          type: "object",
          description:
            "Subset of haircutId/shavingId/treatmentId/colouringId/chemicalId/customerId/discountAmount/serviceHourType that was requested.",
        },
        reviewedBy: { oneOf: [{ type: "string" }, UserRef] },
        reviewNote: { type: "string" },
        requestedAt: { type: "string", format: "date-time" },
        reviewedAt: { type: "string", format: "date-time" },
      },
    },
    changeHistory: {
      type: "array",
      description: "Permanent, append-only audit log of applied changes.",
      items: {
        type: "object",
        properties: {
          changedBy: { type: "string" },
          reason: { type: "string" },
          before: { type: "object" },
          after: { type: "object" },
          changedAt: { type: "string", format: "date-time" },
          approvedBy: { type: "string" },
          approvalReference: { type: "string", nullable: true },
        },
      },
    },
    receipt: {
      type: "object",
      properties: {
        printed: { type: "boolean" },
        printedAt: { type: "string", format: "date-time", nullable: true },
        printCount: { type: "integer" },
      },
    },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

export const Payment = {
  type: "object",
  properties: {
    _id: { type: "string" },
    transaction: {
      oneOf: [
        { type: "string" },
        {
          type: "object",
          description:
            "Populated with { _id, branch, transactionCode } on GET /payments/{id}.",
          properties: {
            _id: { type: "string" },
            branch: { type: "string" },
            transactionCode: { type: "string" },
          },
        },
      ],
    },
    provider: { type: "string", enum: ["MIDTRANS"] },
    providerOrderId: { type: "string" },
    providerTransactionId: { type: "string", nullable: true },
    paymentType: { type: "string", nullable: true, example: "qris" },
    status: {
      type: "string",
      enum: ["PENDING", "PAID", "FAILED", "EXPIRED", "REFUNDED"],
    },
    grossAmount: { type: "number" },
    currency: { type: "string", example: "IDR" },
    qrCodeUrl: { type: "string", nullable: true },
    qrString: { type: "string", nullable: true },
    expiresAt: { type: "string", format: "date-time", nullable: true },
    paidAt: { type: "string", format: "date-time", nullable: true },
    lastNotificationAt: { type: "string", format: "date-time", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

export const InventoryItem = {
  type: "object",
  properties: {
    _id: { type: "string" },
    itemCode: { type: "string" },
    branch: { oneOf: [{ type: "string" }, BranchRef] },
    name: { type: "string" },
    category: {
      type: "string",
      enum: ["HAIR_PRODUCT", "EQUIPMENT", "CONSUMABLE", "OTHER"],
    },
    unit: { type: "string", example: "PCS" },
    quantity: { type: "integer" },
    unitCost: { type: "number" },
    minimumStock: { type: "integer" },
    supplier: { type: "string", nullable: true },
    isActive: { type: "boolean" },
    totalValue: {
      type: "number",
      description: "Virtual: quantity * unitCost.",
    },
    isLowStock: {
      type: "boolean",
      description: "Virtual: quantity <= minimumStock.",
    },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

export const InventoryMovement = {
  type: "object",
  properties: {
    _id: { type: "string" },
    inventory: { type: "string" },
    branch: { type: "string" },
    movementType: { type: "string", enum: ["IN", "OUT", "ADJUSTMENT"] },
    quantity: {
      type: "number",
      description:
        "Absolute delta applied — always non-negative, regardless of direction.",
    },
    previousQuantity: { type: "number" },
    newQuantity: { type: "number" },
    reason: { type: "string" },
    performedBy: {
      oneOf: [{ type: "string" }, UserRef],
      description:
        "Populated with { _id, name } on GET .../stock-movements only.",
    },
    createdAt: { type: "string", format: "date-time" },
  },
};

export const SubscriptionPlan = {
  type: "object",
  properties: {
    _id: { type: "string" },
    code: { type: "string" },
    name: { type: "string" },
    description: { type: "string", nullable: true },
    price: { type: "number" },
    currency: { type: "string", enum: ["IDR", "USD"] },
    billingCycle: { type: "string", enum: ["MONTHLY", "ANNUAL"] },
    graceDays: { type: "integer" },
    maxBranches: { type: "integer" },
    isActive: { type: "boolean" },
    updatedBy: { type: "string", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

export const Subscription = {
  type: "object",
  properties: {
    _id: { type: "string" },
    host: {
      type: "string",
      description:
        "Always the HOST's id. The populated-object form only ever came back from the platform-wide admin listing, which now lives in the admin backend.",
    },
    plan: {
      ...SubscriptionPlan,
      description:
        'Always populated — every read path calls .populate("plan").',
    },
    status: {
      type: "string",
      enum: ["ACTIVE", "PAST_DUE", "EXPIRED", "CANCELLED"],
    },
    currentPeriodStart: { type: "string", format: "date-time" },
    currentPeriodEnd: { type: "string", format: "date-time" },
    graceEndsAt: { type: "string", format: "date-time", nullable: true },
    cancelledAt: { type: "string", format: "date-time", nullable: true },
    cancelReason: { type: "string", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

export const SubscriptionInvoice = {
  type: "object",
  properties: {
    _id: { type: "string" },
    subscription: {
      oneOf: [{ type: "string" }, Subscription],
      description: "Populated only on GET /subscription/invoices/{id}.",
    },
    host: { type: "string" },
    invoiceCode: { type: "string" },
    periodStart: { type: "string", format: "date-time" },
    periodEnd: { type: "string", format: "date-time" },
    amount: { type: "number" },
    status: {
      type: "string",
      enum: ["PENDING", "PAID", "FAILED", "EXPIRED", "REFUNDED"],
    },
    dueAt: { type: "string", format: "date-time" },
    paidAt: { type: "string", format: "date-time", nullable: true },
    provider: { type: "string", enum: ["MIDTRANS"] },
    providerOrderId: { type: "string" },
    providerTransactionId: { type: "string", nullable: true },
    qrCodeUrl: { type: "string", nullable: true },
    qrString: { type: "string", nullable: true },
    expiresAt: { type: "string", format: "date-time" },
    lastNotificationAt: { type: "string", format: "date-time", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

export const schemas = {
  Error: ErrorSchema,
  Pagination,
  PaginationAlt,
  Branch,
  User,
  Customer,
  Haircut,
  Shaving,
  Treatment,
  Colouring,
  Chemical,
  CategorySnapshot,
  Transaction,
  Payment,
  InventoryItem,
  InventoryMovement,
  SubscriptionPlan,
  Subscription,
  SubscriptionInvoice,
};

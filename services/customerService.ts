// @/services/customerService.ts
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import { paginateQueries, paginationSkip, stableSort } from "@/lib/pagination";
import { escapeRegex } from "@/lib/utils";
import CustomerModel from "@/models/Customer";
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  SetCustomerStatusInput,
  UpdateCustomerInput,
} from "@/validations/customerSchema";

// Indonesian local numbers are written as 0812..., 62812..., or +62812... —
// normalize to the bare 62-prefixed form so a dedupe/search match isn't
// defeated just because someone typed it differently (§5.3).
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) {
    return `62${digits.slice(1)}`;
  }
  return digits;
}

function phoneVariants(phone: string): string[] {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return [];
  }

  const local = normalized.startsWith("62")
    ? `0${normalized.slice(2)}`
    : normalized;

  return Array.from(new Set([normalized, local, `+${normalized}`]));
}

interface CustomerLike {
  _id: { toString(): string };
  name: string;
  cityFrom?: string | null;
  age?: number | null;
  busyness?: string | null;
  phone?: string | null;
  loyaltyPoints: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// PRD §5.3 (2026-11-08): cityFrom/age/busyness are visible to both HOST and
// AGENT — unlike the email/gender/birthDate/address/notes fields they
// replaced, none of the three were judged sensitive enough to restrict.
// There is currently no role-gated field left on Customer at all.
function serializeCustomer(customer: CustomerLike) {
  return {
    id: customer._id.toString(),
    name: customer.name,
    cityFrom: customer.cityFrom ?? null,
    age: customer.age ?? null,
    busyness: customer.busyness ?? null,
    phone: customer.phone ?? null,
    loyaltyPoints: customer.loyaltyPoints,
    isActive: customer.isActive,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

export async function createCustomer(input: CreateCustomerInput) {
  await connectDB();

  if (input.phone) {
    const variants = phoneVariants(input.phone);
    const existing = await CustomerModel.findOne({ phone: { $in: variants } });
    if (existing) {
      // Don't let formatting differences spawn a duplicate customer record.
      return serializeCustomer(existing);
    }
  }

  const customer = await CustomerModel.create(input);
  return serializeCustomer(customer);
}

export async function listCustomers(query: ListCustomersQuery) {
  await connectDB();

  const filter: Record<string, unknown> = {};
  if (query.search) {
    const orConditions: Record<string, unknown>[] = [
      { name: { $regex: escapeRegex(query.search), $options: "i" } },
    ];

    const variants = phoneVariants(query.search);
    if (variants.length > 0) {
      orConditions.push({ phone: { $in: variants } });
    }

    filter.$or = orConditions;
  }

  // serializeCustomer runs after pagination, on the page's rows only — no
  // reason to hydrate the whole collection to slice 20 out of it.
  const { items, pagination } = await paginateQueries(
    CustomerModel.find(filter)
      .sort(stableSort({ name: 1 }))
      .skip(paginationSkip(query))
      .limit(query.limit),
    CustomerModel.countDocuments(filter),
    query,
  );

  return {
    items: items.map((customer) => serializeCustomer(customer)),
    pagination,
  };
}

export async function getCustomerById(id: string) {
  await connectDB();
  const customer = await CustomerModel.findById(id);

  if (!customer) {
    throw Errors.notFound("Customer not found.");
  }

  return serializeCustomer(customer);
}

export async function updateCustomer(id: string, input: UpdateCustomerInput) {
  await connectDB();
  const customer = await CustomerModel.findById(id);

  if (!customer) {
    throw Errors.notFound("Customer not found.");
  }

  if (input.name !== undefined) customer.name = input.name;
  if (input.cityFrom !== undefined) customer.cityFrom = input.cityFrom;
  if (input.age !== undefined) customer.age = input.age;
  if (input.busyness !== undefined) customer.busyness = input.busyness;
  if (input.phone !== undefined) customer.phone = input.phone;

  await customer.save();
  return serializeCustomer(customer);
}

// $inc is atomic — safe under concurrent credits/reversals for the same
// customer without a read-modify-write race. Shared by creditLoyaltyPoints
// and reverseLoyaltyPoints below so the two never drift into
// independently-maintained copies of the same one-line update.
async function adjustLoyaltyPoints(
  customerId: unknown,
  delta: number,
): Promise<void> {
  if (delta === 0) {
    return;
  }

  await connectDB();
  await CustomerModel.updateOne(
    { _id: customerId },
    { $inc: { loyaltyPoints: delta } },
  );
}

// Called from transactionService/paymentService exactly once per
// transaction, right when its paymentStatus is/becomes PAID (§5.3: points
// only change through the transaction mechanism, never a direct profile
// edit). A missing/inactive customer is silently skipped rather than
// throwing: the sale itself already succeeded, and a points side-effect
// failing must never make that look like an error to the agent who made
// the sale.
export async function creditLoyaltyPoints(
  customerId: unknown,
  points: number,
): Promise<void> {
  if (points <= 0) {
    return;
  }
  await adjustLoyaltyPoints(customerId, points);
}

// The reversal counterpart, called from cancelTransaction when a
// transaction that had already earned points gets cancelled (§5.3). Takes
// the same non-negative "how many points to take away" shape as
// creditLoyaltyPoints so call sites never need to remember to negate —
// this function owns the sign.
export async function reverseLoyaltyPoints(
  customerId: unknown,
  points: number,
): Promise<void> {
  if (points <= 0) {
    return;
  }
  await adjustLoyaltyPoints(customerId, -points);
}

export async function setCustomerStatus(
  id: string,
  input: SetCustomerStatusInput,
) {
  await connectDB();
  const customer = await CustomerModel.findById(id);

  if (!customer) {
    throw Errors.notFound("Customer not found.");
  }

  customer.isActive = input.isActive;
  await customer.save();

  return serializeCustomer(customer);
}

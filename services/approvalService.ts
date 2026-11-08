// @/services/approvalService.ts
import type { SessionUser } from "@/lib/auth";
import { requireBranchAccess } from "@/lib/authorization";
import { Errors } from "@/lib/errors";
import { connectDB } from "@/lib/mongodb";
import { paginateQueries, paginationSkip, stableSort } from "@/lib/pagination";
import {
  computeMultiCategoryPricing,
  computeServicePricing,
  extractRefId,
} from "@/lib/utils";
import ChemicalModel from "@/models/Chemical";
import ColouringModel from "@/models/Colouring";
import CustomerModel from "@/models/Customer";
import HaircutModel from "@/models/Haircut";
import ShavingModel from "@/models/Shaving";
import TransactionModel from "@/models/Transaction";
import TreatmentModel from "@/models/Treatment";
import type {
  ApproveChangeRequestInput,
  ListChangeRequestsQuery,
  RejectChangeRequestInput,
  SubmitChangeRequestInput,
} from "@/validations/approvalSchema";

interface RequestedChanges {
  haircutId?: string;
  shavingId?: string;
  treatmentId?: string;
  colouringId?: string;
  chemicalId?: string;
  customerId?: string | null;
  discountAmount?: number;
  serviceHourType?: "REGULAR" | "OVERTIME";
}

interface PricedCategoryDoc {
  _id: unknown;
  name: string;
  price: number;
  revenueSharing: { ownerPercentage: number; employeePercentage: number };
}

export async function submitChangeRequest(
  user: SessionUser,
  transactionId: string,
  input: SubmitChangeRequestInput,
) {
  await connectDB();

  const transaction = await TransactionModel.findById(transactionId);
  if (!transaction) {
    throw Errors.notFound("Transaction not found.");
  }

  requireBranchAccess(user, extractRefId(transaction.branch));

  if (transaction.transactionStatus === "CANCELLED") {
    throw Errors.conflict("Cannot request changes on a cancelled transaction.");
  }

  // §5.8: only one ACTIVE (pending) request at a time — a transaction
  // whose previous request was already approved/rejected can take a new
  // one, since that request is no longer "active".
  if (transaction.changeRequest.status === "PENDING") {
    throw Errors.conflict(
      "A pending change request already exists for this transaction.",
    );
  }

  const changes = input.requestedChanges as RequestedChanges;

  // Fail fast at submission time even though approval re-validates again
  // later — state can still drift between submission and review (§10.1
  // step 9), but there's no reason to let an obviously-bad request sit in
  // the queue untouched.
  if (changes.haircutId) {
    const haircut = await HaircutModel.findById(changes.haircutId);
    if (!haircut) {
      throw Errors.businessRule("Requested haircut is not available.");
    }
  }
  if (changes.shavingId) {
    const shaving = await ShavingModel.findById(changes.shavingId);
    if (!shaving) {
      throw Errors.businessRule("Requested shaving is not available.");
    }
  }
  if (changes.treatmentId) {
    const treatment = await TreatmentModel.findById(changes.treatmentId);
    if (!treatment) {
      throw Errors.businessRule("Requested treatment is not available.");
    }
  }
  if (changes.colouringId) {
    const colouring = await ColouringModel.findById(changes.colouringId);
    if (!colouring) {
      throw Errors.businessRule("Requested colouring is not available.");
    }
  }
  if (changes.chemicalId) {
    const chemical = await ChemicalModel.findById(changes.chemicalId);
    if (!chemical) {
      throw Errors.businessRule("Requested chemical is not available.");
    }
  }
  if (changes.customerId) {
    const customer = await CustomerModel.findById(changes.customerId);
    if (!customer || !customer.isActive) {
      throw Errors.businessRule("Requested customer is not available.");
    }
  }

  // Full replacement (not field-by-field mutation) so a prior request's
  // leftover reviewedBy/reviewNote/reviewedAt never lingers into this one.
  transaction.changeRequest = {
    status: "PENDING",
    requestedBy: user.id,
    reason: input.reason,
    requestedChanges: changes,
    requestedAt: new Date(),
  };

  await transaction.save();
  return transaction;
}

export async function listPendingChangeRequests(
  query: ListChangeRequestsQuery,
) {
  await connectDB();

  const filter = { "changeRequest.status": "PENDING" };

  return paginateQueries(
    TransactionModel.find(filter)
      .sort(stableSort({ "changeRequest.requestedAt": -1 }))
      .skip(paginationSkip(query))
      .limit(query.limit)
      .populate("branch", "name")
      .populate("agent", "name")
      .populate("changeRequest.requestedBy", "name"),
    TransactionModel.countDocuments(filter),
    query,
  );
}

// §7.9: HOST can view any request's detail; an AGENT may only view one
// they submitted themselves (the "id" here is the transaction's id — a
// change request has no collection/id of its own, §5.8's MVP design).
export async function getChangeRequestById(
  user: SessionUser,
  transactionId: string,
) {
  await connectDB();

  const transaction = await TransactionModel.findById(transactionId)
    .populate("branch", "name")
    .populate("agent", "name")
    .populate("changeRequest.requestedBy", "name")
    .populate("changeRequest.reviewedBy", "name");

  if (!transaction || transaction.changeRequest.status === "NONE") {
    throw Errors.notFound("No change request exists for this transaction.");
  }

  const isRequester =
    extractRefId(transaction.changeRequest.requestedBy) === user.id;
  if (user.role !== "HOST" && !isRequester) {
    throw Errors.forbidden();
  }

  return transaction;
}

export async function approveChangeRequest(
  user: SessionUser,
  transactionId: string,
  input: ApproveChangeRequestInput,
) {
  await connectDB();

  const transaction = await TransactionModel.findById(transactionId);
  if (!transaction) {
    throw Errors.notFound("Transaction not found.");
  }

  const { changeRequest } = transaction;

  if (changeRequest.status !== "PENDING") {
    throw Errors.conflict("This change request is not pending.");
  }

  // §10.2: requester cannot approve their own request.
  if (extractRefId(changeRequest.requestedBy) === user.id) {
    throw Errors.forbidden("Cannot approve your own change request.");
  }

  const changes = changeRequest.requestedChanges as RequestedChanges;
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  // §10.1 step 9: re-validate against current state, not whatever was
  // true at submission time. PRD §5.14: serviceId is replaced by five
  // independent category refs — each is either (a) being changed to a
  // newly-requested doc (re-fetched + re-validated here, never trusted
  // from the original submission), or (b) left as-is, in which case its
  // CURRENT catalog doc is still re-fetched live (not the frozen
  // *Snapshot) so a category that went missing between submission and
  // review is also caught. Any category change, or a discountAmount
  // change alone, triggers a full recompute of all five financial fields
  // from the resulting set of categories.
  const categoryChangeRequested =
    changes.haircutId !== undefined ||
    changes.shavingId !== undefined ||
    changes.treatmentId !== undefined ||
    changes.colouringId !== undefined ||
    changes.chemicalId !== undefined;

  if (categoryChangeRequested || changes.discountAmount !== undefined) {
    const resolved: PricedCategoryDoc[] = [];

    if (changes.haircutId !== undefined) {
      const haircut = await HaircutModel.findById(changes.haircutId);
      if (!haircut) {
        throw Errors.businessRule("Requested haircut is no longer available.");
      }
      before.haircut = transaction.haircut;
      before.haircutSnapshot = transaction.haircutSnapshot;
      transaction.haircut = haircut._id;
      transaction.haircutSnapshot = {
        name: haircut.name,
        price: haircut.price,
        ownerPercentage: haircut.revenueSharing.ownerPercentage,
        employeePercentage: haircut.revenueSharing.employeePercentage,
      };
      after.haircut = haircut._id;
      after.haircutSnapshot = transaction.haircutSnapshot;
      resolved.push(haircut);
    } else if (transaction.haircut) {
      const haircut = await HaircutModel.findById(transaction.haircut);
      if (!haircut) {
        throw Errors.businessRule(
          "Transaction's current haircut is no longer available.",
        );
      }
      resolved.push(haircut);
    }

    if (changes.shavingId !== undefined) {
      const shaving = await ShavingModel.findById(changes.shavingId);
      if (!shaving) {
        throw Errors.businessRule("Requested shaving is no longer available.");
      }
      before.shaving = transaction.shaving;
      before.shavingSnapshot = transaction.shavingSnapshot;
      transaction.shaving = shaving._id;
      transaction.shavingSnapshot = {
        name: shaving.name,
        price: shaving.price,
        ownerPercentage: shaving.revenueSharing.ownerPercentage,
        employeePercentage: shaving.revenueSharing.employeePercentage,
      };
      after.shaving = shaving._id;
      after.shavingSnapshot = transaction.shavingSnapshot;
      resolved.push(shaving);
    } else if (transaction.shaving) {
      const shaving = await ShavingModel.findById(transaction.shaving);
      if (!shaving) {
        throw Errors.businessRule(
          "Transaction's current shaving is no longer available.",
        );
      }
      resolved.push(shaving);
    }

    if (changes.treatmentId !== undefined) {
      const treatment = await TreatmentModel.findById(changes.treatmentId);
      if (!treatment) {
        throw Errors.businessRule(
          "Requested treatment is no longer available.",
        );
      }
      before.treatment = transaction.treatment;
      before.treatmentSnapshot = transaction.treatmentSnapshot;
      transaction.treatment = treatment._id;
      transaction.treatmentSnapshot = {
        name: treatment.name,
        price: treatment.price,
        ownerPercentage: treatment.revenueSharing.ownerPercentage,
        employeePercentage: treatment.revenueSharing.employeePercentage,
      };
      after.treatment = treatment._id;
      after.treatmentSnapshot = transaction.treatmentSnapshot;
      resolved.push(treatment);
    } else if (transaction.treatment) {
      const treatment = await TreatmentModel.findById(transaction.treatment);
      if (!treatment) {
        throw Errors.businessRule(
          "Transaction's current treatment is no longer available.",
        );
      }
      resolved.push(treatment);
    }

    if (changes.colouringId !== undefined) {
      const colouring = await ColouringModel.findById(changes.colouringId);
      if (!colouring) {
        throw Errors.businessRule(
          "Requested colouring is no longer available.",
        );
      }
      before.colouring = transaction.colouring;
      before.colouringSnapshot = transaction.colouringSnapshot;
      transaction.colouring = colouring._id;
      transaction.colouringSnapshot = {
        name: colouring.name,
        price: colouring.price,
        ownerPercentage: colouring.revenueSharing.ownerPercentage,
        employeePercentage: colouring.revenueSharing.employeePercentage,
      };
      after.colouring = colouring._id;
      after.colouringSnapshot = transaction.colouringSnapshot;
      resolved.push(colouring);
    } else if (transaction.colouring) {
      const colouring = await ColouringModel.findById(transaction.colouring);
      if (!colouring) {
        throw Errors.businessRule(
          "Transaction's current colouring is no longer available.",
        );
      }
      resolved.push(colouring);
    }

    if (changes.chemicalId !== undefined) {
      const chemical = await ChemicalModel.findById(changes.chemicalId);
      if (!chemical) {
        throw Errors.businessRule("Requested chemical is no longer available.");
      }
      before.chemical = transaction.chemical;
      before.chemicalSnapshot = transaction.chemicalSnapshot;
      transaction.chemical = chemical._id;
      transaction.chemicalSnapshot = {
        name: chemical.name,
        price: chemical.price,
        ownerPercentage: chemical.revenueSharing.ownerPercentage,
        employeePercentage: chemical.revenueSharing.employeePercentage,
      };
      after.chemical = chemical._id;
      after.chemicalSnapshot = transaction.chemicalSnapshot;
      resolved.push(chemical);
    } else if (transaction.chemical) {
      const chemical = await ChemicalModel.findById(transaction.chemical);
      if (!chemical) {
        throw Errors.businessRule(
          "Transaction's current chemical is no longer available.",
        );
      }
      resolved.push(chemical);
    }

    // §5.14 (confirmed 2026-11-08): same rule as createTransaction — exactly
    // one resulting category keeps the original single-service formula;
    // more than one switches to the gross-per-category formula where
    // discount only reduces `total`, never ownerRevenue/employeeRevenue.
    const effectiveDiscount =
      changes.discountAmount ?? transaction.discountAmount;
    const pricing =
      resolved.length === 1
        ? computeServicePricing(resolved[0], effectiveDiscount)
        : computeMultiCategoryPricing(resolved, effectiveDiscount);

    before.subtotal = transaction.subtotal;
    before.discountAmount = transaction.discountAmount;
    before.total = transaction.total;
    before.ownerRevenue = transaction.ownerRevenue;
    before.employeeRevenue = transaction.employeeRevenue;

    transaction.subtotal = pricing.subtotal;
    transaction.discountAmount = effectiveDiscount;
    transaction.total = pricing.total;
    transaction.ownerRevenue = pricing.ownerRevenue;
    transaction.employeeRevenue = pricing.employeeRevenue;

    after.subtotal = pricing.subtotal;
    after.discountAmount = effectiveDiscount;
    after.total = pricing.total;
    after.ownerRevenue = pricing.ownerRevenue;
    after.employeeRevenue = pricing.employeeRevenue;
  }

  if (changes.customerId !== undefined) {
    before.customer = transaction.customer;

    if (changes.customerId === null) {
      transaction.customer = null;
    } else {
      const customer = await CustomerModel.findById(changes.customerId);
      if (!customer || !customer.isActive) {
        throw Errors.businessRule("Requested customer is no longer available.");
      }
      transaction.customer = customer._id;
    }

    after.customer = transaction.customer;
  }

  if (changes.serviceHourType !== undefined) {
    before.serviceHourType = transaction.serviceHourType;
    transaction.serviceHourType = changes.serviceHourType;
    after.serviceHourType = changes.serviceHourType;
  }

  // §10.3: permanent, append-only audit record of what was actually
  // applied — separate from changeRequest, which only ever holds the
  // current/latest request's lifecycle state.
  transaction.changeHistory.push({
    changedBy: changeRequest.requestedBy,
    reason: changeRequest.reason,
    before,
    after,
    changedAt: new Date(),
    approvedBy: user.id,
    approvalReference: input.approvalReference,
  });

  transaction.changeRequest.status = "APPROVED";
  transaction.changeRequest.reviewedBy = user.id;
  transaction.changeRequest.reviewNote = input.reviewNote;
  transaction.changeRequest.reviewedAt = new Date();

  await transaction.save();
  return transaction;
}

export async function rejectChangeRequest(
  user: SessionUser,
  transactionId: string,
  input: RejectChangeRequestInput,
) {
  await connectDB();

  const transaction = await TransactionModel.findById(transactionId);
  if (!transaction) {
    throw Errors.notFound("Transaction not found.");
  }

  if (transaction.changeRequest.status !== "PENDING") {
    throw Errors.conflict("This change request is not pending.");
  }

  // §10.1 step 11: transaction stays untouched, only the request record
  // changes — no changeHistory entry, since nothing was applied.
  transaction.changeRequest.status = "REJECTED";
  transaction.changeRequest.reviewedBy = user.id;
  transaction.changeRequest.reviewNote = input.reviewNote;
  transaction.changeRequest.reviewedAt = new Date();

  await transaction.save();
  return transaction;
}

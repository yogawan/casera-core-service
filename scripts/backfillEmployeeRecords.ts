// @/scripts/backfillEmployeeRecords.ts
//
// PLAN-GROOMA.md Phase 10 blocking prerequisite: models/Transaction.ts's
// `employee` field is now `required: true` (ref Employee), but zero
// Employee records exist yet — models/Employee.ts was added as an empty
// scaffold on 2026-10-15 and has never been written to. Without running
// this first, every existing AGENT would be unable to create any new
// transaction, since there would be no Employee for them (or anyone else)
// to be selected as.
//
// Creates exactly one Employee per existing User with role "AGENT" that
// doesn't already have one (matched by the unique `user` field) — additive
// and idempotent, re-running only tops up accounts that still have none.
//
// employmentStatus is inferred from User.status since there is no better
// signal available at backfill time: ACTIVE users become employmentStatus
// ACTIVE, INACTIVE users become RESIGNED (PRD §5.13 names RESIGNED as the
// usual pairing for a deactivated account) rather than defaulting everyone
// to ACTIVE — that would let a deactivated AGENT still be selected as the
// `employee` on someone else's sale and wrongly credited employeeRevenue.
// joinedAt uses the User's own createdAt as the closest available proxy —
// there is no separate hire-date field anywhere today.
//
// branch is copied from User.branch, required for AGENT by the existing
// pre("validate") hook on models/User.ts, so it is expected to always be
// present here; a legacy row missing it is skipped and logged rather than
// failing the whole run.
//
// Usage (reads .env.local automatically):
//   npm run backfill:employees

import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import EmployeeModel from "@/models/Employee";
import UserModel from "@/models/User";

export async function backfillEmployeeRecords(): Promise<void> {
  await connectDB();

  const agents = await UserModel.find({ role: "AGENT" }).select(
    "branch status createdAt",
  );

  if (agents.length === 0) {
    console.log("No AGENT users found. Nothing to backfill.");
    return;
  }

  let created = 0;
  let skippedExisting = 0;
  let skippedNoBranch = 0;

  for (const agent of agents) {
    const existing = await EmployeeModel.findOne({ user: agent._id });
    if (existing) {
      skippedExisting += 1;
      continue;
    }

    if (!agent.branch) {
      console.warn(
        `Skipped User ${agent._id}: role AGENT but no branch assigned, cannot backfill Employee.`,
      );
      skippedNoBranch += 1;
      continue;
    }

    const employmentStatus =
      agent.status === "INACTIVE" ? "RESIGNED" : "ACTIVE";

    const employee = await EmployeeModel.create({
      user: agent._id,
      branch: agent.branch,
      employmentStatus,
      joinedAt: agent.createdAt,
    });

    created += 1;
    console.log(
      `Created Employee ${employee._id} for User ${agent._id} (employmentStatus: ${employmentStatus}).`,
    );
  }

  console.log(
    `Done. Created ${created} Employee record(s), skipped ${skippedExisting} (already had one), ` +
      `skipped ${skippedNoBranch} (no branch assigned) — ${agents.length} AGENT user(s) considered.`,
  );
}

backfillEmployeeRecords()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(
      "Backfill failed:",
      error instanceof Error ? error.message : String(error),
    );
    await mongoose.disconnect();
    process.exit(1);
  });

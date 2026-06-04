"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/session";
import type { JobStatus } from "@prisma/client";

/**
 * Confirms the current user is a technician (EMPLOYEE or ADMIN) AND is the
 * assigned technician for the given job. Returns the job or throws.
 * This prevents IDOR — an employee changing a job id to one not theirs is denied.
 */
async function requireOwnedJob(jobId: string) {
  const user = await assertRole("EMPLOYEE", "ADMIN");
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, technicianId: true, status: true },
  });
  // Employees may only touch jobs assigned to them. Admins may touch any.
  if (!job) throw new Error("Not found");
  if (user.role === "EMPLOYEE" && job.technicianId !== user.id) {
    throw new Error("Not found");
  }
  return { user, job };
}

const VALID: JobStatus[] = ["SCHEDULED", "IN_PROGRESS", "COMPLETED"];

export async function updateJobStatus(formData: FormData) {
  const jobId = String(formData.get("jobId"));
  const status = String(formData.get("status")) as JobStatus;
  const summary = String(formData.get("summary") || "").trim();

  const { job } = await requireOwnedJob(jobId);
  if (!VALID.includes(status)) throw new Error("Invalid status");
  // Cannot move a cancelled job from here (admin reinstates).
  if (job.status === "CANCELLED") throw new Error("Job is cancelled");

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status,
      ...(status === "COMPLETED" && summary ? { summary } : {}),
    },
  });

  revalidatePath(`/portal/employee/jobs/${jobId}`);
  revalidatePath("/portal/employee");
  revalidatePath("/portal/admin/schedule");
}

export async function addJobNote(formData: FormData) {
  const jobId = String(formData.get("jobId"));
  const body = String(formData.get("body") || "").trim();
  if (!body) throw new Error("Note cannot be empty");

  const { user } = await requireOwnedJob(jobId);

  await prisma.jobNote.create({
    data: { jobId, authorId: user.id, body },
  });

  revalidatePath(`/portal/employee/jobs/${jobId}`);
  revalidatePath("/portal/admin/schedule");
}

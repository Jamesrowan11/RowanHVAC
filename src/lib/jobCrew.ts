import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * A job's crew: one or more technicians (JobTechnician). Everyone on the crew
 * can see and work the job in the portal and on their van, and they share one
 * service ticket.
 */

/** Prisma filter: jobs this person is on. */
export function onCrew(userId: string): Prisma.JobWhereInput {
  return { technicians: { some: { userId } } };
}

export async function isOnCrew(jobId: string, userId: string): Promise<boolean> {
  const row = await prisma.jobTechnician.findUnique({
    where: { jobId_userId: { jobId, userId } },
    select: { userId: true },
  });
  return Boolean(row);
}

/** Include for a job's crew, in the order the office listed them. */
export const crewInclude = {
  technicians: {
    orderBy: { position: "asc" },
    include: { user: { select: { id: true, name: true, role: true } } },
  },
} satisfies Prisma.JobInclude;

export type CrewMember = { user: { id: string; name: string; role: string } };

export function crewNames(crew: CrewMember[]): string[] {
  return crew.map((c) => c.user.name);
}

/** "Jake Miller, Dean Carter" or the fallback when no one is assigned. */
export function crewLabel(crew: CrewMember[], none = "Unassigned"): string {
  return crew.length ? crewNames(crew).join(", ") : none;
}

/** Keeps only active employees/admins, in the given order, without repeats. */
export async function validTechnicianIds(ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const ok = await prisma.user.findMany({
    where: { id: { in: unique }, active: true, role: { in: ["EMPLOYEE", "ADMIN"] } },
    select: { id: true },
  });
  const allowed = new Set(ok.map((u) => u.id));
  return unique.filter((id) => allowed.has(id));
}

/** Replaces a job's crew. Runs inside the caller's transaction when given one. */
export async function setCrew(jobId: string, technicianIds: string[], tx: Prisma.TransactionClient = prisma) {
  await tx.jobTechnician.deleteMany({ where: { jobId } });
  if (technicianIds.length) {
    await tx.jobTechnician.createMany({
      data: technicianIds.map((userId, position) => ({ jobId, userId, position })),
    });
  }
}

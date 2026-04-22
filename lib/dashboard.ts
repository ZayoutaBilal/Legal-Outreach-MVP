import { prisma } from "@/lib/db";

const PROCESSING_PREFIX = "processing::";

export async function getDashboardData(status?: string) {
  const whereClause =
    status && ["pending", "sent", "failed"].includes(status)
      ? { status: status as "pending" | "sent" | "failed" }
      : {};

  const [totalContacts, sentCount, pendingCount, failedCount, logs, avocats] = await Promise.all([
    prisma.avocat.count(),
    prisma.outreachLog.count({ where: { status: "sent" } }),
    prisma.outreachLog.count({ where: { status: "pending" } }),
    prisma.outreachLog.count({ where: { status: "failed" } }),
    prisma.outreachLog.findMany({
      where: whereClause,
      include: {
        avocat: true,
        campaign: true
      },
      orderBy: [{ sent_at: "desc" }, { attempt_count: "desc" }],
      take: 100
    }),
    prisma.avocat.findMany({
      orderBy: [{ full_name: "asc" }, { email: "asc" }],
      take: 100
    })
  ]);

  return {
    metrics: {
      totalContacts,
      sentCount,
      pendingCount,
      failedCount
    },
    avocats: avocats.map((avocat) => ({
      id: avocat.id,
      fullName: avocat.full_name,
      email: avocat.email,
      phone: avocat.phone,
      city: avocat.city,
      firmName: avocat.firm_name,
      preferredContactMethod: avocat.preferred_contact_method
    })),
    logs: logs.map((log) => ({
      id: log.id,
      lawyerName: log.avocat.full_name,
      email: log.avocat.email,
      status: log.status,
      attempts: log.attempt_count,
      lastError:
        log.error_message?.startsWith(PROCESSING_PREFIX) ? null : log.error_message,
      sentAt: log.sent_at?.toISOString() || null,
      campaignName: log.campaign.name
    }))
  };
}

export function getProcessingPrefix() {
  return PROCESSING_PREFIX;
}

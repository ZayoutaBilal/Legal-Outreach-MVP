import { PreferredContactMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const PROCESSING_PREFIX = "processing::";

type DashboardParams = {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

function getActualChannel(preferredContactMethod: PreferredContactMethod) {
  return preferredContactMethod === PreferredContactMethod.email ? "email" : "whatsapp";
}

function getWeekKey(date: Date) {
  const workingDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = workingDate.getUTCDay() || 7;
  workingDate.setUTCDate(workingDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(workingDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((workingDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${workingDate.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function buildAvocatSearchWhere(search?: string): Prisma.AvocatWhereInput {
  if (!search?.trim()) {
    return {};
  }

  const term = search.trim();

  return {
    OR: [
      { full_name: { contains: term } },
      { email: { contains: term } },
      { phone: { contains: term } },
      { city: { contains: term } },
      { firm_name: { contains: term } }
    ]
  };
}

function buildLogWhere(status?: string, search?: string): Prisma.OutreachLogWhereInput {
  const where: Prisma.OutreachLogWhereInput = {};

  if (status && ["pending", "sent", "failed"].includes(status)) {
    where.status = status as "pending" | "sent" | "failed";
  }

  if (search?.trim()) {
    const term = search.trim();
    where.OR = [
      { avocat: { full_name: { contains: term } } },
      { avocat: { email: { contains: term } } },
      { avocat: { phone: { contains: term } } },
      { avocat: { city: { contains: term } } },
      { avocat: { firm_name: { contains: term } } },
      { campaign: { name: { contains: term } } }
    ];
  }

  return where;
}

export async function getDashboardData({
  status,
  search,
  page = 1,
  pageSize = 10
}: DashboardParams = {}) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(Math.floor(pageSize), 50) : 10;
  const avocatWhere = buildAvocatSearchWhere(search);
  const logWhere = buildLogWhere(status, search);

  const [
    totalContacts,
    totalAvocatsMatching,
    sentCount,
    pendingCount,
    failedCount,
    logs,
    avocats,
    sentLogs
  ] = await Promise.all([
    prisma.avocat.count(),
    prisma.avocat.count({ where: avocatWhere }),
    prisma.outreachLog.count({ where: { status: "sent" } }),
    prisma.outreachLog.count({ where: { status: "pending" } }),
    prisma.outreachLog.count({ where: { status: "failed" } }),
    prisma.outreachLog.findMany({
      where: logWhere,
      include: {
        avocat: true,
        campaign: true
      },
      orderBy: [{ sent_at: "desc" }, { attempt_count: "desc" }],
      take: 100
    }),
    prisma.avocat.findMany({
      where: avocatWhere,
      orderBy: [{ full_name: "asc" }, { email: "asc" }],
      skip: (safePage - 1) * safePageSize,
      take: safePageSize
    }),
    prisma.outreachLog.findMany({
      where: {
        status: "sent",
        sent_at: {
          not: null
        }
      },
      include: {
        avocat: true
      },
      orderBy: {
        sent_at: "desc"
      }
    })
  ]);

  const sentByChannel = { email: 0, whatsapp: 0 };
  const sentByHour = new Map<string, number>();
  const sentByDay = new Map<string, number>();
  const sentByWeek = new Map<string, number>();
  const sentByCity = new Map<string, number>();

  for (const log of sentLogs) {
    if (!log.sent_at) {
      continue;
    }

    const date = log.sent_at;
    const hourKey = `${String(date.getHours()).padStart(2, "0")}:00`;
    const dayKey = date.toISOString().slice(0, 10);
    const weekKey = getWeekKey(date);
    const cityKey = log.avocat.city?.trim() || "UNKNOWN";
    const channel = getActualChannel(log.avocat.preferred_contact_method);

    sentByChannel[channel] += 1;
    sentByHour.set(hourKey, (sentByHour.get(hourKey) || 0) + 1);
    sentByDay.set(dayKey, (sentByDay.get(dayKey) || 0) + 1);
    sentByWeek.set(weekKey, (sentByWeek.get(weekKey) || 0) + 1);
    sentByCity.set(cityKey, (sentByCity.get(cityKey) || 0) + 1);
  }

  const totalPages = Math.max(1, Math.ceil(totalAvocatsMatching / safePageSize));

  return {
    metrics: {
      totalContacts,
      sentCount,
      pendingCount,
      failedCount
    },
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      totalItems: totalAvocatsMatching,
      totalPages,
      search: search?.trim() || ""
    },
    analytics: {
      sentByChannel: [
        { label: "Email", key: "email", count: sentByChannel.email },
        { label: "WhatsApp", key: "whatsapp", count: sentByChannel.whatsapp }
      ],
      sentByHour: [...sentByHour.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([hour, count]) => ({ hour, count })),
      sentByDay: [...sentByDay.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 7)
        .map(([day, count]) => ({ day, count })),
      sentByWeek: [...sentByWeek.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 8)
        .map(([week, count]) => ({ week, count })),
      sentByCity: [...sentByCity.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([city, count]) => ({ city, count }))
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
      email: log.avocat.email ?? log.avocat.phone ?? "-",
      status: log.status,
      attempts: log.attempt_count,
      lastError:
        log.error_message?.startsWith(PROCESSING_PREFIX) ? null : log.error_message,
      sentAt: log.sent_at?.toISOString() || null,
      campaignName: log.campaign.name,
      city: log.avocat.city ?? "-"
    }))
  };
}

export function getProcessingPrefix() {
  return PROCESSING_PREFIX;
}

import { randomUUID } from "crypto";
import { PreferredContactMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildOutreachEmail, createTransporter } from "@/lib/email";
import { getProcessingPrefix } from "@/lib/dashboard";
import {
  backfillPendingLogsForActiveCampaign,
  ensureOutreachLogForAvocat,
  getOrCreateActiveCampaign
} from "@/lib/campaigns";
import { isValidWhatsappPhone, sendWhatsAppMessage } from "@/lib/whatsapp";

const MAX_RETRIES = 3;

type OutreachLogWithRelations = Awaited<ReturnType<typeof fetchOutreachLogById>>;

async function fetchOutreachLogById(id: string) {
  return prisma.outreachLog.findUnique({
    where: { id },
    include: {
      avocat: true,
      campaign: true
    }
  });
}

async function deliverOutreachLog(log: NonNullable<OutreachLogWithRelations>) {
  const results = {
    campaignName: log.campaign.name,
    processed: 1,
    sent: 0,
    failed: 0,
    details: [] as Array<{ id: string; email: string; status: "sent" | "failed"; message?: string }>
  };

  try {
    if (
      log.avocat.preferred_contact_method === PreferredContactMethod.whatsapp ||
      log.avocat.preferred_contact_method === PreferredContactMethod.both
    ) {
      if (!isValidWhatsappPhone(log.avocat.phone)) {
        throw new Error("Invalid WhatsApp phone number. It must start with 06 or 07.");
      }

      await sendWhatsAppMessage(log.avocat.phone, log.avocat.full_name, log.campaign.form_link);
    } else {
      if (!log.avocat.email) {
        throw new Error("Missing email address for email outreach.");
      }

      const transporter = createTransporter();
      const emailTemplate = buildOutreachEmail({
        fullName: log.avocat.full_name,
        formLink: log.campaign.form_link
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: log.avocat.email,
        subject: emailTemplate.subject,
        text: emailTemplate.text,
        html: emailTemplate.html
      });
    }

    await prisma.outreachLog.update({
      where: { id: log.id },
      data: {
        status: "sent",
        sent_at: new Date(),
        error_message: null
      }
    });

    results.sent += 1;
    results.details.push({
      id: log.id,
      email: log.avocat.email ?? log.avocat.phone ?? "-",
      status: "sent"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown outreach error.";

    await prisma.outreachLog.update({
      where: { id: log.id },
      data: {
        status: "failed",
        error_message: message,
        attempt_count: {
          increment: 1
        }
      }
    });

    results.failed += 1;
    results.details.push({
      id: log.id,
      email: log.avocat.email ?? log.avocat.phone ?? "-",
      status: "failed",
      message
    });
  }

  return results;
}

async function claimNextLog() {
  const token = `${getProcessingPrefix()}${randomUUID()}`;
  const sharedFilter = {
    OR: [{ error_message: null }, { NOT: { error_message: { startsWith: getProcessingPrefix() } } }],
    attempt_count: {
      lt: MAX_RETRIES
    }
  };

  const pendingCandidate = await prisma.outreachLog.findFirst({
    where: {
      status: "pending",
      ...sharedFilter
    },
    orderBy: [{ attempt_count: "asc" }, { id: "asc" }]
  });

  if (pendingCandidate) {
    const result = await prisma.outreachLog.updateMany({
      where: {
        id: pendingCandidate.id,
        status: "pending",
        ...sharedFilter
      },
      data: {
        error_message: token
      }
    });

    if (result.count === 1) {
      return fetchOutreachLogById(pendingCandidate.id);
    }
  }

  const failedCandidate = await prisma.outreachLog.findFirst({
    where: {
      status: "failed",
      ...sharedFilter
    },
    orderBy: [{ sent_at: "asc" }, { attempt_count: "asc" }, { id: "asc" }]
  });

  if (!failedCandidate) {
    return null;
  }

  const result = await prisma.outreachLog.updateMany({
    where: {
      id: failedCandidate.id,
      status: "failed",
      ...sharedFilter
    },
    data: {
      error_message: token
    }
  });

  return result.count === 1 ? fetchOutreachLogById(failedCandidate.id) : null;
}

export async function sendAvocatOutreach(avocatId: string) {
  const campaign = await getOrCreateActiveCampaign();

  if (!campaign) {
    throw new Error(
      "No outreach campaign found. Create one in the database or set DEFAULT_FORM_LINK in your environment."
    );
  }

  const avocat = await prisma.avocat.findUnique({
    where: { id: avocatId }
  });

  if (!avocat) {
    throw new Error("Avocat not found.");
  }

  const ensuredLog = await ensureOutreachLogForAvocat(avocatId, { forcePending: true });

  if (!ensuredLog) {
    throw new Error("Unable to prepare outreach log for this avocat.");
  }

  if (ensuredLog.attempt_count >= MAX_RETRIES) {
    throw new Error("Retry limit reached for this avocat.");
  }

  const log = await fetchOutreachLogById(ensuredLog.id);

  if (!log) {
    throw new Error("Outreach log not found.");
  }

  return deliverOutreachLog(log);
}

export async function processOutreachBatch() {
  const { campaign } = await backfillPendingLogsForActiveCampaign();

  if (!campaign) {
    throw new Error(
      "No outreach campaign found. Create one in the database or set DEFAULT_FORM_LINK in your environment."
    );
  }

  const claimedLog = await claimNextLog();
  const results = {
    campaignName: campaign.name,
    processed: claimedLog ? 1 : 0,
    sent: 0,
    failed: 0,
    details: [] as Array<{ id: string; email: string; status: "sent" | "failed"; message?: string }>
  };

  if (!claimedLog) {
    return results;
  }

  return deliverOutreachLog(claimedLog);
}

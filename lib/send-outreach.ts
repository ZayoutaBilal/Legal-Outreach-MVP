import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { buildOutreachEmail, createTransporter } from "@/lib/email";
import { getProcessingPrefix } from "@/lib/dashboard";
import { backfillPendingLogsForActiveCampaign } from "@/lib/campaigns";

const SEND_LIMIT = 10;
const SEND_DELAY_MS = 60_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function claimPendingLogs(limit: number) {
  const token = `${getProcessingPrefix()}${randomUUID()}`;
  const candidates = await prisma.outreachLog.findMany({
    where: {
      status: "pending",
      OR: [{ error_message: null }, { NOT: { error_message: { startsWith: getProcessingPrefix() } } }]
    },
    include: {
      avocat: true,
      campaign: true
    },
    orderBy: [{ attempt_count: "asc" }, { id: "asc" }],
    take: limit * 3
  });

  const claimed: typeof candidates = [];

  for (const candidate of candidates) {
    if (claimed.length >= limit) {
      break;
    }

    const result = await prisma.outreachLog.updateMany({
      where: {
        id: candidate.id,
        status: "pending",
        OR: [{ error_message: null }, { NOT: { error_message: { startsWith: getProcessingPrefix() } } }]
      },
      data: {
        error_message: token,
        attempt_count: {
          increment: 1
        }
      }
    });

    if (result.count === 1) {
      claimed.push(candidate);
    }
  }

  return claimed;
}

export async function processOutreachBatch() {
  const { campaign } = await backfillPendingLogsForActiveCampaign();

  if (!campaign) {
    throw new Error(
      "No outreach campaign found. Create one in the database or set DEFAULT_FORM_LINK in your environment."
    );
  }

  const transporter = createTransporter();
  const claimedLogs = await claimPendingLogs(SEND_LIMIT);
  const results = {
    campaignName: campaign.name,
    processed: claimedLogs.length,
    sent: 0,
    failed: 0,
    details: [] as Array<{ id: string; email: string; status: "sent" | "failed"; message?: string }>
  };

  for (let index = 0; index < claimedLogs.length; index += 1) {
    const log = claimedLogs[index];

    try {
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
        email: log.avocat.email,
        status: "sent"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown email error.";

      await prisma.outreachLog.update({
        where: { id: log.id },
        data: {
          status: "failed",
          error_message: message
        }
      });

      results.failed += 1;
      results.details.push({
        id: log.id,
        email: log.avocat.email,
        status: "failed",
        message
      });
    }

    if (index < claimedLogs.length - 1) {
      await sleep(SEND_DELAY_MS);
    }
  }

  return results;
}

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { buildOutreachEmail, createTransporter } from "@/lib/email";
import { getProcessingPrefix } from "@/lib/dashboard";
import { backfillPendingLogsForActiveCampaign } from "@/lib/campaigns";

async function claimNextLog() {
  const token = `${getProcessingPrefix()}${randomUUID()}`;
  const sharedFilter = {
    OR: [{ error_message: null }, { NOT: { error_message: { startsWith: getProcessingPrefix() } } }]
  };
  const pendingCandidate = await prisma.outreachLog.findFirst({
    where: {
      status: "pending",
      ...sharedFilter
    },
    include: {
      avocat: true,
      campaign: true
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
        error_message: token,
        attempt_count: {
          increment: 1
        }
      }
    });

    if (result.count === 1) {
      return pendingCandidate;
    }
  }

  const failedCandidate = await prisma.outreachLog.findFirst({
    where: {
      status: "failed",
      ...sharedFilter
    },
    include: {
      avocat: true,
      campaign: true
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
      error_message: token,
      attempt_count: {
        increment: 1
      }
    }
  });

  return result.count === 1 ? failedCandidate : null;
}

export async function processOutreachBatch() {
  const { campaign } = await backfillPendingLogsForActiveCampaign();

  if (!campaign) {
    throw new Error(
      "No outreach campaign found. Create one in the database or set DEFAULT_FORM_LINK in your environment."
    );
  }

  const transporter = createTransporter();
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

  try {
    const emailTemplate = buildOutreachEmail({
      fullName: claimedLog.avocat.full_name,
      formLink: claimedLog.campaign.form_link
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: claimedLog.avocat.email,
      subject: emailTemplate.subject,
      text: emailTemplate.text,
      html: emailTemplate.html
    });

    await prisma.outreachLog.update({
      where: { id: claimedLog.id },
      data: {
        status: "sent",
        sent_at: new Date(),
        error_message: null
      }
    });

    results.sent += 1;
    results.details.push({
      id: claimedLog.id,
      email: claimedLog.avocat.email,
      status: "sent"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error.";

    await prisma.outreachLog.update({
      where: { id: claimedLog.id },
      data: {
        status: "failed",
        error_message: message
      }
    });

    results.failed += 1;
    results.details.push({
      id: claimedLog.id,
      email: claimedLog.avocat.email,
      status: "failed",
      message
    });
  }

  return results;
}

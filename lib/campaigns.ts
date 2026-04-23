import { prisma } from "@/lib/db";

export async function getOrCreateActiveCampaign() {
  const existingCampaign = await prisma.outreachCampaign.findFirst({
    orderBy: {
      name: "asc"
    }
  });

  if (existingCampaign) {
    return existingCampaign;
  }

  const formLink = process.env.DEFAULT_FORM_LINK?.trim();

  if (!formLink) {
    return null;
  }

  return prisma.outreachCampaign.create({
    data: {
      name: process.env.DEFAULT_CAMPAIGN_NAME?.trim() || "Default outreach campaign",
      form_link: formLink
    }
  });
}

export async function ensureOutreachLogForAvocat(
  avocatId: string,
  options?: { forcePending?: boolean }
) {
  const campaign = await getOrCreateActiveCampaign();

  if (!campaign) {
    return null;
  }

  return prisma.outreachLog.upsert({
    where: {
      avocat_id_campaign_id: {
        avocat_id: avocatId,
        campaign_id: campaign.id
      }
    },
    create: {
      avocat_id: avocatId,
      campaign_id: campaign.id,
      status: "pending"
    },
    update: options?.forcePending
      ? {
          status: "pending",
          error_message: null,
          sent_at: null
        }
      : {}
  });
}

export async function attachAvocatToActiveCampaign(avocatId: string) {
  return ensureOutreachLogForAvocat(avocatId);
}

export async function backfillPendingLogsForActiveCampaign() {
  const campaign = await getOrCreateActiveCampaign();

  if (!campaign) {
    return {
      campaign: null,
      createdCount: 0
    };
  }

  const avocats = await prisma.avocat.findMany({
    select: {
      id: true
    }
  });

  let createdCount = 0;

  for (const avocat of avocats) {
    const existing = await prisma.outreachLog.findUnique({
      where: {
        avocat_id_campaign_id: {
          avocat_id: avocat.id,
          campaign_id: campaign.id
        }
      }
    });

    if (!existing) {
      await prisma.outreachLog.create({
        data: {
          avocat_id: avocat.id,
          campaign_id: campaign.id,
          status: "pending"
        }
      });
      createdCount += 1;
    }
  }

  return {
    campaign,
    createdCount
  };
}

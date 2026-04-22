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

export async function attachAvocatToActiveCampaign(avocatId: string) {
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
    update: {}
  });
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
    const result = await prisma.outreachLog.upsert({
      where: {
        avocat_id_campaign_id: {
          avocat_id: avocat.id,
          campaign_id: campaign.id
        }
      },
      create: {
        avocat_id: avocat.id,
        campaign_id: campaign.id,
        status: "pending"
      },
      update: {}
    });

    if (result.status === "pending" && result.attempt_count === 0 && result.error_message === null) {
      createdCount += 1;
    }
  }

  return {
    campaign,
    createdCount
  };
}

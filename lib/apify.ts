import { ApifyClient } from "apify-client";

const DEFAULT_APIFY_ACTOR_ID = "9Sk4JJhEma9vBKqrg";

function normalizeWebsiteKey(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
  }
}

function extractEmailFromDatasetItem(item: Record<string, unknown>) {
  const email = typeof item.email === "string" ? item.email.trim() : null;

  if (email) {
    return email.toLowerCase();
  }

  const candidateArrays = [item.emails, item.contactEmails, item.leadEmails];

  for (const candidate of candidateArrays) {
    if (Array.isArray(candidate)) {
      const firstEmail = candidate.find((value) => typeof value === "string" && value.includes("@"));

      if (typeof firstEmail === "string") {
        return firstEmail.trim().toLowerCase();
      }
    }
  }

  return null;
}

function extractWebsiteKeyFromDatasetItem(item: Record<string, unknown>) {
  const candidateUrls = [
    item.url,
    item.sourceUrl,
    item.originalStartUrl,
    item.originalUrl,
    item.startUrl
  ];

  for (const candidate of candidateUrls) {
    if (typeof candidate === "string" && candidate.trim()) {
      return normalizeWebsiteKey(candidate);
    }
  }

  if (typeof item.domain === "string" && item.domain.trim()) {
    return item.domain.replace(/^www\./i, "").toLowerCase();
  }

  return null;
}

export async function enrichEmailsFromWebsites(websites: string[]) {
  const token = process.env.APIFY_TOKEN;

  if (!token) {
    throw new Error("APIFY_TOKEN is missing.");
  }

  const uniqueWebsites = [...new Set(websites.filter(Boolean).map((website) => website.trim()))];

  if (!uniqueWebsites.length) {
    return new Map<string, string>();
  }

  const client = new ApifyClient({
    token
  });

  const actorId = process.env.APIFY_EMAIL_ACTOR_ID || DEFAULT_APIFY_ACTOR_ID;
  const input = {
    startUrls: uniqueWebsites.map((url) => ({ url })),
    maxRequestsPerStartUrl: 20,
    mergeContacts: true,
    maxDepth: 2,
    maxRequests: 9999999,
    sameDomain: true,
    considerChildFrames: true,
    maximumLeadsEnrichmentRecords: 0,
    leadsEnrichmentDepartments: ["sales", "marketing"],
    verifyLeadsEnrichmentEmails: false,
    scrapeSocialMediaProfiles: {
      facebooks: false,
      instagrams: false,
      youtubes: false,
      tiktoks: false,
      twitters: false
    },
    useBrowser: false,
    waitUntil: "domcontentloaded",
    proxyConfig: {
      useApifyProxy: true
    }
  };

  const run = await client.actor(actorId).call(input);
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const emailByWebsite = new Map<string, string>();

  for (const rawItem of items) {
    const item = rawItem as Record<string, unknown>;
    const websiteKey = extractWebsiteKeyFromDatasetItem(item);
    const email = extractEmailFromDatasetItem(item);

    if (websiteKey && email && !emailByWebsite.has(websiteKey)) {
      emailByWebsite.set(websiteKey, email);
    }
  }

  return emailByWebsite;
}

export function getWebsiteKey(url: string) {
  return normalizeWebsiteKey(url);
}

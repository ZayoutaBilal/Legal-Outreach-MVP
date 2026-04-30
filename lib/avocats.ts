import { PreferredContactMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { attachAvocatToActiveCampaign } from "@/lib/campaigns";
import { enrichEmailsFromWebsites, getWebsiteKey } from "@/lib/apify";

type AvocatInput = {
  full_name?: unknown;
  email?: unknown;
  phone?: unknown;
  city?: unknown;
  firm_name?: unknown;
  preferred_contact_method?: unknown;
};

type RawApifyAvocat = {
  title?: unknown;
  phone?: unknown;
  city?: unknown;
  website?: unknown;
  email?: unknown;
  reviewsCount?: unknown;
};

export type ImportMode = "standard" | "enrich-websites";

const allowedContactMethods = new Set<PreferredContactMethod>([
  PreferredContactMethod.email,
  PreferredContactMethod.whatsapp,
  PreferredContactMethod.both
]);

function sanitizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function sanitizeRequiredString(value: unknown, fieldName: string) {
  const sanitized = sanitizeOptionalString(value);

  if (!sanitized) {
    throw new Error(`${fieldName} is required.`);
  }

  return sanitized;
}

export function normalizePhone(phone: string) {
  const compactPhone = phone.replace(/\s+/g, "").replace(/-/g, "");

  if (compactPhone.startsWith("+212")) {
    return `0${compactPhone.slice(4)}`;
  }

  if (compactPhone.startsWith("212")) {
    return `0${compactPhone.slice(3)}`;
  }

  return compactPhone;
}

export function extractName(title: string) {
  return title
    .replace(/\b(avocate|avocat|lawyer|cabinet)\b/gi, " ")
    .replace(/\u0645\u062D\u0627\u0645\u064A/gi, " ")
    .replace(/[\/-]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeContactMethod(value: unknown): PreferredContactMethod {
  if (typeof value === "string" && allowedContactMethods.has(value as PreferredContactMethod)) {
    return value as PreferredContactMethod;
  }

  return PreferredContactMethod.email;
}

export function normalizeAvocatInput(input: AvocatInput) {
  const email = sanitizeOptionalString(input.email)?.toLowerCase() || null;
  const phone = sanitizeOptionalString(input.phone);
  const city = sanitizeOptionalString(input.city);

  return {
    full_name: sanitizeRequiredString(input.full_name, "full_name"),
    email,
    phone: phone ? normalizePhone(phone) : null,
    city: city ? city.toUpperCase() : null,
    firm_name: sanitizeOptionalString(input.firm_name),
    preferred_contact_method: sanitizeContactMethod(input.preferred_contact_method)
  };
}

function toPrismaAvocatData(
  data: ReturnType<typeof normalizeAvocatInput>
): Prisma.AvocatCreateInput {
  return {
    full_name: data.full_name,
    preferred_contact_method: data.preferred_contact_method,
    ...(data.email ? { email: data.email as string } : {}),
    ...(data.phone ? { phone: data.phone } : {}),
    ...(data.city ? { city: data.city } : {}),
    ...(data.firm_name ? { firm_name: data.firm_name } : {})
  };
}

function isUniqueEmailError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function findDuplicateAvocat(
  data: ReturnType<typeof normalizeAvocatInput>,
  excludeId?: string
) {
  const duplicateConditions: Prisma.AvocatWhereInput[] = [];

  if (data.phone) {
    duplicateConditions.push({ phone: data.phone });
  }

  if (data.email) {
    duplicateConditions.push({ email: data.email });
  }

  if (!duplicateConditions.length) {
    return null;
  }

  return prisma.avocat.findFirst({
    where: {
      OR: duplicateConditions,
      ...(excludeId
        ? {
            id: {
              not: excludeId
            }
          }
        : {})
    }
  });
}

export async function createAvocat(input: AvocatInput) {
  const normalizedData = normalizeAvocatInput(input);
  const existingAvocat = await findDuplicateAvocat(normalizedData);

  if (existingAvocat) {
    throw new Error("An avocat with the same phone or email already exists.");
  }

  try {
    const avocat = await prisma.avocat.create({
      data: toPrismaAvocatData(normalizedData)
    });
    await attachAvocatToActiveCampaign(avocat.id);
    return avocat;
  } catch (error) {
    if (isUniqueEmailError(error)) {
      throw new Error("An avocat with this email already exists.");
    }

    throw error;
  }
}

export async function updateAvocat(id: string, input: AvocatInput) {
  const normalizedData = normalizeAvocatInput(input);
  const existingAvocat = await findDuplicateAvocat(normalizedData, id);

  if (existingAvocat) {
    throw new Error("Another avocat with the same phone or email already exists.");
  }

  try {
    return await prisma.avocat.update({
      where: { id },
      data: toPrismaAvocatData(normalizedData)
    });
  } catch (error) {
    if (isUniqueEmailError(error)) {
      throw new Error("Another avocat with this email already exists.");
    }

    throw error;
  }
}

export async function deleteAvocat(id: string) {
  return prisma.avocat.delete({
    where: { id }
  });
}

type PreparedImportRow = {
  data: ReturnType<typeof normalizeAvocatInput>;
  website: string | null;
};

function mapRawApifyRecord(record: RawApifyAvocat): PreparedImportRow | null {
  const title = sanitizeOptionalString(record.title);
  const phone = sanitizeOptionalString(record.phone);
  const city = sanitizeOptionalString(record.city);
  const website = sanitizeOptionalString(record.website);
  const rawEmail = sanitizeOptionalString(record.email)?.toLowerCase() || null;
  const reviewsCount =
    typeof record.reviewsCount === "number"
      ? record.reviewsCount
      : Number(record.reviewsCount ?? 0);

  if (!phone || reviewsCount < 5 || !title) {
    return null;
  }

  return {
    data: normalizeAvocatInput({
      full_name: extractName(title) || title,
      email: rawEmail,
      phone,
      city: city ? city.toUpperCase() : null,
      firm_name: title,
      preferred_contact_method: rawEmail ? PreferredContactMethod.email : PreferredContactMethod.whatsapp
    }),
    website
  };
}

async function prepareImportRows(payload: unknown, importMode: ImportMode) {
  const mappedRows: Array<{ row: PreparedImportRow | null; index: number }> = [];

  for (let index = 0; index < payload.length; index += 1) {
    mappedRows.push({
      row: mapRawApifyRecord(payload[index] as RawApifyAvocat),
      index
    });
  }

  if (importMode !== "enrich-websites") {
    return mappedRows;
  }

  const websitesToEnrich = mappedRows
    .map((entry) => entry.row)
    .filter((row): row is PreparedImportRow => Boolean(row))
    .filter((row) => !row.data.email && row.website)
    .map((row) => row.website as string);

  const enrichedEmailsByWebsite = await enrichEmailsFromWebsites(websitesToEnrich);

  return mappedRows.map((entry) => {
    if (!entry.row || entry.row.data.email || !entry.row.website) {
      return entry;
    }

    const enrichedEmail = enrichedEmailsByWebsite.get(getWebsiteKey(entry.row.website));

    if (!enrichedEmail) {
      return entry;
    }

    return {
      ...entry,
      row: {
        ...entry.row,
        data: {
          ...entry.row.data,
          email: enrichedEmail,
          preferred_contact_method: PreferredContactMethod.email
        }
      }
    };
  });
}

export async function importAvocats(payload: unknown, importMode: ImportMode = "standard") {
  if (!Array.isArray(payload)) {
    throw new Error("Import payload must be a JSON array.");
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  const preparedRows = await prepareImportRows(payload, importMode);

  for (const prepared of preparedRows) {
    try {
      if (!prepared.row) {
        skipped += 1;
        errors.push(
          `Row ${prepared.index + 1}: skipped because phone is missing, title is empty, or reviewsCount is below 5.`
        );
        continue;
      }

      const existingAvocat = await findDuplicateAvocat(prepared.row.data);

      if (existingAvocat) {
        skipped += 1;
        errors.push(`Row ${prepared.index + 1}: skipped duplicate phone or email.`);
        continue;
      }

      await createAvocat(prepared.row.data);
      created += 1;
    } catch (error) {
      skipped += 1;
      const message = error instanceof Error ? error.message : "Unknown import error.";
      errors.push(`Row ${prepared.index + 1}: ${message}`);
    }
  }

  return {
    created,
    skipped,
    errors
  };
}

export async function exportAvocats() {
  const avocats = await prisma.avocat.findMany({
    orderBy: [{ full_name: "asc" }, { email: "asc" }]
  });

  return avocats.map((avocat) => ({
    id: avocat.id,
    full_name: avocat.full_name,
    email: avocat.email,
    phone: avocat.phone,
    city: avocat.city,
    firm_name: avocat.firm_name,
    preferred_contact_method: avocat.preferred_contact_method
  }));
}

import { PreferredContactMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { attachAvocatToActiveCampaign } from "@/lib/campaigns";

type AvocatInput = {
  full_name?: unknown;
  email?: unknown;
  phone?: unknown;
  city?: unknown;
  firm_name?: unknown;
  preferred_contact_method?: unknown;
};

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

function sanitizeContactMethod(value: unknown): PreferredContactMethod {
  if (typeof value === "string" && allowedContactMethods.has(value as PreferredContactMethod)) {
    return value as PreferredContactMethod;
  }

  return PreferredContactMethod.email;
}

export function normalizeAvocatInput(input: AvocatInput) {
  return {
    full_name: sanitizeRequiredString(input.full_name, "full_name"),
    email: sanitizeRequiredString(input.email, "email").toLowerCase(),
    phone: sanitizeOptionalString(input.phone),
    city: sanitizeOptionalString(input.city),
    firm_name: sanitizeOptionalString(input.firm_name),
    preferred_contact_method: sanitizeContactMethod(input.preferred_contact_method)
  };
}

function isUniqueEmailError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function createAvocat(input: AvocatInput) {
  const data = normalizeAvocatInput(input);

  try {
    const avocat = await prisma.avocat.create({ data });
    await attachAvocatToActiveCampaign(avocat.id);
    return avocat;
  } catch (error) {
    if (isUniqueEmailError(error)) {
      throw new Error("An avocat with this email already exists.");
    }

    throw error;
  }
}

export async function importAvocats(payload: unknown) {
  if (!Array.isArray(payload)) {
    throw new Error("Import payload must be a JSON array.");
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let index = 0; index < payload.length; index += 1) {
    const row = payload[index];

    try {
      await createAvocat(row as AvocatInput);
      created += 1;
    } catch (error) {
      skipped += 1;
      const message = error instanceof Error ? error.message : "Unknown import error.";
      errors.push(`Row ${index + 1}: ${message}`);
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

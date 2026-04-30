import { prisma } from "@/lib/db";
import { createTransporter } from "@/lib/email";

const SETTINGS_ID = "default";

export async function getOrCreateAppSettings() {
  const existing = await prisma.appSettings.findUnique({
    where: { id: SETTINGS_ID }
  });

  if (existing) {
    return existing;
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL or ADMIN_PASSWORD is missing.");
  }

  return prisma.appSettings.create({
    data: {
      id: SETTINGS_ID,
      admin_email: adminEmail,
      admin_password: adminPassword,
      smtp_from: process.env.SMTP_FROM || null
    }
  });
}

export async function getAdminSettings() {
  const settings = await getOrCreateAppSettings();

  return {
    email: settings.admin_email,
    password: settings.admin_password,
    smtpFrom: settings.smtp_from || process.env.SMTP_FROM || ""
  };
}

export async function updateAdminSettings(input: { email?: unknown; password?: unknown }) {
  const current = await getOrCreateAppSettings();
  const email =
    typeof input.email === "string" && input.email.trim()
      ? input.email.trim().toLowerCase()
      : current.admin_email;
  const password =
    typeof input.password === "string" && input.password.trim()
      ? input.password.trim()
      : current.admin_password;

  return prisma.appSettings.update({
    where: { id: SETTINGS_ID },
    data: {
      admin_email: email,
      admin_password: password,
      smtp_from: process.env.SMTP_FROM || current.smtp_from
    }
  });
}

export async function sendAdminCredentialsRecoveryEmail() {
  const settings = await getOrCreateAppSettings();
  const smtpFrom = process.env.SMTP_FROM || settings.smtp_from;

  if (!smtpFrom) {
    throw new Error("SMTP_FROM is missing.");
  }

  const transporter = createTransporter();

  await transporter.sendMail({
    from: smtpFrom,
    to: smtpFrom,
    subject: "Admin credentials recovery",
    text: `Admin email: ${settings.admin_email}\nAdmin password: ${settings.admin_password}`,
    html: `<p><strong>Admin email:</strong> ${settings.admin_email}</p><p><strong>Admin password:</strong> ${settings.admin_password}</p>`
  });

  return {
    recipient: smtpFrom,
    email: settings.admin_email
  };
}

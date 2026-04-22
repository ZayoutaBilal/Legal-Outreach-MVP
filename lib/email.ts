import nodemailer from "nodemailer";

type OutreachTemplateInput = {
  fullName: string;
  formLink: string;
};

function getMailerConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || "465");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !user || !pass || !from) {
    throw new Error("SMTP configuration is incomplete.");
  }

  return { host, port, user, pass, from };
}

export function createTransporter() {
  const config = getMailerConfig();

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });
}

export function buildOutreachEmail({ fullName, formLink }: OutreachTemplateInput) {
  const signer = process.env.YOUR_NAME || "Votre Nom";

  return {
    subject: "Courte étude – organisation des cabinets d’avocats",
    text: `Bonjour Maître ${fullName},

Je suis développeur basé à Tanger et je mène actuellement une courte étude sur les défis administratifs rencontrés par les avocats.

Le questionnaire prend moins de 3 minutes :

👉 ${formLink}

Merci beaucoup pour votre temps.

Cordialement,
${signer}`,
    html: `
      <p>Bonjour Maître ${fullName},</p>
      <p>Je suis développeur basé à Tanger et je mène actuellement une courte étude sur les défis administratifs rencontrés par les avocats.</p>
      <p>Le questionnaire prend moins de 3 minutes :</p>
      <p><a href="${formLink}">👉 ${formLink}</a></p>
      <p>Merci beaucoup pour votre temps.</p>
      <p>Cordialement,<br />${signer}</p>
    `
  };
}

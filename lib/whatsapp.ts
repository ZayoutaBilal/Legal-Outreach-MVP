import twilio from "twilio";

function getTwilioConfig() {
  const sid = process.env.TWILIO_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!sid || !authToken || !from) {
    throw new Error("Twilio WhatsApp configuration is incomplete.");
  }

  return { sid, authToken, from };
}

export function isValidWhatsappPhone(phone: string | null | undefined): phone is string {
  if (!phone) {
    return false;
  }

  return /^0[67]\d{8}$/.test(phone);
}

function toWhatsappAddress(phone: string) {
  return `whatsapp:+212${phone.slice(1)}`;
}

export async function sendWhatsAppMessage(phone: string, name: string, formLink: string) {
  if (!isValidWhatsappPhone(phone)) {
    throw new Error("Invalid WhatsApp phone number. It must start with 06 or 07.");
  }

  const { sid, authToken, from } = getTwilioConfig();
  const client = twilio(sid, authToken);
  const body = `Bonjour Maitre ${name},

Je travaille sur un outil pour simplifier la gestion des dossiers juridiques au Maroc.

J'aimerais comprendre vos defis quotidiens.

${formLink}

Merci pour votre temps.`;

  await client.messages.create({
    body,
    from: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
    to: toWhatsappAddress(phone)
  });
}

import { Resend } from "resend";

let client: Resend | null = null;

function getClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY n'est pas configuré");
  }
  client ??= new Resend(apiKey);
  return client;
}

export type SendEmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
};

export async function sendEmail({ to, subject, html, from }: SendEmailPayload) {
  const { data, error } = await getClient().emails.send({
    from: from ?? process.env.RESEND_FROM ?? "onboarding@resend.dev",
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

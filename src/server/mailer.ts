import { createTransport } from "nodemailer";

export interface Mailer {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

export interface MailConfig {
  mailer: Mailer;
  publicUrl: string;
}

export function mailConfigFromEnv(
  env: Record<string, string | undefined>,
): MailConfig | undefined {
  const host = env["SMTP_HOST"];
  const publicUrl = env["PUBLIC_URL"]?.replace(/\/+$/, "");
  if (!host || !publicUrl) {
    return undefined;
  }
  const secure = env["SMTP_SECURE"] === "true";
  const user = env["SMTP_USER"];
  const transport = createTransport({
    host,
    port: Number(env["SMTP_PORT"] || (secure ? 465 : 587)),
    secure,
    requireTLS: !secure && !/^(mailpit|localhost|127.0.0.1)$/.test(host),
    ...(user ? { auth: { user, pass: env["SMTP_PASS"] ?? "" } } : {}),
  });
  const from =
    env["SMTP_FROM"] || user || `guessdle@${new URL(publicUrl).hostname}`;
  return {
    publicUrl,
    mailer: {
      async send(message: Parameters<Mailer["send"]>[0]): Promise<void> {
        await transport.sendMail({ from, ...message });
      },
    },
  };
}

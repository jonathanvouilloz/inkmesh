import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { dataDir } from "./data.ts";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  headers?: Record<string, string>;
};

/** Messages sent through the `memory:` transport; tests read and empty it. */
export const outbox: Mail[] = [];

/** Reads the environment on every call; a partial or invalid configuration throws (and stops the start). */
export function mailConfig(): {
  smtp: URL;
  from: string;
  appUrl: string;
} | null {
  const { SMTP_URL, MAIL_FROM, INKMESH_URL } = process.env;
  const set = [SMTP_URL, MAIL_FROM, INKMESH_URL].filter(Boolean).length;
  if (set === 0) return null;
  if (set < 3)
    throw new Error("SMTP_URL, MAIL_FROM and INKMESH_URL must be set together");
  const smtp = URL.parse(SMTP_URL!);
  if (!smtp || !["smtp:", "smtps:", "memory:", "file:"].includes(smtp.protocol))
    throw new Error(
      "SMTP_URL must start with smtp://, smtps://, memory: or file:",
    );
  const app = URL.parse(INKMESH_URL!);
  if (
    !app ||
    !["http:", "https:"].includes(app.protocol) ||
    app.pathname !== "/" ||
    app.search ||
    app.hash
  )
    throw new Error(
      "INKMESH_URL must be an origin such as https://inkmesh.example",
    );
  return { smtp, from: MAIL_FROM!, appUrl: app.origin };
}

export function mailEnabled(): boolean {
  return mailConfig() !== null;
}

function config() {
  const found = mailConfig();
  if (!found) throw new Error("email is not configured");
  return found;
}

/** Public origin for links in emails, never the request's host. */
export function appUrl(): string {
  return config().appUrl;
}

const transports = new Map<string, Transporter>();

function smtpTransport(smtp: URL): Transporter {
  let transport = transports.get(smtp.href);
  if (!transport) {
    const secure = smtp.protocol === "smtps:";
    transport = nodemailer.createTransport({
      host: smtp.hostname,
      port: Number(smtp.port) || (secure ? 465 : 587),
      secure,
      auth: smtp.username
        ? {
            user: decodeURIComponent(smtp.username),
            pass: decodeURIComponent(smtp.password),
          }
        : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    transports.set(smtp.href, transport);
  }
  return transport;
}

export async function sendMail(mail: Mail): Promise<void> {
  const { smtp, from } = config();
  if (smtp.protocol === "memory:") {
    outbox.push(mail);
    return;
  }
  const message = {
    from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    headers: mail.headers,
  };
  if (smtp.protocol === "file:") {
    const info = await nodemailer
      .createTransport({ streamTransport: true, buffer: true, newline: "unix" })
      .sendMail(message);
    const dir = path.join(dataDir(), "mail");
    fs.mkdirSync(dir, { recursive: true });
    const name = `${Date.now()}-${randomBytes(4).toString("hex")}.eml`;
    fs.writeFileSync(path.join(dir, name), info.message as Buffer, {
      flag: "wx",
    });
    return;
  }
  await smtpTransport(smtp).sendMail(message);
}

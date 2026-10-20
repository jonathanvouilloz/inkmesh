import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { type Locale, t, tn } from '../i18n/index.ts';
import type { Role } from './access.ts';
import { dataDir } from './data.ts';
import type { InboxItem } from './inbox.ts';

export type Mail = { to: string; subject: string; text: string; headers?: Record<string, string> };

/** Messages sent through the `memory:` transport; tests read and empty it. */
export const outbox: Mail[] = [];

/** Reads the environment on every call; a partial or invalid configuration throws (and stops the start). */
export function mailConfig(): { smtp: URL; from: string; appUrl: string } | null {
	const { SMTP_URL, MAIL_FROM, INKMESH_URL } = process.env;
	const unset = Object.entries({ SMTP_URL, MAIL_FROM, INKMESH_URL }).flatMap(([k, v]) => (v ? [] : [k]));
	if (unset.length === 3) return null;
	if (unset.length) throw new Error(`${unset.join(' and ')} must be set too: SMTP_URL, MAIL_FROM and INKMESH_URL go together`);
	const smtp = URL.parse(SMTP_URL!);
	if (!smtp || !['smtp:', 'smtps:', 'memory:', 'file:'].includes(smtp.protocol))
		throw new Error('SMTP_URL must start with smtp://, smtps://, memory: or file:');
	if (smtp.protocol.startsWith('smtp')) {
		// `smtp:///` would silently go to localhost.
		if (!smtp.hostname) throw new Error('SMTP_URL must name the server, such as smtp://user:pass@smtp.example');
		try {
			decodeURIComponent(smtp.username + smtp.password);
		} catch {
			throw new Error('SMTP_URL has a badly percent-encoded user or password');
		}
	}
	const app = URL.parse(INKMESH_URL!);
	if (!app || !['http:', 'https:'].includes(app.protocol) || app.pathname !== '/' || app.search || app.hash)
		throw new Error('INKMESH_URL must be an origin such as https://inkmesh.example');
	return { smtp, from: MAIL_FROM!, appUrl: app.origin };
}

export function mailEnabled(): boolean {
	return mailConfig() !== null;
}

function config() {
	const found = mailConfig();
	if (!found) throw new Error('email is not configured');
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
		const secure = smtp.protocol === 'smtps:';
		transport = nodemailer.createTransport({
			host: smtp.hostname,
			port: Number(smtp.port) || (secure ? 465 : 587),
			secure,
			auth: smtp.username
				? {
						user: decodeURIComponent(smtp.username),
						pass: decodeURIComponent(smtp.password)
					}
				: undefined,
			connectionTimeout: 10_000,
			greetingTimeout: 10_000,
			socketTimeout: 30_000
		});
		transports.set(smtp.href, transport);
	}
	return transport;
}

export async function sendMail(mail: Mail): Promise<void> {
	const { smtp, from } = config();
	if (smtp.protocol === 'memory:') {
		outbox.push(mail);
		return;
	}
	const message = {
		from,
		to: mail.to,
		subject: mail.subject,
		text: mail.text,
		headers: mail.headers
	};
	if (smtp.protocol === 'file:') {
		const info = await nodemailer
			.createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
			.sendMail(message);
		const dir = path.join(dataDir(), 'mail');
		fs.mkdirSync(dir, { recursive: true });
		const name = `${Date.now()}-${randomBytes(4).toString('hex')}.eml`;
		fs.writeFileSync(path.join(dir, name), info.message as Buffer, {
			flag: 'wx'
		});
		return;
	}
	await smtpTransport(smtp).sendMail(message);
}

export function loginLinkMail(user: { email: string; name: string }, url: string, locale: Locale): Mail {
	return {
		to: user.email,
		subject: t('mail.loginSubject', locale),
		text: t('mail.loginBody', locale, { name: user.name, url })
	};
}

export function invitationMail(
	to: string,
	inviter: string,
	workspace: string,
	role: Role,
	url: string,
	locale: Locale
): Mail {
	const vars = { inviter, workspace, url, role: t(`role.${role}`, locale).toLowerCase() };
	return {
		to,
		subject: t('mail.inviteSubject', locale, vars),
		text: t('mail.inviteBody', locale, vars)
	};
}

export function digestMail(
	to: string,
	items: InboxItem[],
	total: number,
	urls: { inbox: string; unsubscribe: string },
	locale: Locale
): Mail {
	const lines = items.map((e) => {
		const author = e.agent ? `${e.author} via ${e.agent}` : e.author;
		const vars = { author, path: e.path, from: e.from ?? '', workspace: e.workspaceName };
		return `${t(`inbox.${e.type}`, locale, vars)} · ${e.workspaceName}`;
	});
	const more = total - items.length;
	if (more > 0) lines.push(t('mail.digestMore', locale, { count: String(more) }));
	return {
		to,
		subject: tn('mail.digestSubject', total, locale),
		text:
			[
				t('mail.digestIntro', locale),
				'',
				...lines,
				'',
				t('mail.digestInbox', locale, { url: urls.inbox }),
				'',
				t('mail.digestFooter', locale, { url: urls.unsubscribe })
			].join('\n') + '\n',
		headers: {
			'List-Unsubscribe': `<${urls.unsubscribe}>`,
			'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
		}
	};
}

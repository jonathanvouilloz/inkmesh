import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Locale } from '../i18n/index.ts';
import { db } from './db.ts';
import { pendingDigest } from './inbox.ts';
import { appUrl, digestMail, mailEnabled, sendMail } from './mail.ts';

const DAY = 86_400_000;

/** Throws on a bad value, which stops the start. */
export function digestHour(): number {
	const raw = process.env.DIGEST_HOUR;
	if (raw === undefined) return 8;
	if (/^\d{1,2}$/.test(raw) && Number(raw) <= 23) return Number(raw);
	throw new Error('DIGEST_HOUR must be an integer from 0 to 23');
}

/** The latest `hour:00Z` at or before `now`. */
export function slotAt(now: Date, hour: number): Date {
	const slot = new Date(now);
	slot.setUTCHours(hour, 0, 0, 0);
	return slot > now ? new Date(slot.getTime() - DAY) : slot;
}

export function digestOn(userId: number): boolean {
	const row = db().prepare('SELECT digest FROM users WHERE id = ?').get(userId) as { digest: number } | undefined;
	return row?.digest === 1;
}

/** Turning it on starts at the present: the first email covers only what happens after. */
export function setDigest(userId: number, on: boolean, locale: Locale): void {
	if (on)
		db()
			.prepare(
				'UPDATE users SET digest = 1, digest_last_id = (SELECT coalesce(max(id), 0) FROM events), locale = ? WHERE id = ?'
			)
			.run(locale, userId);
	else db().prepare('UPDATE users SET digest = 0, locale = ? WHERE id = ?').run(locale, userId);
}

function mac(userId: number): string {
	const { key } = db().prepare("SELECT key FROM instance_keys WHERE name = 'unsubscribe'").get() as { key: Uint8Array };
	return createHmac('sha256', key).update(`unsubscribe:${userId}`).digest('base64url');
}

export function unsubscribeToken(userId: number): string {
	return `${userId}.${mac(userId)}`;
}

export function unsubscribeUser(token: string): number | null {
	const match = /^(\d{1,15})\.([A-Za-z0-9_-]{43})$/.exec(token);
	if (!match) return null;
	const id = Number(match[1]);
	// Compared as text: two encodings of the same bytes (the last character's spare bits) are not both accepted.
	if (!timingSafeEqual(Buffer.from(match[2]), Buffer.from(mac(id)))) return null;
	return db().prepare('SELECT 1 FROM users WHERE id = ?').get(id) ? id : null;
}

export function stopDigest(token: string): boolean {
	const id = unsubscribeUser(token);
	if (id === null) return false;
	db().prepare('UPDATE users SET digest = 0 WHERE id = ?').run(id);
	return true;
}

/** Idempotent per slot: only users not sent since the slot, only events up to it; a failed send changes nothing. */
export async function runDigests(slot: Date): Promise<number> {
	const until = slot.toISOString();
	const users = db()
		.prepare(
			'SELECT id, email, locale, digest_last_id FROM users WHERE digest = 1 AND (digest_sent_at IS NULL OR digest_sent_at < ?) ORDER BY id'
		)
		.all(until) as { id: number; email: string; locale: Locale; digest_last_id: number }[];
	let sent = 0;
	for (const user of users) {
		const { items, total, lastId } = pendingDigest(user.id, user.digest_last_id, until);
		if (total === 0) continue;
		const urls = { inbox: appUrl() + '/inbox', unsubscribe: appUrl() + '/unsubscribe/' + unsubscribeToken(user.id) };
		try {
			await sendMail(digestMail(user.email, items, total, urls, user.locale));
		} catch (err) {
			// Never the message: it may carry the address.
			const e = err as { code?: string; responseCode?: number } | undefined;
			console.error(`digest: send failed for user ${user.id}`, e?.code, e?.responseCode);
			continue;
		}
		// max: turning the digest off and on during the send already moved the cursor further.
		db()
			.prepare('UPDATE users SET digest_last_id = max(digest_last_id, ?), digest_sent_at = ? WHERE id = ?')
			.run(lastId, new Date().toISOString(), user.id);
		sent++;
	}
	return sent;
}

/** One catch-up run now, then one run per daily slot; runs never overlap. Returns the stop function. */
export function startDigests(): () => void {
	if (!mailEnabled()) return () => {};
	const hour = digestHour();
	let queue = Promise.resolve();
	let timer: NodeJS.Timeout | undefined;
	const run = (slot: Date) => {
		queue = queue.then(
			() =>
				runDigests(slot).then(
					() => {},
					(err) => console.error('digest: run failed', (err as { code?: string } | undefined)?.code)
				)
		);
	};
	const arm = (slot: Date) => {
		timer = setTimeout(
			() => {
				run(slot);
				arm(new Date(slot.getTime() + DAY));
			},
			Math.max(0, slot.getTime() - Date.now())
		);
		timer.unref();
	};
	const current = slotAt(new Date(), hour);
	run(current);
	arm(new Date(current.getTime() + DAY));
	return () => clearTimeout(timer);
}

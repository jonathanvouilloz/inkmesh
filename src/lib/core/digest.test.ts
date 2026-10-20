import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspace } from './access.ts';
import { createUser, type User } from './accounts.ts';
import { closeDb, db } from './db.ts';
import {
	digestHour,
	digestOn,
	runDigests,
	setDigest,
	slotAt,
	startDigests,
	stopDigest,
	unsubscribeToken,
	unsubscribeUser
} from './digest.ts';
import { appendEvent } from './events.ts';
import { inbox, markRead, pendingDigest } from './inbox.ts';
import * as mail from './mail.ts';
import { outbox } from './mail.ts';

const VARS = ['SMTP_URL', 'MAIL_FROM', 'INKMESH_URL', 'DIGEST_HOUR'];
const SLOT = new Date('2026-10-20T08:00:00.000Z');
const HOUR = 3_600_000;

let dir: string;
let jon: User;
let ann: User;
beforeEach(async () => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-digest-'));
	process.env.INKMESH_DATA = dir;
	process.env.SMTP_URL = 'memory:';
	process.env.MAIL_FROM = 'inkmesh <noreply@inkmesh.local>';
	process.env.INKMESH_URL = 'https://inkmesh.example';
	// scrypt runs before any timer is faked.
	jon = await createUser({ email: 'jon@example.ch', name: 'Jon', password: 'long enough 1' });
	ann = await createUser({ email: 'ann@example.ch', name: 'Ann', password: 'long enough 1' });
	await createWorkspace('demo', 'Demo', jon);
	await createWorkspace('other', 'Other', ann);
	db().prepare("INSERT INTO memberships (workspace, user_id, role) VALUES ('demo', ?, 'editor')").run(ann.id);
	inbox(jon.id); // the inbox cursor starts before the test's events
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(SLOT.getTime() - 24 * HOUR));
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	closeDb();
	for (const name of VARS) delete process.env[name];
	delete process.env.INKMESH_DATA;
	outbox.length = 0;
	fs.rmSync(dir, { recursive: true, force: true });
});

const at = (ms: number) => vi.setSystemTime(new Date(SLOT.getTime() + ms));
const sentAt = (id: number) =>
	(db().prepare('SELECT digest_sent_at FROM users WHERE id = ?').get(id) as { digest_sent_at: string | null })
		.digest_sent_at;

describe('digest', () => {
	it('computes the slot', () => {
		expect(digestHour()).toBe(8);
		process.env.DIGEST_HOUR = '0';
		expect(digestHour()).toBe(0);
		process.env.DIGEST_HOUR = '23';
		expect(digestHour()).toBe(23);
		for (const bad of ['24', '-1', '8.5', 'x']) {
			process.env.DIGEST_HOUR = bad;
			expect(() => digestHour()).toThrow('DIGEST_HOUR must be an integer from 0 to 23');
		}
		expect(slotAt(new Date('2026-10-20T07:59:59.000Z'), 8)).toEqual(new Date('2026-10-19T08:00:00.000Z'));
		expect(slotAt(new Date('2026-10-20T08:00:00.000Z'), 8)).toEqual(new Date('2026-10-20T08:00:00.000Z'));
		expect(slotAt(new Date('2026-10-20T23:10:00.000Z'), 8)).toEqual(new Date('2026-10-20T08:00:00.000Z'));
	});

	it('opting in starts at the present', async () => {
		appendEvent('demo', ann, { type: 'update', path: 'old.md' });
		setDigest(jon.id, true, 'fr');
		expect(digestOn(jon.id)).toBe(true);
		expect(await runDigests(SLOT)).toBe(0);
		expect(outbox).toEqual([]);
	});

	it('saving again while on keeps the pending events', async () => {
		setDigest(jon.id, true, 'fr');
		appendEvent('demo', ann, { type: 'update', path: 'a.md' });
		setDigest(jon.id, true, 'en');
		const row = db().prepare('SELECT digest_last_id, locale FROM users WHERE id = ?').get(jon.id) as {
			digest_last_id: number;
			locale: string;
		};
		expect(row.locale).toBe('en');
		expect(pendingDigest(jon.id, row.digest_last_id, new Date().toISOString()).items).toHaveLength(1);
	});

	it('sends one digest with the day’s events', async () => {
		setDigest(jon.id, true, 'fr');
		at(-3 * HOUR);
		appendEvent('demo', ann, { type: 'join', path: '' });
		at(-2 * HOUR);
		appendEvent('demo', ann, { type: 'update', path: 'a.md' });
		at(-HOUR);
		appendEvent('demo', ann, { type: 'comment', path: 'a.md' });
		at(2 * HOUR);
		expect(await runDigests(SLOT)).toBe(1);
		expect(outbox).toHaveLength(1);
		const [m] = outbox;
		expect(m.to).toBe('jon@example.ch');
		expect(m.subject).toBe('inkmesh : 3 changements dans vos espaces');
		const lines = m.text.split('\n');
		// A join names its workspace already.
		expect(lines.slice(2, 5)).toEqual(['Ann a commenté a.md · Demo', 'Ann a modifié a.md · Demo', 'Ann a rejoint Demo']);
		expect(m.text).toContain('https://inkmesh.example/inbox');
		const unsubscribe = m.headers!['List-Unsubscribe'];
		expect(unsubscribe).toMatch(new RegExp(`^<https://inkmesh\\.example/unsubscribe/${jon.id}\\.`));
		expect(m.text).toContain(unsubscribe.slice(1, -1));
		expect(m.headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
		expect(sentAt(jon.id)).toBe(new Date().toISOString());
	});

	it('nothing new, no email', async () => {
		setDigest(jon.id, true, 'en');
		at(HOUR);
		expect(await runDigests(SLOT)).toBe(0);
		expect(outbox).toEqual([]);
		expect(sentAt(jon.id)).toBeNull();
	});

	it('catch-up is idempotent', async () => {
		setDigest(jon.id, true, 'en');
		appendEvent('demo', ann, { type: 'update', path: 'a.md' });
		at(2 * HOUR);
		expect(await runDigests(SLOT)).toBe(1);
		expect(await runDigests(SLOT)).toBe(0);
		expect(outbox).toHaveLength(1);
	});

	it('events after the slot wait for the next one', async () => {
		setDigest(jon.id, true, 'en');
		appendEvent('demo', ann, { type: 'update', path: 'before.md' });
		at(HOUR);
		appendEvent('demo', ann, { type: 'update', path: 'after.md' });
		at(2 * HOUR);
		expect(await runDigests(SLOT)).toBe(1);
		expect(outbox[0].text).toContain('before.md');
		expect(outbox[0].text).not.toContain('after.md');
		at(24 * HOUR);
		expect(await runDigests(new Date(SLOT.getTime() + 24 * HOUR))).toBe(1);
		expect(outbox[1].text).toContain('after.md');
		expect(outbox[1].text).not.toContain('before.md');
	});

	it('a failed send is retried at the next slot', async () => {
		setDigest(jon.id, true, 'en');
		appendEvent('demo', ann, { type: 'update', path: 'a.md' });
		const state = () => db().prepare('SELECT digest_last_id, digest_sent_at FROM users WHERE id = ?').get(jon.id);
		const before = state();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const failure = Object.assign(new Error('to jon@example.ch'), { code: 'ECONNECTION' });
		vi.spyOn(mail.outbox, 'push').mockImplementationOnce(() => {
			throw failure;
		});
		at(HOUR);
		expect(await runDigests(SLOT)).toBe(0);
		expect(state()).toEqual(before);
		expect(error).toHaveBeenCalledWith(`digest: send failed for user ${jon.id}`, 'ECONNECTION', undefined);
		at(24 * HOUR);
		expect(await runDigests(new Date(SLOT.getTime() + 24 * HOUR))).toBe(1);
		expect(outbox[0].text).toContain('a.md');
	});

	it('the inbox cursor counts as read', async () => {
		setDigest(jon.id, true, 'en');
		appendEvent('demo', ann, { type: 'update', path: 'a.md' });
		markRead(jon.id, Number.MAX_SAFE_INTEGER);
		at(HOUR);
		expect(await runDigests(SLOT)).toBe(0);
	});

	it('opted-out users and other workspaces get nothing', async () => {
		setDigest(jon.id, true, 'en');
		setDigest(ann.id, true, 'en');
		setDigest(ann.id, false, 'en');
		appendEvent('other', ann, { type: 'update', path: 'secret.md' });
		appendEvent('demo', jon, { type: 'update', path: 'mine.md' });
		at(HOUR);
		expect(await runDigests(SLOT)).toBe(0);
		expect(digestOn(ann.id)).toBe(false);
		expect(outbox).toEqual([]);
	});

	it('the 50-line cap', async () => {
		setDigest(jon.id, true, 'en');
		for (let i = 0; i < 53; i++) appendEvent('demo', ann, { type: 'create', path: `${i}.md` });
		at(HOUR);
		expect(await runDigests(SLOT)).toBe(1);
		const [m] = outbox;
		expect(m.subject).toBe('inkmesh: 53 changes in your workspaces');
		expect(m.text.split('\n').filter((l) => l.endsWith(' · Demo'))).toHaveLength(50);
		expect(m.text).toContain('3 more in your inbox.');
		expect(await runDigests(SLOT)).toBe(0);
	});

	it('unsubscribe tokens are signed', () => {
		setDigest(jon.id, true, 'en');
		const token = unsubscribeToken(jon.id);
		expect(token).toMatch(/^\d+\.[A-Za-z0-9_-]{43}$/);
		expect(unsubscribeUser(token)).toBe(jon.id);
		const mac = token.split('.')[1];
		expect(unsubscribeUser(`${ann.id}.${mac}`)).toBeNull();
		const flipped = token.slice(0, -2) + (token.at(-2) === 'A' ? 'B' : 'A') + token.at(-1);
		expect(unsubscribeUser(flipped)).toBeNull();
		expect(unsubscribeUser('x')).toBeNull();
		expect(unsubscribeUser(unsubscribeToken(9999))).toBeNull();
		expect(stopDigest('x')).toBe(false);
		expect(digestOn(jon.id)).toBe(true);
		expect(stopDigest(token)).toBe(true);
		expect(digestOn(jon.id)).toBe(false);
	});

	it('the timer catches up once at start', async () => {
		vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
		at(-24 * HOUR);
		setDigest(jon.id, true, 'en');
		at(-HOUR);
		appendEvent('demo', ann, { type: 'update', path: 'a.md' });
		at(1.5 * HOUR); // 09:30Z, the 08:00 run never happened
		const stop = startDigests();
		await vi.waitFor(() => expect(outbox).toHaveLength(1));
		expect(outbox[0].text).toContain('a.md');
		appendEvent('demo', ann, { type: 'update', path: 'b.md' });
		await vi.advanceTimersByTimeAsync(SLOT.getTime() + 24 * HOUR - Date.now() - 1);
		expect(outbox).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1);
		await vi.waitFor(() => expect(outbox).toHaveLength(2));
		expect(outbox[1].text).toContain('b.md');
		expect(outbox[1].text).not.toContain('a.md');
		expect(vi.getTimerCount()).toBe(1); // re-armed for the day after
		stop();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('email off, no timer', async () => {
		vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
		delete process.env.SMTP_URL;
		delete process.env.MAIL_FROM;
		delete process.env.INKMESH_URL;
		setDigest(jon.id, true, 'en');
		appendEvent('demo', ann, { type: 'update', path: 'a.md' });
		at(HOUR);
		const stop = startDigests();
		expect(vi.getTimerCount()).toBe(0);
		stop();
		expect(outbox).toEqual([]);
	});
});

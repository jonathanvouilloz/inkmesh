import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from './db.ts';
import { appUrl, loginLinkMail, mailConfig, mailEnabled, outbox, sendMail } from './mail.ts';

const VARS = ['SMTP_URL', 'MAIL_FROM', 'INKMESH_URL'];
const FROM = 'inkmesh <noreply@inkmesh.local>';

function configure(smtp: string, url = 'https://a.example') {
	process.env.SMTP_URL = smtp;
	process.env.MAIL_FROM = FROM;
	process.env.INKMESH_URL = url;
}

const dirs: string[] = [];
beforeEach(() => {
	process.env.INKMESH_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-mail-'));
	dirs.push(process.env.INKMESH_DATA);
});
afterEach(() => {
	closeDb();
	for (const name of VARS) delete process.env[name];
	delete process.env.INKMESH_DATA;
	outbox.length = 0;
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('mail', () => {
	it('email is off without configuration', async () => {
		expect(mailConfig()).toBeNull();
		expect(mailEnabled()).toBe(false);
		await expect(sendMail({ to: 'ann@example.ch', subject: 's', text: 't' }, 'test', 1)).rejects.toThrow(
			'email is not configured'
		);
	});

	it('refuses a partial configuration', () => {
		process.env.SMTP_URL = 'memory:';
		expect(() => mailConfig()).toThrow(/^MAIL_FROM and INKMESH_URL must be set too/);
		delete process.env.SMTP_URL;
		process.env.MAIL_FROM = FROM;
		process.env.INKMESH_URL = 'https://a.example';
		expect(() => mailConfig()).toThrow(/^SMTP_URL must be set too/);
	});

	it('refuses a bad scheme or URL', () => {
		configure('http://x');
		expect(() => mailConfig()).toThrow('SMTP_URL must start with smtp://, smtps://, memory: or file:');
		configure('smtp:///');
		expect(() => mailConfig()).toThrow('SMTP_URL must name the server');
		configure('smtps://user:50%zz@smtp.example');
		expect(() => mailConfig()).toThrow('SMTP_URL has a badly percent-encoded user or password');
		configure('smtps://user:50%25@smtp.example');
		expect(mailEnabled()).toBe(true);
		for (const url of ['https://a.example/app', 'ftp://a', 'not a url']) {
			configure('memory:', url);
			expect(() => mailConfig()).toThrow('INKMESH_URL must be an origin such as https://inkmesh.example');
		}
		configure('memory:', 'https://a.example/');
		expect(mailEnabled()).toBe(true);
		expect(appUrl()).toBe('https://a.example');
	});

	it('the memory transport keeps the message', async () => {
		configure('memory:');
		const mail = { to: 'ann@example.ch', subject: 'Hello', text: 'Body' };
		expect(await sendMail(mail, 'test', 1)).toBe(true);
		expect(outbox).toEqual([mail]);
	});

	it('the file transport writes inside the data directory', async () => {
		configure('file:');
		const mail = { to: 'ann@example.ch', subject: 'Votre lien de connexion à inkmesh', text: 'Hello Ann' };
		expect(await sendMail(mail, 'test', 1)).toBe(true);
		const dir = path.join(process.env.INKMESH_DATA!, 'mail');
		const files = fs.readdirSync(dir);
		expect(files).toHaveLength(1);
		expect(files[0]).toMatch(/^\d+-[0-9a-f]{8}\.eml$/);
		expect(fs.statSync(path.join(dir, files[0])).mode & 0o777).toBe(0o600);
		const eml = fs.readFileSync(path.join(dir, files[0]), 'utf8');
		expect(eml).toContain('To: ann@example.ch');
		expect(eml).toContain('From: inkmesh <noreply@inkmesh.local>');
		expect(eml).toMatch(/Subject: =\?UTF-8\?Q\?Votre_lien_de_connexion_=C3=A0_inkmesh\?=/);
		expect(eml).toContain('Hello Ann');
	});

	it('talks SMTP to the configured server', async () => {
		const seen: string[] = [];
		const server = net.createServer((socket) => {
			let data = false;
			let buffer = '';
			socket.write('220 fake ESMTP\r\n');
			socket.on('data', (chunk) => {
				buffer += chunk.toString('utf8');
				let end;
				while ((end = buffer.indexOf('\r\n')) >= 0) {
					const line = buffer.slice(0, end);
					buffer = buffer.slice(end + 2);
					seen.push(line);
					if (data) {
						if (line === '.') {
							data = false;
							socket.write('250 queued\r\n');
						}
					} else if (/^(EHLO|HELO)/i.test(line)) socket.write('250 fake\r\n');
					else if (/^(MAIL|RCPT)/i.test(line)) socket.write('250 ok\r\n');
					else if (/^DATA/i.test(line)) {
						data = true;
						socket.write('354 go\r\n');
					} else if (/^QUIT/i.test(line)) socket.end('221 bye\r\n');
					else socket.write('250 ok\r\n');
				}
			});
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		try {
			const { port } = server.address() as net.AddressInfo;
			configure(`smtp://127.0.0.1:${port}`);
			const mail = { to: 'ann@example.ch', subject: 'Fake server test', text: 'Hello Ann' };
			expect(await sendMail(mail, 'test', 1)).toBe(true);
			expect(seen.some((line) => line.startsWith('MAIL FROM:<noreply@inkmesh.local>'))).toBe(true);
			expect(seen).toContain('RCPT TO:<ann@example.ch>');
			expect(seen).toContain('Subject: Fake server test');
		} finally {
			server.close();
		}
	});

	it('builds the sign-in email in both languages', () => {
		const ann = { email: 'ann@example.ch', name: 'Ann' };
		const url = 'https://a.example/login/link/abc';
		const en = loginLinkMail(ann, url, 'en');
		expect(en).toMatchObject({
			to: 'ann@example.ch',
			subject: 'Your inkmesh sign-in link'
		});
		expect(en.text).toContain('Hello Ann,');
		expect(en.text).toContain('\n\n' + url + '\n\n');
		const fr = loginLinkMail(ann, url, 'fr');
		expect(fr.subject).toBe('Votre lien de connexion à inkmesh');
		expect(fr.text).toContain('Bonjour Ann,');
		expect(fr.text).toContain('15 minutes\u00a0:\n\n' + url);
	});
});

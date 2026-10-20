// Emails every instance admin that a background job failed: `node scripts/alert.ts <job>`.
// Run by systemd's OnFailure (deploy/inkmesh-alert@.service); needs email to be configured.
import { execFileSync } from 'node:child_process';
import { admins } from '../src/lib/core/accounts.ts';
import { mailEnabled, sendMail } from '../src/lib/core/mail.ts';

const job = process.argv[2];
if (!job || process.argv.length !== 3) {
	console.error('usage: node scripts/alert.ts <job>');
	process.exit(1);
}
if (!mailEnabled()) {
	console.error(`${job} failed; email is off, no alert sent`);
	process.exit(1);
}
let log = '';
try {
	log = execFileSync('journalctl', ['--user', '-u', job, '-n', '20', '--no-pager', '-o', 'cat'], { encoding: 'utf8' });
} catch {
	log = '(journal unavailable)';
}
let failed = false;
for (const admin of admins()) {
	const sent = await sendMail(
		{
			to: admin.email,
			subject: `inkmesh: ${job} failed`,
			text: `${job} failed at ${new Date().toISOString()} on this inkmesh instance.\n\nLast log lines:\n\n${log}\nFull log: journalctl --user -u ${job}\n`
		},
		'alert',
		admin.id
	);
	failed ||= !sent;
}
process.exit(failed ? 1 : 0);

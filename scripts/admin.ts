// Instance administration: `create-admin <email> <name>` or `reset-password <email>`; the password is read from stdin.
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createUser, setPassword, userByEmail } from '../src/lib/core/accounts.ts';
import { Conflict } from '../src/lib/core/paths.ts';

const USAGE = 'usage: npm run admin -- create-admin <email> <name (1 to 80 characters)> | reset-password <email>';
const fail = (message: string): never => {
	console.error(message);
	process.exit(1);
};

const [command, email, name] = process.argv.slice(2);
const valid =
	(command === 'create-admin' && email && name?.trim() && name.trim().length <= 80 && process.argv.length === 5) ||
	(command === 'reset-password' && email && process.argv.length === 4);
if (!valid) fail(USAGE);

const user = command === 'reset-password' ? (userByEmail(email) ?? fail(`no user ${email}`)) : null;
const tty = !!process.stdin.isTTY;
// On a terminal readline echoes each typed character to its output: give it a sink, write the prompt ourselves.
const sink = new Writable({ write: (_chunk, _encoding, done) => done() });
const rl = createInterface({ input: process.stdin, output: tty ? sink : process.stderr, terminal: tty });
// Without the close handler an empty stdin leaves the question pending and Node exits with 13.
rl.once('close', () => fail('no password given'));
if (tty) process.stderr.write('Password: ');
const password = await rl.question(tty ? '' : 'Password: ');
if (tty) process.stderr.write('\n');
rl.removeAllListeners('close');
rl.close();

try {
	if (user) {
		await setPassword(user.id, password);
		console.log(`Password reset for ${user.email}`);
	} else {
		const created = await createUser({ email, name: name.trim(), password, admin: true });
		console.log(`Created admin ${created.email} (${created.name}, id ${created.id})`);
	}
} catch (err) {
	if (err instanceof Conflict) fail(`${email} already exists`);
	if (err instanceof RangeError) fail('The password must be at least 10 characters');
	throw err;
}

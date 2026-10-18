// Instance administration: `create-admin <email> <name>` or `reset-password <email>`; the password is read from stdin.
import { createInterface } from 'node:readline/promises';
import { createUser, setPassword, userByEmail } from '../src/lib/core/accounts.ts';
import { Conflict } from '../src/lib/core/paths.ts';

const USAGE = 'usage: npm run admin -- create-admin <email> <name> | reset-password <email>';
const fail = (message: string): never => {
	console.error(message);
	process.exit(1);
};

const [command, email, name] = process.argv.slice(2);
const valid =
	(command === 'create-admin' && email && name && process.argv.length === 5) ||
	(command === 'reset-password' && email && process.argv.length === 4);
if (!valid) fail(USAGE);

const user = command === 'reset-password' ? (userByEmail(email) ?? fail(`no user ${email}`)) : null;
const rl = createInterface({ input: process.stdin, output: process.stderr });
// Without the close handler an empty stdin leaves the question pending and Node exits with 13.
rl.once('close', () => fail('no password given'));
const password = await rl.question('Password: ');
rl.removeAllListeners('close');
rl.close();

try {
	if (user) {
		await setPassword(user.id, password);
		console.log(`Password reset for ${user.email}`);
	} else {
		const created = await createUser({ email, name, password, admin: true });
		console.log(`Created admin ${created.email} (${created.name}, id ${created.id})`);
	}
} catch (err) {
	if (err instanceof Conflict) fail(`${email} already exists`);
	if (err instanceof RangeError) fail('The password must be at least 10 characters');
	throw err;
}

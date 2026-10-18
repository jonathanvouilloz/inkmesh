import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function git(dir: string, args: string[], env: Record<string, string> = {}): Promise<string> {
	const { stdout } = await run('git', ['-c', 'commit.gpgsign=false', ...args], {
		cwd: dir,
		env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', ...env }
	});
	return stdout;
}

export async function gitInit(dir: string): Promise<void> {
	await git(dir, ['init', '-q']);
}

export async function gitCommit(
	dir: string,
	opts: { paths: string[]; message: string; author: { name: string; email: string } }
): Promise<string> {
	await git(dir, ['add', '-A', '--', ...opts.paths]);
	try {
		await git(dir, ['diff', '--cached', '--quiet']);
		return ''; // exit 0: nothing staged
	} catch (err) {
		if ((err as { code?: unknown }).code !== 1) throw err;
	}
	const { name, email } = opts.author;
	await git(dir, ['commit', '-q', `--author=${name} <${email}>`, '-m', opts.message], {
		GIT_COMMITTER_NAME: name,
		GIT_COMMITTER_EMAIL: email
	});
	return (await git(dir, ['rev-parse', 'HEAD'])).trim();
}

export async function gitLog(
	dir: string,
	path: string,
	limit: number
): Promise<Array<{ hash: string; name: string; date: string; message: string }>> {
	// %x1f separates fields; %s is a single line, so newlines separate records.
	const out = await git(dir, ['log', '-n', String(limit), '--format=%H%x1f%an%x1f%aI%x1f%s', '--', path]);
	return out
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			const [hash, name, date, message] = line.split('\x1f');
			return { hash, name, date, message };
		});
}

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const gitEnv = (env: Record<string, string> = {}) => ({
	...process.env,
	GIT_CONFIG_NOSYSTEM: '1',
	GIT_CONFIG_GLOBAL: '/dev/null',
	// Document names are paths, never patterns: `*.md` or `:x.md` must match only themselves.
	GIT_LITERAL_PATHSPECS: '1',
	LC_ALL: 'C',
	...env
});

async function git(dir: string, args: string[], env: Record<string, string> = {}): Promise<string> {
	const { stdout } = await run('git', ['-c', 'commit.gpgsign=false', ...args], {
		cwd: dir,
		env: gitEnv(env)
	});
	return stdout;
}

/** `git log` output, or '' on a repository with no commits yet. */
async function gitLogOutput(dir: string, args: string[]): Promise<string> {
	try {
		return await git(dir, ['log', ...args]);
	} catch (err) {
		if (String((err as { stderr?: unknown }).stderr).includes('does not have any commits yet')) return '';
		throw err;
	}
}

/** Fails fast at startup when the git binary is missing. */
export async function assertGit(): Promise<void> {
	await run('git', ['--version']).catch(() => {
		throw new Error('inkmesh needs the git binary on PATH');
	});
}

export async function gitInit(dir: string): Promise<void> {
	await git(dir, ['init', '-q']);
}

export async function gitCommit(
	dir: string,
	opts: {
		paths: string[];
		message: string;
		author: { name: string; email: string };
	}
): Promise<string> {
	// `git add` fails on a path matching nothing: an untracked item already moved or deleted.
	const paths: string[] = [];
	for (const p of opts.paths)
		if (fs.existsSync(join(dir, p)) || (await git(dir, ['ls-files', '-z', '--', p]))) paths.push(p);
	if (paths.length === 0) return '';
	await git(dir, ['add', '-A', '--', ...paths]);
	// Commit only what was staged: `git commit -- p` fails on a path git does not track (an empty folder).
	// No renames: a rename lists only its new path, which would leave the deletion uncommitted.
	const staged = (
		await git(dir, ['diff', '--cached', '--no-renames', '--name-only', '-z', '--', ...paths])
	)
		.split('\0')
		.filter(Boolean);
	if (staged.length === 0) return '';
	const { name, email } = opts.author;
	try {
		await git(
			dir,
			['commit', '-q', `--author=${name} <${email}>`, '-m', opts.message, '--', ...staged],
			{
				GIT_COMMITTER_NAME: name,
				GIT_COMMITTER_EMAIL: email
			}
		);
	} catch (err) {
		// Leaves the index as it was, so the caller's rollback is not committed by the next write.
		await git(dir, ['reset', '-q', '--', ...staged]).catch(() => {});
		throw err;
	}
	return (await git(dir, ['rev-parse', 'HEAD'])).trim();
}

export async function gitLog(
	dir: string,
	path: string,
	limit: number
): Promise<Array<{ hash: string; name: string; date: string; message: string }>> {
	// %x1f separates fields; %s is a single line, so newlines separate records.
	const out = await gitLogOutput(dir, ['-n', String(limit), '--format=%H%x1f%an%x1f%aI%x1f%s', '--', path]);
	return out
		.split('\n')
		.filter(Boolean)
		.map((line) => {
			const [hash, name, date, message] = line.split('\x1f');
			return { hash, name, date, message };
		});
}

/** A file's bytes at a revision, or null when the revision or the path does not exist there. */
export async function gitShow(dir: string, rev: string, path: string): Promise<Buffer | null> {
	try {
		const { stdout } = await run('git', ['cat-file', 'blob', `${rev}:${path}`], {
			cwd: dir,
			env: gitEnv(),
			encoding: 'buffer',
			maxBuffer: 64 * 1024 * 1024
		});
		return stdout;
	} catch (err) {
		if ((err as { code?: unknown }).code === 128) return null; // git's "fatal": no such object
		throw err;
	}
}

/** The newest commits that deleted files, renames excluded, with the deleted paths. */
export async function gitDeletions(
	dir: string,
	limit: number
): Promise<Array<{ commit: string; name: string; date: string; paths: string[] }>> {
	const out = await gitLogOutput(dir, [
		'-M',
		'--diff-filter=D',
		'--name-only',
		'-z',
		'-n',
		String(limit),
		'--format=%x1e%H%x1f%an%x1f%aI'
	]);
	// Each record: \x1e header \0 \n path \0 path \0 ...
	return out
		.split('\x1e')
		.filter(Boolean)
		.map((record) => {
			const [header, ...paths] = record.split('\0');
			const [commit, name, date] = header.split('\x1f');
			if (paths[0]?.startsWith('\n')) paths[0] = paths[0].slice(1);
			return { commit, name, date, paths: paths.filter(Boolean) };
		});
}

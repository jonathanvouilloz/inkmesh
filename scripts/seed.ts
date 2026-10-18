// Seeds the demo workspace under $INKMESH_DATA. Idempotent: existing files are left alone.
import fs from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { commitAuthor, currentActor } from '../src/lib/core/actor.ts';
import { workspaceDir } from '../src/lib/core/data.ts';
import { ensureWorkspace } from '../src/lib/core/documents.ts';
import { gitCommit } from '../src/lib/core/git.ts';

const files: Record<string, string> = {
	'project/prd.md': 'docs/project/prd.md',
	'project/architecture.md': 'docs/project/architecture.md',
	'examples/kitchen-sink.md': 'tests/fixtures/kitchen-sink.md'
};

await ensureWorkspace('demo');
const root = workspaceDir('demo');
const copied: string[] = [];
for (const [target, source] of Object.entries(files)) {
	const file = join(root, target);
	await fs.mkdir(dirname(file), { recursive: true });
	// Seeding is the one legitimate direct write outside writeDocument: it bootstraps data, no user edit.
	try {
		await fs.copyFile(source, file, fs.constants.COPYFILE_EXCL);
		copied.push(target);
	} catch (err) {
		if ((err as { code?: unknown }).code !== 'EEXIST') throw err;
	}
}
await gitCommit(root, {
	paths: copied,
	message: 'Seed demo workspace',
	author: commitAuthor(currentActor())
});
console.log(copied.length ? `Seeded ${copied.join(', ')}` : 'Demo workspace already seeded');

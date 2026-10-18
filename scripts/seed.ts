// Seeds the owner account and the demo workspace under $INKMESH_DATA. Idempotent: existing data is left alone.
import fs from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createWorkspace, workspace } from '../src/lib/core/access.ts';
import { createUser, userByEmail } from '../src/lib/core/accounts.ts';
import { commitAuthor } from '../src/lib/core/actor.ts';
import { workspaceDir } from '../src/lib/core/data.ts';
import { gitCommit } from '../src/lib/core/git.ts';

const files: Record<string, string> = {
	'project/prd.md': 'docs/project/prd.md',
	'project/architecture.md': 'docs/project/architecture.md',
	'examples/kitchen-sink.md': 'tests/fixtures/kitchen-sink.md'
};

const user =
	userByEmail('owner@inkmesh.local') ??
	(await createUser({ email: 'owner@inkmesh.local', name: 'Owner', password: 'inkmesh-dev', admin: true }));
const owner = { id: user.id, name: user.name };
if (!workspace('demo')) await createWorkspace('demo', 'Demo', owner);
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
// Every target, not only the ones copied now: a crashed earlier run may have copied without committing.
const targets = Object.keys(files);
const examples = targets.filter((p) => p.startsWith('examples/'));
await gitCommit(root, {
	paths: targets.filter((p) => !examples.includes(p)),
	message: 'Seed demo workspace',
	author: commitAuthor(owner)
});
// The examples land as an agent commit, so the History shows "Owner via claude-code".
await gitCommit(root, {
	paths: examples,
	message: 'Seed examples via agent',
	author: commitAuthor({ ...owner, agent: 'claude-code' })
});
console.log(copied.length ? `Seeded ${copied.join(', ')}` : 'Demo workspace already seeded');

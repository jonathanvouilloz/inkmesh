import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	acceptInvitation,
	acceptInvitationAsNewUser,
	assertRole,
	createInvitation,
	createWorkspace,
	Forbidden,
	invitation,
	members,
	pendingInvitations,
	removeMember,
	revokeInvitation,
	roleOf,
	setRole,
	workspace,
	workspacesOf,
	type Role
} from './access.ts';
import { createUser, hashPassword, hashToken, userByEmail, type User } from './accounts.ts';
import { workspaceDir } from './data.ts';
import { closeDb, db } from './db.ts';
import { Conflict, InvalidPath } from './paths.ts';

let dir: string;
beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkmesh-access-'));
	process.env.INKMESH_DATA = dir;
});
afterEach(() => {
	closeDb();
	delete process.env.INKMESH_DATA;
	fs.rmSync(dir, { recursive: true, force: true });
});

const user = (name: string, admin = false): Promise<User> =>
	createUser({ email: `${name}@example.ch`, name, password: 'long enough 1', admin });

const join = (slug: string, u: User, role: Role) =>
	db()
		.prepare('INSERT INTO memberships (workspace, user_id, role) VALUES (?, ?, ?)')
		.run(slug, u.id, role);

describe('access', () => {
	it('creates a workspace folder and its owner', async () => {
		const jon = await user('jon');
		await createWorkspace('team', 'Team', jon);
		expect(fs.existsSync(path.join(workspaceDir('team'), '.git'))).toBe(true);
		expect(workspacesOf(jon.id)).toEqual([{ slug: 'team', name: 'Team', role: 'owner' }]);
		expect(workspace('team')).toEqual({ slug: 'team', name: 'Team' });
		expect(workspace('nope')).toBeNull();
		await expect(createWorkspace('Team', 'x', jon)).rejects.toBeInstanceOf(InvalidPath);
		await expect(createWorkspace('../x', 'x', jon)).rejects.toBeInstanceOf(InvalidPath);
		await expect(createWorkspace('team', 'x', jon)).rejects.toBeInstanceOf(Conflict);
	});

	it('refuses slugs that collide with top-level routes', async () => {
		const jon = await user('jon');
		await expect(createWorkspace('login', 'x', jon)).rejects.toBeInstanceOf(InvalidPath);
		await expect(createWorkspace('invite', 'x', jon)).rejects.toBeInstanceOf(InvalidPath);
		await expect(createWorkspace('oauth', 'x', jon)).rejects.toBeInstanceOf(InvalidPath);
	});

	it('inbox and join are reserved slugs', async () => {
		const jon = await user('jon');
		await expect(createWorkspace('inbox', 'x', jon)).rejects.toBeInstanceOf(InvalidPath);
		await expect(createWorkspace('join', 'x', jon)).rejects.toBeInstanceOf(InvalidPath);
	});

	it('unsubscribe is a reserved slug', async () => {
		await expect(createWorkspace('unsubscribe', 'x', await user('jon'))).rejects.toBeInstanceOf(InvalidPath);
	});

	it('drops the workspace row when its folder cannot be created', async () => {
		const jon = await user('jon');
		fs.mkdirSync(path.dirname(workspaceDir('team')), { recursive: true });
		fs.writeFileSync(workspaceDir('team'), 'in the way');
		await expect(createWorkspace('team', 'Team', jon)).rejects.toThrow();
		expect(workspace('team')).toBeNull();
		expect(workspacesOf(jon.id)).toEqual([]);
		fs.rmSync(workspaceDir('team'));
		await createWorkspace('team', 'Team', jon);
		expect(roleOf('team', jon.id)).toBe('owner');
	});

	it('lists workspaces by name', async () => {
		const jon = await user('jon');
		await createWorkspace('zeta', 'Alpha', jon);
		await createWorkspace('alpha', 'Zeta', jon);
		expect(workspacesOf(jon.id).map((w) => w.slug)).toEqual(['zeta', 'alpha']);
	});

	it.each([
		['reader', 'reader', true],
		['reader', 'editor', false],
		['reader', 'owner', false],
		['editor', 'reader', true],
		['editor', 'editor', true],
		['editor', 'owner', false],
		['owner', 'reader', true],
		['owner', 'editor', true],
		['owner', 'owner', true]
	] as const)('%s asked for %s → %s', async (has, min, ok) => {
		const jon = await user('jon');
		const bob = await user('bob');
		await createWorkspace('team', 'Team', jon);
		join('team', bob, has);
		if (ok) expect(assertRole('team', bob, min)).toEqual({ workspace: 'team', userId: bob.id, role: has });
		else expect(() => assertRole('team', bob, min)).toThrow(new Forbidden('insufficient role'));
	});

	it('a non-member is Forbidden with "not a member"', async () => {
		const jon = await user('jon');
		const bob = await user('bob');
		await createWorkspace('team', 'Team', jon);
		expect(roleOf('team', bob.id)).toBeNull();
		expect(() => assertRole('team', bob, 'reader')).toThrow(Forbidden);
		expect(() => assertRole('team', bob, 'reader')).toThrow('not a member');
		expect(() => assertRole('nope', jon, 'reader')).toThrow('not a member');
	});

	it('keeps the last owner', async () => {
		const jon = await user('jon');
		const bob = await user('bob');
		await createWorkspace('team', 'Team', jon);
		expect(() => setRole('team', jon.id, 'editor', jon)).toThrow(new Conflict('last owner'));
		expect(() => removeMember('team', jon.id, jon)).toThrow(new Conflict('last owner'));
		expect(roleOf('team', jon.id)).toBe('owner');
		join('team', bob, 'owner');
		setRole('team', jon.id, 'editor', jon);
		expect(roleOf('team', jon.id)).toBe('editor');
		removeMember('team', jon.id, bob);
		expect(roleOf('team', jon.id)).toBeNull();
		expect(members('team')).toEqual([
			{ user: { id: bob.id, name: 'bob', email: bob.email }, role: 'owner' }
		]);
	});

	it('only owners manage members', async () => {
		const jon = await user('jon');
		const bob = await user('bob');
		const carol = await user('carol');
		await createWorkspace('team', 'Team', jon);
		join('team', bob, 'editor');
		join('team', carol, 'reader');
		expect(() => setRole('team', carol.id, 'editor', bob)).toThrow(Forbidden);
		expect(() => removeMember('team', carol.id, bob)).toThrow(Forbidden);
		expect(roleOf('team', carol.id)).toBe('reader');
		setRole('team', carol.id, 'editor', jon);
		expect(roleOf('team', carol.id)).toBe('editor');
		removeMember('team', carol.id, jon);
		expect(roleOf('team', carol.id)).toBeNull();
	});

	it('editors invite up to editor, owners invite owners', async () => {
		const jon = await user('jon');
		const bob = await user('bob');
		const carol = await user('carol');
		await createWorkspace('team', 'Team', jon);
		join('team', bob, 'editor');
		join('team', carol, 'reader');
		expect(() => createInvitation('team', 'reader', carol)).toThrow(Forbidden);
		expect(() => createInvitation('team', 'owner', bob)).toThrow(Forbidden);
		expect(createInvitation('team', 'editor', bob)).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(createInvitation('team', 'reader', bob)).toMatch(/^[A-Za-z0-9_-]{43}$/);
		const token = createInvitation('team', 'owner', jon);
		const inv = invitation(token);
		expect(inv).toMatchObject({ workspace: { slug: 'team', name: 'Team' }, role: 'owner', createdBy: 'jon' });
		const days = (Date.parse(inv!.expiresAt) - Date.now()) / 86_400_000;
		expect(days).toBeGreaterThan(6.99);
		expect(days).toBeLessThanOrEqual(7);
	});

	it('an invitation keeps the address it was mailed to', async () => {
		const jon = await user('jon');
		await createWorkspace('team', 'Team', jon);
		expect(invitation(createInvitation('team', 'reader', jon, 'ann@example.ch'))?.email).toBe('ann@example.ch');
		expect(invitation(createInvitation('team', 'reader', jon))?.email).toBeNull();
	});

	it('the address is dropped once the invitation is used or expired', async () => {
		const jon = await user('jon');
		const bob = await user('bob');
		await createWorkspace('team', 'Team', jon);
		const email = (token: string) =>
			(db().prepare('SELECT email FROM invitations WHERE token_hash = ?').get(hashToken(token)) as { email: string | null }).email;
		const used = createInvitation('team', 'reader', jon, 'bob@example.ch');
		acceptInvitation(used, bob.id);
		expect(email(used)).toBeNull();
		const signedUp = createInvitation('team', 'reader', jon, 'nina@example.ch');
		acceptInvitationAsNewUser(signedUp, { email: 'nina@example.ch', name: 'Nina', passwordHash: 'unused' });
		expect(email(signedUp)).toBeNull();
		const expired = createInvitation('team', 'reader', jon, 'ann@example.ch');
		const live = createInvitation('team', 'reader', jon, 'eve@example.ch');
		db().prepare('UPDATE invitations SET expires_at = ? WHERE token_hash = ?').run('2000-01-01T00:00:00.000Z', hashToken(expired));
		createInvitation('team', 'reader', jon); // any new invitation clears expired addresses
		expect(email(expired)).toBeNull();
		expect(email(live)).toBe('eve@example.ch');
	});

	it('an invitation accepts once', async () => {
		const owner = await user('jon');
		const bob = await user('bob');
		const carol = await user('carol');
		await createWorkspace('team', 'Team', owner);
		const token = createInvitation('team', 'editor', owner);
		expect(invitation(token)?.role).toBe('editor');
		expect(acceptInvitation(token, bob.id)).toEqual({ slug: 'team', name: 'Team' });
		expect(roleOf('team', bob.id)).toBe('editor');
		expect(invitation(token)).toBeNull();
		expect(pendingInvitations('team')).toEqual([]);
		expect(() => acceptInvitation(token, carol.id)).toThrow(Conflict);
		expect(roleOf('team', carol.id)).toBeNull();
		expect(invitation('unknown')).toBeNull();
		expect(() => acceptInvitation('unknown', carol.id)).toThrow(new Conflict('invalid invitation'));
	});

	it('signing up on a used link leaves no account', async () => {
		const owner = await user('jon');
		await createWorkspace('team', 'Team', owner);
		const token = createInvitation('team', 'editor', owner);
		const passwordHash = await hashPassword('long enough 1');
		const { user: dan, workspace } = acceptInvitationAsNewUser(token, { email: 'Dan@example.ch', name: 'Dan', passwordHash });
		expect(workspace).toEqual({ slug: 'team', name: 'Team' });
		expect(roleOf('team', dan.id)).toBe('editor');
		expect(() =>
			acceptInvitationAsNewUser(token, { email: 'eve@example.ch', name: 'Eve', passwordHash })
		).toThrow(Conflict);
		expect(userByEmail('eve@example.ch')).toBeNull();
	});

	it('accepting an invitation appends a join event', async () => {
		const jon = await user('jon');
		const bob = await user('bob');
		await createWorkspace('team', 'Team', jon);
		acceptInvitation(createInvitation('team', 'reader', jon), bob.id);
		const passwordHash = await hashPassword('long enough 1');
		const { user: dan } = acceptInvitationAsNewUser(createInvitation('team', 'editor', jon), {
			email: 'dan@example.ch',
			name: 'Dan',
			passwordHash
		});
		expect(db().prepare("SELECT workspace, user_id, author, path FROM events WHERE type = 'join' ORDER BY id").all()).toEqual([
			{ workspace: 'team', user_id: bob.id, author: 'bob', path: '' },
			{ workspace: 'team', user_id: dan.id, author: 'Dan', path: '' }
		]);
	});

	it('joining raises but never lowers a role', async () => {
		const jon = await user('jon');
		const bob = await user('bob');
		await createWorkspace('team', 'Team', jon);
		join('team', bob, 'reader');
		acceptInvitation(createInvitation('team', 'reader', jon), jon.id);
		expect(roleOf('team', jon.id)).toBe('owner');
		acceptInvitation(createInvitation('team', 'editor', jon), bob.id);
		expect(roleOf('team', bob.id)).toBe('editor');
	});

	it('expired invitations are invisible', async () => {
		const jon = await user('jon');
		const bob = await user('bob');
		await createWorkspace('team', 'Team', jon);
		const token = createInvitation('team', 'editor', jon);
		db().prepare("UPDATE invitations SET expires_at = '2000-01-01T00:00:00.000Z'").run();
		expect(invitation(token)).toBeNull();
		expect(() => acceptInvitation(token, bob.id)).toThrow(Conflict);
		expect(roleOf('team', bob.id)).toBeNull();
		expect(pendingInvitations('team')).toEqual([]);
	});

	it('revocation: owner any, editor own only', async () => {
		const jon = await user('jon');
		const bob = await user('bob');
		const carol = await user('carol');
		await createWorkspace('team', 'Team', jon);
		join('team', bob, 'editor');
		join('team', carol, 'editor');
		const byBob = createInvitation('team', 'reader', bob);
		const byCarol = createInvitation('team', 'editor', carol);
		const byJon = createInvitation('team', 'owner', jon);
		expect(pendingInvitations('team').map((i) => [i.id, i.role, i.createdBy]).sort()).toEqual(
			[
				[hashToken(byBob), 'reader', 'bob'],
				[hashToken(byCarol), 'editor', 'carol'],
				[hashToken(byJon), 'owner', 'jon']
			].sort()
		);
		expect(() => revokeInvitation('team', hashToken(byCarol), bob)).toThrow(Forbidden);
		expect(() => revokeInvitation('team', hashToken(byJon), bob)).toThrow(Forbidden);
		revokeInvitation('team', hashToken(byBob), bob);
		revokeInvitation('team', hashToken(byCarol), jon);
		expect(invitation(byBob)).toBeNull();
		expect(invitation(byCarol)).toBeNull();
		expect(pendingInvitations('team').map((i) => i.id)).toEqual([hashToken(byJon)]);
	});
});

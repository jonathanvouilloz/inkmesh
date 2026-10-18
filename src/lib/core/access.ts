import { hashToken, insertUser, newToken, type User } from './accounts.ts';
import type { Actor } from './actor.ts';
import { db, transaction } from './db.ts';
import { ensureWorkspace } from './documents.ts';
import { Conflict, InvalidPath } from './paths.ts';

export type Role = 'reader' | 'editor' | 'owner';
export const ROLES: readonly Role[] = ['reader', 'editor', 'owner'];
export class Forbidden extends Error {}
export type Membership = { workspace: string; userId: number; role: Role };
export type Workspace = { slug: string; name: string };
export type Invitation = { workspace: Workspace; role: Role; createdBy: string; expiresAt: string };

const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;
// Workspaces live at /<slug>, so a slug must not shadow a top-level route.
const RESERVED = new Set(['login', 'logout', 'account', 'invite', 'api', 'mcp', 'assets', 'static', 'favicon.ico']);
const INVITATION_DAYS = 7;
const rank = (role: Role) => ROLES.indexOf(role);
const now = () => new Date().toISOString();

export async function createWorkspace(slug: string, name: string, owner: Actor): Promise<Workspace> {
	if (!SLUG.test(slug) || RESERVED.has(slug)) throw new InvalidPath(slug);
	transaction(() => {
		if (workspace(slug)) throw new Conflict(slug);
		db().prepare('INSERT INTO workspaces (slug, name, created_at) VALUES (?, ?, ?)').run(slug, name, now());
		db()
			.prepare("INSERT INTO memberships (workspace, user_id, role) VALUES (?, ?, 'owner')")
			.run(slug, owner.id);
	});
	try {
		await ensureWorkspace(slug);
	} catch (err) {
		// A row without a usable folder would block the slug forever; cascade drops the membership.
		db().prepare('DELETE FROM workspaces WHERE slug = ?').run(slug);
		throw err;
	}
	return { slug, name };
}

export function workspacesOf(userId: number): (Workspace & { role: Role })[] {
	return db()
		.prepare(
			'SELECT w.slug, w.name, m.role FROM memberships m JOIN workspaces w ON w.slug = m.workspace WHERE m.user_id = ? ORDER BY w.name, w.slug'
		)
		.all(userId) as (Workspace & { role: Role })[];
}

export function workspace(slug: string): Workspace | null {
	return (
		(db().prepare('SELECT slug, name FROM workspaces WHERE slug = ?').get(slug) as Workspace | undefined) ??
		null
	);
}

export function roleOf(slug: string, userId: number): Role | null {
	const row = db()
		.prepare('SELECT role FROM memberships WHERE workspace = ? AND user_id = ?')
		.get(slug, userId) as { role: Role } | undefined;
	return row?.role ?? null;
}

export function assertRole(slug: string, actor: Actor, min: Role): Membership {
	const role = roleOf(slug, actor.id);
	if (!role) throw new Forbidden('not a member');
	if (rank(role) < rank(min)) throw new Forbidden('insufficient role');
	return { workspace: slug, userId: actor.id, role };
}

export type Member = { user: { id: number; name: string; email: string }; role: Role };

export function members(slug: string): Member[] {
	const rows = db()
		.prepare(
			'SELECT u.id, u.email, u.name, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace = ? ORDER BY u.name, u.id'
		)
		.all(slug) as { id: number; email: string; name: string; role: Role }[];
	return rows.map((r) => ({ user: { id: r.id, name: r.name, email: r.email }, role: r.role }));
}

function guardLastOwner(slug: string, userId: number): void {
	if (roleOf(slug, userId) !== 'owner') return;
	const { n } = db()
		.prepare("SELECT count(*) AS n FROM memberships WHERE workspace = ? AND role = 'owner'")
		.get(slug) as { n: number };
	if (n <= 1) throw new Conflict('last owner');
}

export function setRole(slug: string, userId: number, role: Role, by: Actor): void {
	transaction(() => {
		assertRole(slug, by, 'owner');
		if (role !== 'owner') guardLastOwner(slug, userId);
		db()
			.prepare('UPDATE memberships SET role = ? WHERE workspace = ? AND user_id = ?')
			.run(role, slug, userId);
	});
}

export function removeMember(slug: string, userId: number, by: Actor): void {
	transaction(() => {
		assertRole(slug, by, 'owner');
		guardLastOwner(slug, userId);
		db().prepare('DELETE FROM memberships WHERE workspace = ? AND user_id = ?').run(slug, userId);
	});
}

export function createInvitation(slug: string, role: Role, by: Actor): string {
	const { role: own } = assertRole(slug, by, 'editor');
	if (rank(role) > rank(own)) throw new Forbidden('insufficient role');
	const token = newToken();
	const created = new Date();
	const expires = new Date(created.getTime() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
	db()
		.prepare(
			'INSERT INTO invitations (token_hash, workspace, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.run(hashToken(token), slug, role, by.id, created.toISOString(), expires.toISOString());
	return token;
}

export function invitation(token: string): Invitation | null {
	const row = db()
		.prepare(
			`SELECT w.slug, w.name, i.role, u.name AS created_by, i.expires_at FROM invitations i
			 JOIN workspaces w ON w.slug = i.workspace JOIN users u ON u.id = i.created_by
			 WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ?`
		)
		.get(hashToken(token), now()) as
		| { slug: string; name: string; role: Role; created_by: string; expires_at: string }
		| undefined;
	return row
		? {
				workspace: { slug: row.slug, name: row.name },
				role: row.role,
				createdBy: row.created_by,
				expiresAt: row.expires_at
			}
		: null;
}

// Runs inside a transaction.
function claim(token: string, userId: number): Workspace {
	const tokenHash = hashToken(token);
	const at = now();
	const { changes } = db()
		.prepare(
			'UPDATE invitations SET used_by = ?, used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?'
		)
		.run(userId, at, tokenHash, at);
	if (changes === 0) throw new Conflict('invalid invitation');
	const { workspace: slug, role } = db()
		.prepare('SELECT workspace, role FROM invitations WHERE token_hash = ?')
		.get(tokenHash) as { workspace: string; role: Role };
	const current = roleOf(slug, userId);
	if (!current) {
		db()
			.prepare('INSERT INTO memberships (workspace, user_id, role) VALUES (?, ?, ?)')
			.run(slug, userId, role);
	} else if (rank(role) > rank(current)) {
		db()
			.prepare('UPDATE memberships SET role = ? WHERE workspace = ? AND user_id = ?')
			.run(role, slug, userId);
	}
	return workspace(slug)!;
}

export function acceptInvitation(token: string, userId: number): Workspace {
	return transaction(() => claim(token, userId));
}

// One transaction, so a link used up in between leaves no account behind.
export function acceptInvitationAsNewUser(
	token: string,
	input: { email: string; name: string; passwordHash: string }
): { user: User; workspace: Workspace } {
	return transaction(() => {
		const user = insertUser(input);
		return { user, workspace: claim(token, user.id) };
	});
}

export function pendingInvitations(
	slug: string
): { id: string; role: Role; createdBy: string; createdById: number; expiresAt: string }[] {
	return db()
		.prepare(
			`SELECT i.token_hash AS id, i.role, u.name AS createdBy, i.created_by AS createdById, i.expires_at AS expiresAt FROM invitations i
			 JOIN users u ON u.id = i.created_by
			 WHERE i.workspace = ? AND i.used_at IS NULL AND i.expires_at > ? ORDER BY i.created_at`
		)
		.all(slug, now()) as { id: string; role: Role; createdBy: string; createdById: number; expiresAt: string }[];
}

export function revokeInvitation(slug: string, id: string, by: Actor): void {
	const { role } = assertRole(slug, by, 'editor');
	const row = db()
		.prepare('SELECT created_by FROM invitations WHERE token_hash = ? AND workspace = ?')
		.get(id, slug) as { created_by: number } | undefined;
	if (!row) return;
	if (role !== 'owner' && row.created_by !== by.id) throw new Forbidden('insufficient role');
	db().prepare('DELETE FROM invitations WHERE token_hash = ?').run(id);
}

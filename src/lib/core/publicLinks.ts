import fs from 'node:fs/promises';
import { relative } from 'node:path';
import { assertRole, Forbidden, grantRole, type Workspace } from './access.ts';
import { hashToken, insertUser, newToken, userById, type User } from './accounts.ts';
import type { Actor } from './actor.ts';
import { workspaceDir } from './data.ts';
import { db, transaction } from './db.ts';
import { documentFile, readSource, target, walkTree, type TreeNode } from './documents.ts';
import { appendEvent } from './events.ts';
import { extensionType, readImageFile, type ImageType } from './images.ts';
import { imageUrls } from './markdown.ts';
import { Conflict } from './paths.ts';

export type SignupRole = 'reader' | 'editor';
export type PublicLink = {
	id: number;
	path: string | null;
	signupRole: SignupRole | null;
	createdBy: string | null;
	createdAt: string;
};
export type SharedScope = { workspace: Workspace; path: string | null; signupRole: SignupRole | null };

// Every refusal looks the same as an unknown token, so routes answer 404 and reveal nothing.
const outOfScope = () => new Forbidden('not a member');

export async function createPublicLink(
	slug: string,
	path: string | null,
	signupRole: SignupRole | null,
	actor: Actor
): Promise<string> {
	assertRole(slug, actor, 'owner');
	if (path !== null) {
		const root = workspaceDir(slug);
		const file = documentFile(root, path);
		if (!(await fs.stat(file)).isFile()) throw Object.assign(new Error('not a document'), { code: 'ENOENT' });
		path = relative(root, file);
	}
	const token = newToken();
	db()
		.prepare(
			'INSERT INTO public_links (token_hash, workspace, path, signup_role, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.run(hashToken(token), slug, path, signupRole, actor.id, new Date().toISOString());
	return token;
}

export function publicLinks(slug: string, actor: Actor): PublicLink[] {
	assertRole(slug, actor, 'owner');
	return db()
		.prepare(
			`SELECT l.id, l.path, l.signup_role AS signupRole, u.name AS createdBy, l.created_at AS createdAt
			 FROM public_links l LEFT JOIN users u ON u.id = l.created_by WHERE l.workspace = ? ORDER BY l.id`
		)
		.all(slug) as PublicLink[];
}

export function setSignupRole(slug: string, id: number, role: SignupRole | null, actor: Actor): void {
	assertRole(slug, actor, 'owner');
	db().prepare('UPDATE public_links SET signup_role = ? WHERE id = ? AND workspace = ?').run(role, id, slug);
}

export function revokePublicLink(slug: string, id: number, actor: Actor): void {
	assertRole(slug, actor, 'owner');
	db().prepare('DELETE FROM public_links WHERE id = ? AND workspace = ?').run(id, slug);
}

export function sharedScope(token: string): SharedScope | null {
	const row = db()
		.prepare(
			`SELECT w.slug, w.name, l.path, l.signup_role FROM public_links l
			 JOIN workspaces w ON w.slug = l.workspace WHERE l.token_hash = ?`
		)
		.get(hashToken(token)) as
		| { slug: string; name: string; path: string | null; signup_role: SignupRole | null }
		| undefined;
	return row
		? { workspace: { slug: row.slug, name: row.name }, path: row.path, signupRole: row.signup_role }
		: null;
}

function scope(token: string): SharedScope {
	const s = sharedScope(token);
	if (!s) throw outOfScope();
	return s;
}

export async function sharedTree(token: string): Promise<TreeNode[]> {
	const s = scope(token);
	if (s.path !== null) throw outOfScope();
	return walkTree(s.workspace.slug);
}

export async function sharedDocument(
	token: string,
	path: string
): Promise<{ path: string; source: string; frontmatter: string; body: string; hash: string }> {
	const s = scope(token);
	if (s.path !== null && path !== s.path) throw outOfScope();
	return readSource(s.workspace.slug, path);
}

export async function sharedFile(
	token: string,
	path: string
): Promise<{ kind: 'doc'; source: string } | { kind: 'image'; bytes: Buffer; type: ImageType }> {
	if (path.endsWith('.md')) return { kind: 'doc', source: (await sharedDocument(token, path)).source };
	const s = scope(token);
	if (s.path !== null) {
		const { source } = await readSource(s.workspace.slug, s.path);
		if (!referencedImages(s.path, source).has(path)) throw outOfScope();
	}
	return { kind: 'image', ...(await readImageFile(s.workspace.slug, path)) };
}

/** Workspace paths of the images `source` (at `docPath`) shows: relative image URLs and definitions with an image extension. */
// shortcut: a definition used only by a plain link to an image also counts; it is in the served source anyway
function referencedImages(docPath: string, source: string): Set<string> {
	const paths = new Set<string>();
	for (const url of imageUrls(source)) {
		const t = target(url, docPath); // null for absolute URLs; resolved is posix-normalised
		if (t && extensionType(t.resolved)) paths.add(t.resolved);
	}
	return paths;
}

// Runs inside a transaction.
function claimLink(token: string, userId: number): { workspace: Workspace; path: string | null } {
	const s = sharedScope(token);
	if (!s?.signupRole) throw new Conflict('invalid link');
	grantRole(s.workspace.slug, userId, s.signupRole);
	return { workspace: s.workspace, path: s.path };
}

export function joinByLink(token: string, userId: number): { workspace: Workspace; path: string | null } {
	const joined = transaction(() => claimLink(token, userId));
	appendEvent(joined.workspace.slug, { id: userId, name: userById(userId)!.name }, { type: 'join', path: '' });
	return joined;
}

// One transaction, so a link turned off in between leaves no account behind.
export function joinByLinkAsNewUser(
	token: string,
	input: { email: string; name: string; passwordHash: string }
): { user: User; workspace: Workspace; path: string | null } {
	const result = transaction(() => {
		const user = insertUser(input);
		return { user, ...claimLink(token, user.id) };
	});
	appendEvent(result.workspace.slug, { id: result.user.id, name: result.user.name }, { type: 'join', path: '' });
	return result;
}

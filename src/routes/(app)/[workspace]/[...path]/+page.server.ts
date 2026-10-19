import { error, fail, redirect } from '@sveltejs/kit';
import { addComment, listComments, resolveComment } from '#lib/core/comments.ts';
import {
	history,
	readDocument,
	readVersion,
	restoreVersion,
	writeDocument,
	type TreeNode
} from '#lib/core/documents.ts';
import { frontmatterEntries, renderHtml, splitFrontmatter } from '#lib/core/markdown.ts';
import { Conflict, InvalidContent, InvalidPath } from '#lib/core/paths.ts';
import { endSession } from '#lib/core/sessions.ts';
import { requireRole } from '#lib/server/guard.ts';
import { docHref } from '#lib/ui/href.ts';
import type { Actions, PageServerLoad } from './$types';

const notFound = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);
const missing = (err: unknown) => notFound.has((err as { code?: string }).code ?? '');

export const load: PageServerLoad = async ({ params, url, locals, parent }) => {
	const { tree } = await parent();
	const actor = locals.actor!;
	// A folder name never ends in .md, so any other path is a folder of the tree.
	if (!params.path.endsWith('.md')) {
		let nodes: TreeNode[] | undefined = tree;
		for (const segment of params.path.split('/'))
			nodes = nodes?.find((n) => n.kind === 'folder' && n.name === segment)?.children;
		if (!nodes) error(404);
		return { kind: 'folder' as const, path: params.path, nodes };
	}
	const commit = url.searchParams.get('v');
	if (commit !== null) {
		let old;
		try {
			old = await readVersion(params.workspace, params.path, commit, actor);
		} catch (err) {
			// A malformed id is a 400; a bad path or a commit without this document, a 404.
			if (err instanceof InvalidPath) error(err.message === commit ? 400 : 404);
			if (missing(err)) error(404);
			throw err;
		}
		return {
			kind: 'version' as const,
			path: old.path,
			version: {
				commit: old.commit,
				html: renderHtml(old.source),
				entries: frontmatterEntries(splitFrontmatter(old.source).frontmatter)
			},
			history: await history(params.workspace, params.path, actor)
		};
	}
	let doc;
	try {
		doc = await readDocument(params.workspace, params.path, actor);
	} catch (err) {
		if (err instanceof InvalidPath || missing(err)) error(404);
		throw err;
	}
	return {
		kind: 'doc' as const,
		path: doc.path,
		// The editor works in LF; patchMarkdown restores the file's line endings on save.
		body: doc.body.replace(/\r\n/g, '\n'),
		hash: doc.hash,
		entries: frontmatterEntries(doc.frontmatter),
		history: await history(params.workspace, params.path, actor),
		comments: (await listComments(params.workspace, params.path, actor)).map((c) => ({
			...c,
			html: renderHtml(c.body)
		}))
	};
};

export const actions: Actions = {
	save: async ({ params, request, locals }) => {
		// Actions run before the layout load, so the role check is repeated here.
		requireRole(params.workspace, locals, 'editor');
		const form = await request.formData();
		const body = form.get('body');
		const expectedHash = form.get('hash');
		// A missing body must not be read as an empty document.
		if (typeof body !== 'string' || typeof expectedHash !== 'string')
			return fail(400, { invalid: true });
		try {
			// multipart/form-data turns every LF into CRLF; the editor's body is LF, patchMarkdown restores the file's endings.
			const lf = body.replace(/\r\n/g, '\n');
			const { hash } = await writeDocument(params.workspace, params.path, lf, {
				expectedHash,
				actor: locals.actor!
			});
			return { hash };
		} catch (err) {
			if (err instanceof Conflict) return fail(409, { conflict: true });
			if (err instanceof InvalidPath) return fail(400, { invalid: true });
			throw err;
		}
	},
	leave: async ({ params, locals }) => {
		requireRole(params.workspace, locals, 'editor');
		await endSession(params.workspace, params.path, locals.actor!);
		return {};
	},
	comment: async ({ params, request, locals }) => {
		requireRole(params.workspace, locals, 'reader');
		const body = (await request.formData()).get('body');
		if (typeof body !== 'string') return fail(400, { commentError: 'empty' as const, body: '' });
		try {
			await addComment(params.workspace, params.path, body, locals.actor!);
			return {};
		} catch (err) {
			if (err instanceof InvalidContent)
				return fail(400, { commentError: err.message as 'empty' | 'too-large', body });
			if (err instanceof InvalidPath || missing(err)) error(404);
			throw err;
		}
	},
	resolve: async ({ params, request, locals }) => {
		requireRole(params.workspace, locals, 'reader');
		const form = await request.formData();
		const id = form.get('id');
		const resolved = form.get('resolved');
		if (typeof id !== 'string' || (resolved !== '1' && resolved !== '0')) return fail(400);
		try {
			await resolveComment(params.workspace, params.path, id, resolved === '1', locals.actor!);
			return {};
		} catch (err) {
			if (err instanceof InvalidPath || missing(err)) return fail(404);
			throw err;
		}
	},
	restore: async ({ params, request, locals }) => {
		requireRole(params.workspace, locals, 'editor');
		const commit = (await request.formData()).get('commit');
		if (typeof commit !== 'string') error(400);
		try {
			await restoreVersion(params.workspace, params.path, commit, locals.actor!);
		} catch (err) {
			if (err instanceof InvalidPath) error(err.message === commit ? 400 : 404);
			if (missing(err)) error(404);
			throw err;
		}
		redirect(303, docHref(params.workspace, params.path));
	}
};

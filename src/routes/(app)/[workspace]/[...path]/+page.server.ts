import { error, fail } from '@sveltejs/kit';
import { history, readDocument, writeDocument, type TreeNode } from '#lib/core/documents.ts';
import { frontmatterEntries } from '#lib/core/markdown.ts';
import { Conflict, InvalidPath } from '#lib/core/paths.ts';
import { requireRole } from '#lib/server/guard.ts';
import type { Actions, PageServerLoad } from './$types';

const notFound = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

export const load: PageServerLoad = async ({ params, locals, parent }) => {
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
	let doc;
	try {
		doc = await readDocument(params.workspace, params.path, actor);
	} catch (err) {
		if (err instanceof InvalidPath || notFound.has((err as { code?: string }).code ?? ''))
			error(404);
		throw err;
	}
	return {
		kind: 'doc' as const,
		path: doc.path,
		// The editor works in LF; patchMarkdown restores the file's line endings on save.
		body: doc.body.replace(/\r\n/g, '\n'),
		hash: doc.hash,
		entries: frontmatterEntries(doc.frontmatter),
		history: await history(params.workspace, params.path, actor)
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
	}
};

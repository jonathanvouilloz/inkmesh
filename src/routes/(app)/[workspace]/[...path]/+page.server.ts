import { error, fail } from '@sveltejs/kit';
import { currentActor } from '#lib/core/actor.ts';
import { history, readDocument, writeDocument } from '#lib/core/documents.ts';
import { frontmatterEntries } from '#lib/core/markdown.ts';
import { Conflict, InvalidPath } from '#lib/core/paths.ts';
import type { Actions, PageServerLoad } from './$types';

const notFound = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

export const load: PageServerLoad = async ({ params }) => {
	let doc;
	try {
		doc = await readDocument(params.workspace, params.path);
	} catch (err) {
		if (err instanceof InvalidPath || notFound.has((err as { code?: string }).code ?? ''))
			error(404);
		throw err;
	}
	return {
		path: doc.path,
		// The editor works in LF; patchMarkdown restores the file's line endings on save.
		body: doc.body.replace(/\r\n/g, '\n'),
		hash: doc.hash,
		entries: frontmatterEntries(doc.frontmatter),
		history: await history(params.workspace, params.path)
	};
};

export const actions: Actions = {
	save: async ({ params, request }) => {
		// Actions run before the layout load, so the single-workspace guard is repeated here.
		if (params.workspace !== 'demo') error(404);
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
				actor: currentActor()
			});
			return { hash };
		} catch (err) {
			if (err instanceof Conflict) return fail(409, { conflict: true });
			if (err instanceof InvalidPath) return fail(400, { invalid: true });
			throw err;
		}
	}
};

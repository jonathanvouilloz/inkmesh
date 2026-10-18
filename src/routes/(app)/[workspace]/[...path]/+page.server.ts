import { error } from '@sveltejs/kit';
import { history, readDocument } from '#lib/core/documents.ts';
import { frontmatterEntries } from '#lib/core/markdown.ts';
import { InvalidPath } from '#lib/core/paths.ts';
import type { PageServerLoad } from './$types';

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

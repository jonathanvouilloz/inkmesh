import { fail, redirect } from '@sveltejs/kit';
import { createDocument, createFolder, deletePath, folderFields, importDocument, movePath } from '#lib/core/documents.ts';
import { Conflict, InvalidContent, InvalidPath } from '#lib/core/paths.ts';
import { requireRole } from '#lib/server/guard.ts';
import { canonicalQuery, queryFolder } from '#lib/ui/folderQuery.ts';
import { docHref } from '#lib/ui/href.ts';
import type { Actions, PageServerLoad } from './$types';

export type ImportResult = {
	name: string;
	path?: string;
	outcome: 'imported' | 'replaced' | 'exists' | 'invalid' | 'too-large' | 'not-utf8';
};

export const load: PageServerLoad = async ({ params, url, locals, parent }) => {
	const to = canonicalQuery(url.searchParams);
	if (to !== null) redirect(303, url.pathname + to);
	const { tree } = await parent();
	const fields = await folderFields(params.workspace, '', locals.actor!);
	return { query: queryFolder(tree, fields, url.searchParams), fields };
};

const isMissing = (err: unknown) => (err as { code?: unknown }).code === 'ENOENT';

// Actions run before the layout load, so each one repeats the role check.
export const actions: Actions = {
	create: async ({ params, request, locals }) => {
		requireRole(params.workspace, locals, 'editor');
		const path = String((await request.formData()).get('path') ?? '').trim();
		let created: string;
		try {
			created = await createDocument(params.workspace, path, locals.actor!);
		} catch (err) {
			if (err instanceof Conflict) return fail(409, { createError: 'exists' as const, path });
			if (err instanceof InvalidPath) return fail(400, { createError: 'invalid' as const, path });
			throw err;
		}
		redirect(303, docHref(params.workspace, created));
	},

	folder: async ({ params, request, locals }) => {
		requireRole(params.workspace, locals, 'editor');
		const form = await request.formData();
		const parent = String(form.get('parent') ?? '');
		const name = String(form.get('name') ?? '').trim();
		let created: string;
		try {
			// An empty name would resolve to the parent itself; a separator would nest folders.
			if (!name || /[/\\]/.test(name)) throw new InvalidPath(name);
			created = await createFolder(params.workspace, parent ? `${parent}/${name}` : name, locals.actor!);
		} catch (err) {
			if (err instanceof Conflict) return fail(409, { folderError: 'exists' as const, name });
			if (err instanceof InvalidPath) return fail(400, { folderError: 'invalid' as const, name });
			throw err;
		}
		redirect(303, docHref(params.workspace, created));
	},

	import: async ({ params, request, locals }) => {
		requireRole(params.workspace, locals, 'editor');
		const form = await request.formData();
		const folder = String(form.get('folder') ?? '');
		const overwrite = form.get('overwrite') === '1';
		const results: ImportResult[] = [];
		for (const file of form.getAll('files')) {
			if (!(file instanceof File)) continue;
			const { name } = file;
			if (!/\.(md|markdown)$/i.test(name) || /[/\\]/.test(name)) {
				results.push({ name, outcome: 'invalid' });
				continue;
			}
			// Core accepts only a lowercase .md.
			const base = name.replace(/\.(md|markdown)$/i, '.md');
			const path = folder ? `${folder}/${base}` : base;
			try {
				const done = await importDocument(params.workspace, path, new Uint8Array(await file.arrayBuffer()), {
					actor: locals.actor!,
					overwrite
				});
				results.push({ name, path: done.path, outcome: done.replaced ? 'replaced' : 'imported' });
			} catch (err) {
				if (err instanceof Conflict) results.push({ name, path, outcome: 'exists' });
				else if (err instanceof InvalidPath) results.push({ name, outcome: 'invalid' });
				else if (err instanceof InvalidContent)
					results.push({ name, path, outcome: err.message as 'too-large' | 'not-utf8' });
				else throw err;
			}
		}
		return { results };
	},

	move: async ({ params, request, locals }) => {
		requireRole(params.workspace, locals, 'editor');
		const form = await request.formData();
		const from = String(form.get('from') ?? '');
		const to = String(form.get('to') ?? '');
		let moved: string;
		try {
			moved = await movePath(params.workspace, from, to, locals.actor!);
		} catch (err) {
			if (err instanceof Conflict) return fail(409, { moveError: 'exists' as const, from });
			if (err instanceof InvalidPath) return fail(400, { moveError: 'invalid' as const, from });
			if (isMissing(err)) return fail(404, { moveError: 'missing' as const, from });
			throw err;
		}
		redirect(303, docHref(params.workspace, moved));
	},

	delete: async ({ params, request, locals }) => {
		requireRole(params.workspace, locals, 'editor');
		const path = String((await request.formData()).get('path') ?? '');
		try {
			await deletePath(params.workspace, path, locals.actor!);
		} catch (err) {
			if (isMissing(err)) return fail(404, { deleteError: 'missing' as const });
			if (err instanceof InvalidPath) return fail(400, { deleteError: 'invalid' as const });
			throw err;
		}
		const parent = path.split('/').slice(0, -1).join('/');
		redirect(303, parent ? docHref(params.workspace, parent) : `/${params.workspace}`);
	}
};

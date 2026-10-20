import { createContext } from 'svelte';
import { deserialize } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import { page } from '$app/state';
import type { ImportResult } from '../../routes/(app)/[workspace]/+page.server.ts';
import { docHref } from './href.ts';

/** The drag type a tree item carries: its path in the workspace. */
export const PATH_TYPE = 'application/x-inkmesh-path';

/** Set by the document page: `flush` saves the pending edit (throws `unsaved` if it stays unsaved), `reload` shows the body on disk again if it changed. */
export const openDocument: { flush?: () => Promise<void>; reload?: () => void } = {};

/** Set by the workspace layout, which shows the results; used by every drop target and the file picker. */
export const [getDrops, setDrops, hasDrops] = createContext<{
	drop: (folder: string, data: DataTransfer) => void;
	importInto: (folder: string, files: File[]) => void;
}>();

async function post(workspace: string, action: string, body: FormData) {
	const res = await fetch(`/${workspace}?/${action}`, {
		method: 'POST',
		headers: { 'x-sveltekit-action': 'true' },
		body
	});
	return deserialize(await res.text());
}

export async function importFiles(
	workspace: string,
	folder: string,
	files: File[],
	overwrite = false
): Promise<ImportResult[]> {
	const body = new FormData();
	body.set('folder', folder);
	if (overwrite) body.set('overwrite', '1');
	for (const file of files) body.append('files', file);
	const result = await post(workspace, 'import', body);
	if (result.type !== 'success') throw new Error('invalid');
	await invalidateAll();
	return (result.data as { results: ImportResult[] }).results;
}

/** Throws `unsaved`, `exists`, `invalid` or `failed` when nothing moved (or any error the request throws). */
export async function moveItem(workspace: string, from: string, toFolder: string): Promise<void> {
	const to = (toFolder ? `${toFolder}/` : '') + from.split('/').pop();
	// The open page is the item or lies inside it: its URL changes with the move.
	const open = (page.params as { path?: string }).path ?? '';
	const affected = open === from || open.startsWith(`${from}/`);
	// Any open document may be rewritten (its links follow the move): its pending edit is saved first.
	await openDocument.flush?.();
	const body = new FormData();
	body.set('from', from);
	body.set('to', to);
	const result = await post(workspace, 'move', body);
	if (result.type === 'error' || result.type === 'success') throw new Error('failed');
	const refused = result.type === 'failure' && result.data?.moveError;
	// A missing item is already gone: the refresh shows it.
	if (refused && refused !== 'missing') throw new Error(refused === 'exists' ? 'exists' : 'invalid');
	if (!refused && affected) return goto(docHref(workspace, to + open.slice(from.length)), { invalidateAll: true });
	await invalidateAll();
	openDocument.reload?.();
}

let over: HTMLElement | undefined;
function mark(node?: HTMLElement) {
	over?.removeAttribute('data-over');
	over = node;
	node?.setAttribute('data-over', '');
}
const carries = (data: DataTransfer | null): data is DataTransfer =>
	!!data && (data.types.includes('Files') || data.types.includes(PATH_TYPE));

/** An attachment making its element a drop target, outlined (`data-over`) while something is dragged over it. */
export function dropTarget(ondrop: (data: DataTransfer) => void) {
	return (node: HTMLElement) => {
		const onover = (e: DragEvent) => {
			if (!carries(e.dataTransfer)) return;
			e.preventDefault(); // accepts the drop
			e.stopPropagation(); // the innermost folder takes it
			e.dataTransfer.dropEffect = e.dataTransfer.types.includes(PATH_TYPE) ? 'move' : 'copy';
			if (over !== node) mark(node);
		};
		const onleave = (e: DragEvent) => {
			if (over === node && !node.contains(e.relatedTarget as Node | null)) mark();
		};
		const ondropped = (e: DragEvent) => {
			if (!carries(e.dataTransfer)) return;
			e.preventDefault();
			e.stopPropagation();
			mark();
			ondrop(e.dataTransfer);
		};
		node.addEventListener('dragenter', onover);
		node.addEventListener('dragover', onover);
		node.addEventListener('dragleave', onleave);
		node.addEventListener('drop', ondropped);
		return () => {
			node.removeEventListener('dragenter', onover);
			node.removeEventListener('dragover', onover);
			node.removeEventListener('dragleave', onleave);
			node.removeEventListener('drop', ondropped);
			if (over === node) mark();
		};
	};
}

<script lang="ts" module>
	import type { TreeNode } from '#lib/core/documents.ts';

	/** Every folder path of the tree, '' standing for the workspace root. */
	export function folderPaths(nodes: TreeNode[]): string[] {
		const walk = (ns: TreeNode[]): string[] =>
			ns.flatMap((n) => (n.kind === 'folder' ? [n.path, ...walk(n.children ?? [])] : []));
		return ['', ...walk(nodes)];
	}
</script>

<script lang="ts">
	import { afterNavigate, invalidateAll } from '$app/navigation';
	import { enhance, type SubmitFunction } from '$app/forms';
	import type { Role } from '#lib/core/access.ts';
	import { t, type Locale } from '#lib/i18n/index.ts';
	import { docHref } from './href.ts';

	let {
		workspace,
		path,
		kind,
		folders,
		role,
		locale,
		count = 0,
		beforesubmit
	}: {
		workspace: string;
		path: string;
		kind: 'doc' | 'folder';
		folders: string[];
		role: Role;
		locale: Locale;
		/** Documents inside a folder, named in the delete dialog. */
		count?: number;
		beforesubmit?: () => Promise<void>;
	} = $props();

	const base = $derived(path.split('/').pop()!);
	const parent = $derived(path.split('/').slice(0, -1).join('/'));
	const join = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);
	// Not the current parent (nothing would move), not the folder itself nor anything inside it.
	const targets = $derived(
		folders.filter(
			(f) => f !== parent && (kind === 'doc' || (f !== path && !f.startsWith(`${path}/`)))
		)
	);

	let menu: HTMLDetailsElement;
	let renameDialog = $state<HTMLDialogElement>()!;
	let moveDialog = $state<HTMLDialogElement>()!;
	let deleteDialog = $state<HTMLDialogElement>()!;
	let name = $state('');
	let error = $state<'exists' | 'invalid' | 'unsaved'>();
	// Other documents a move would rewrite, asked when a dialog opens: a whole-workspace scan.
	let links = $state(0);
	// A document keeps its extension: the URL tells documents (.md) from folders.
	const renamed = $derived.by(() => {
		const typed = name.trim();
		// Core accepts only a lowercase extension: b.MD and b both become b.md.
		return join(parent, kind === 'doc' ? `${typed.replace(/\.md$/i, '')}.md` : typed);
	});

	function open(dialog: HTMLDialogElement) {
		menu.open = false;
		name = base;
		error = undefined;
		links = 0;
		if (dialog !== deleteDialog)
			fetch(docHref(workspace, `-/links/${path}`))
				.then((res) => (res.ok ? res.json() : { count: 0 }))
				.then((body: { count: number }) => (links = body.count))
				.catch(() => {});
		dialog.showModal();
	}

	afterNavigate(() => (menu.open = false));

	const submit: SubmitFunction = async ({ formElement, cancel }) => {
		// The server would read a separator as a nested path, so a rename refuses it here.
		if (formElement.closest('dialog') === renameDialog && /[/\\]/.test(name)) {
			error = 'invalid';
			return cancel();
		}
		try {
			await beforesubmit?.();
		} catch {
			// The open document's last change is not on disk: moving now would lose it.
			error = 'unsaved';
			return cancel();
		}
		return async ({ result, update }) => {
			const refused = result.type === 'failure' && result.data?.moveError;
			if (refused && refused !== 'missing') {
				error = refused === 'exists' ? 'exists' : 'invalid';
				return;
			}
			formElement.closest('dialog')!.close();
			// A missing item is already gone: refresh to show it.
			if (result.type === 'failure') await invalidateAll();
			else await update();
		};
	};
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && menu.open) {
			menu.open = false;
			menu.querySelector('summary')!.focus();
		}
	}}
	onclick={(e) => {
		if (menu.open && !menu.contains(e.target as Node)) menu.open = false;
	}}
/>

<details class="actions" bind:this={menu}>
	<summary>{t('files.actions', locale)}</summary>
	<ul>
		{#if role !== 'reader'}
			<li>
				<button type="button" onclick={() => open(renameDialog)}>{t('files.rename', locale)}</button>
			</li>
			{#if targets.length}
				<li>
					<button type="button" onclick={() => open(moveDialog)}>{t('files.move', locale)}</button>
				</li>
			{/if}
		{/if}
		{#if kind === 'doc'}
			<li>
				<a href={docHref(workspace, `-/raw/${path}`)} download>{t('files.download', locale)}</a>
			</li>
		{/if}
		{#if role !== 'reader'}
			<li>
				<button type="button" onclick={() => open(deleteDialog)}>{t('files.delete', locale)}</button>
			</li>
		{/if}
	</ul>
</details>

{#if role !== 'reader'}
	{@const back = () => menu.querySelector('summary')!.focus()}
	{@const linked = t(links === 1 ? 'files.linksUpdatedOne' : 'files.linksUpdated', locale, {
		count: String(links)
	})}
	<dialog bind:this={renameDialog} aria-labelledby="rename-title" onclose={back}>
		<form method="POST" action="/{workspace}?/move" use:enhance={submit}>
			<h2 id="rename-title">{t('files.rename', locale)}</h2>
			<input type="hidden" name="from" value={path} />
			<input type="hidden" name="to" value={renamed} />
			<label>
				{t('files.newName', locale)}
				<!-- svelte-ignore a11y_autofocus -->
				<input
					bind:value={name}
					required
					autofocus
					aria-invalid={error && error !== 'unsaved' ? 'true' : undefined}
					aria-describedby={error ? 'rename-error' : undefined}
				/>
			</label>
			{#if error}
				<p id="rename-error" class="error" role="alert">{t(`files.${error}`, locale)}</p>
			{/if}
			{#if links}<p class="note">{linked}</p>{/if}
			<div class="buttons">
				<button>{t('files.rename', locale)}</button>
				<button type="button" onclick={() => renameDialog.close()}>{t('files.cancel', locale)}</button>
			</div>
		</form>
	</dialog>

	<dialog bind:this={moveDialog} aria-labelledby="move-title" onclose={back}>
		<form method="POST" action="/{workspace}?/move" use:enhance={submit}>
			<h2 id="move-title">{t('files.move', locale)}</h2>
			<input type="hidden" name="from" value={path} />
			<!-- The heading names the select: a second "Move to…" label would only repeat it. -->
			<!-- svelte-ignore a11y_autofocus -->
			<select
				name="to"
				autofocus
				aria-labelledby="move-title"
				aria-invalid={error && error !== 'unsaved' ? 'true' : undefined}
				aria-describedby={error ? 'move-error' : undefined}
			>
				{#each targets as folder (folder)}
					<option value={join(folder, base)}>{folder || t('files.root', locale)}</option>
				{/each}
			</select>
			{#if error}
				<p id="move-error" class="error" role="alert">{t(`files.${error}`, locale)}</p>
			{/if}
			{#if links}<p class="note">{linked}</p>{/if}
			<div class="buttons">
				<button>{t('files.moveConfirm', locale)}</button>
				<button type="button" onclick={() => moveDialog.close()}>{t('files.cancel', locale)}</button>
			</div>
		</form>
	</dialog>

	<dialog bind:this={deleteDialog} aria-labelledby="delete-title" onclose={back}>
		<form method="POST" action="/{workspace}?/delete" use:enhance={submit}>
			<h2 id="delete-title">{t('files.delete', locale)}</h2>
			<input type="hidden" name="path" value={path} />
			<p>
				{kind === 'doc'
					? t('files.deleteDoc', locale, { name: base })
					: t(count === 1 ? 'files.deleteFolderOne' : 'files.deleteFolder', locale, {
								name: base,
								count: String(count)
							})}
			</p>
			{#if error}
				<p class="error" role="alert">{t(`files.${error}`, locale)}</p>
			{/if}
			<div class="buttons">
				<button>{t('files.delete', locale)}</button>
				<!-- Keeping is the safe answer, so it takes the focus. -->
				<!-- svelte-ignore a11y_autofocus -->
				<button type="button" autofocus onclick={() => deleteDialog.close()}
					>{t('files.cancel', locale)}</button
				>
			</div>
		</form>
	</dialog>
{/if}

<style>
	/* The header's menu: a summary trigger with a chevron, a flat list dropping 4px under it. */
	/* The trigger takes its host's type (mono in the file strip); the menu and dialogs read in Inter. */
	.actions {
		position: relative;
	}
	summary {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 6px;
		border-radius: var(--radius);
		color: var(--ink);
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary::after {
		content: '';
		width: 5px;
		height: 5px;
		margin-left: 2px;
		border: solid var(--muted);
		border-width: 0 1.5px 1.5px 0;
		transform: translateY(-2px) rotate(45deg);
	}
	summary:hover {
		background: var(--hairline);
	}
	ul {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 3;
		min-width: 160px;
		margin: 0;
		padding: 4px;
		list-style: none;
		font-family: var(--font-text);
		font-size: 13px;
		background: var(--ground);
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
	}
	ul :is(a, button) {
		display: block;
		box-sizing: border-box;
		width: 100%;
		padding: 4px 6px;
		border: 0;
		border-radius: var(--radius);
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}
	ul :is(a, button):hover {
		background: var(--panel);
	}
	dialog {
		box-sizing: border-box;
		width: min(360px, calc(100vw - 32px));
		padding: 24px 16px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font-family: var(--font-text);
		font-size: 13px;
		white-space: normal;
	}
	dialog::backdrop {
		background: rgb(28 28 26 / 0.3);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	p {
		margin: 0;
		text-wrap: pretty;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-weight: 600;
	}
	:is(input, select) {
		padding: 6px 8px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 12.5px;
		font-weight: 400;
	}
	.note {
		color: var(--muted);
	}
	.error {
		color: var(--error);
	}
	.buttons {
		display: flex;
		gap: 8px;
	}
	.buttons button {
		padding: 6px 10px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	:is(summary, button, a, input, select):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	ul :is(a, button):focus-visible {
		outline-offset: -2px;
	}
</style>

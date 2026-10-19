<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { t } from '#lib/i18n/index.ts';
	import Header from '#lib/ui/Header.svelte';
	import Tree from '#lib/ui/Tree.svelte';
	import { PATH_TYPE, dropTarget, importFiles, moveItem, openDocument, setDrops } from '#lib/ui/drop.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	// Typed per route, and the [...path] child route arrives with the document page.
	const current = $derived((page.params as { path?: string }).path);
	let open = $state(false);
	let rail: HTMLElement;
	let opener: HTMLButtonElement;

	async function show() {
		open = true;
		await tick();
		rail.focus();
	}
	function hide() {
		if (!open) return;
		open = false;
		opener.focus();
	}
	afterNavigate(() => {
		open = false;
		notes = [];
	});

	const editable = $derived(data.role !== 'reader');
	const refused = { invalid: 'drop.invalid', 'too-large': 'drop.tooLarge', 'not-utf8': 'drop.notUtf8' } as const;
	// One line per file that was not imported, after a count of those that were.
	let notes = $state<string[]>([]);
	let existing = $state<{ folder: string; files: File[] }>({ folder: '', files: [] });
	let replaceDialog = $state<HTMLDialogElement>()!;
	let focused: Element | null = null;

	// Emptied first, so the same result twice is announced twice.
	async function say(lines: string[]) {
		notes = [];
		await tick();
		notes = lines;
	}

	async function importInto(folder: string, files: File[], overwrite = false) {
		// Replacing the open document: its pending edit is saved first, its editor reloaded after.
		const replacesOpen =
			overwrite &&
			files.some((f) => (folder ? `${folder}/` : '') + f.name.replace(/\.(md|markdown)$/i, '.md') === current);
		let results;
		try {
			if (replacesOpen) await openDocument.flush?.();
		} catch {
			return say([t('files.unsaved', data.locale)]);
		}
		try {
			results = await importFiles(data.workspace, folder, files, overwrite);
		} catch {
			return say([t('drop.failed', data.locale)]);
		}
		if (replacesOpen && results.some((r) => r.outcome === 'replaced' && r.path === current))
			openDocument.reload?.();
		const count = results.filter((r) => r.outcome === 'imported' || r.outcome === 'replaced').length;
		void say([
			...(count
				? [t(count === 1 ? 'drop.importedOne' : 'drop.imported', data.locale, { count: String(count) })]
				: []),
			...results.flatMap((r) => {
				const key = refused[r.outcome as keyof typeof refused];
				return key ? [t(key, data.locale, { name: r.name })] : [];
			})
		]);
		const names = new Set(results.filter((r) => r.outcome === 'exists').map((r) => r.name));
		if (!names.size) return;
		existing = { folder, files: files.filter((f) => names.has(f.name)) };
		focused = document.activeElement;
		replaceDialog.showModal();
	}

	const drops = setDrops({
		importInto: (folder, files) => void importInto(folder, files),
		drop(folder, transfer) {
			if (transfer.files.length) return void importInto(folder, [...transfer.files]);
			const from = transfer.getData(PATH_TYPE);
			// Onto itself, inside itself or where it already is: nothing to move.
			if (!from || folder === from || folder.startsWith(`${from}/`)) return;
			if (folder === from.split('/').slice(0, -1).join('/')) return;
			moveItem(data.workspace, from, folder).catch((err: Error) => {
				const known = ['unsaved', 'exists', 'invalid'] as const;
				const key = known.find((k) => k === err.message) ?? 'failed';
				void say([t(`files.${key}`, data.locale)]);
			});
		}
	});
</script>

<!-- The drawer only exists below 768px; closing it on a wider viewport also lifts inert from main. -->
<!-- A file dropped outside every target would otherwise open in the tab; targets stop the event first. -->
<svelte:window
	onkeydown={(e) => e.key === 'Escape' && hide()}
	ondragover={(e) => e.dataTransfer?.types.includes('Files') && e.preventDefault()}
	ondrop={(e) => e.dataTransfer?.types.includes('Files') && e.preventDefault()}
	onresize={() => {
		if (window.innerWidth >= 768) open = false;
	}}
/>

<Header
	workspaces={data.workspaces}
	current={data.workspace}
	user={data.user}
	locale={data.locale}
>
	<button
		bind:this={opener}
		class="opener"
		aria-expanded={open}
		aria-controls="rail"
		onclick={show}>{t('nav.open', data.locale)}</button
	>
</Header>

<div class="shell">
	<nav
		id="rail"
		class="rail"
		class:open
		tabindex="-1"
		bind:this={rail}
		aria-label={t('nav.documents', data.locale)}
		{@attach editable && dropTarget((transfer) => drops.drop('', transfer))}
	>
		{#if editable}
			<a
				class="members"
				href="/{data.workspace}/members"
				aria-current={page.route.id === '/(app)/[workspace]/members' ? 'page' : undefined}
				>{t('nav.members', data.locale)}</a
			>
			<details class="new" open={!!page.form?.createError}>
				<summary>{t('tree.new', data.locale)}</summary>
				<form method="POST" action="/{data.workspace}?/create">
					<label>
						{t('tree.newPath', data.locale)}
						<input
							name="path"
							placeholder={t('tree.placeholder', data.locale)}
							value={page.form?.path ?? ''}
							required
							aria-invalid={page.form?.createError ? 'true' : undefined}
							aria-describedby={page.form?.createError ? 'new-error' : undefined}
						/>
					</label>
					{#if page.form?.createError}
						<p id="new-error" class="error">
							{t(page.form.createError === 'exists' ? 'tree.exists' : 'tree.badPath', data.locale)}
						</p>
					{/if}
					<button>{t('tree.create', data.locale)}</button>
				</form>
			</details>
		{/if}
		<Tree nodes={data.tree} workspace={data.workspace} {current} {editable} />
	</nav>

	{#if open}
		<div class="backdrop" aria-hidden="true" onclick={hide}></div>
	{/if}

	<main inert={open}>
		<div class="notes" role="status">
			{#each notes as note, i (i)}<p>{note}</p>{/each}
		</div>
		{@render children()}
	</main>
</div>

{#if editable}
	<dialog
		bind:this={replaceDialog}
		aria-labelledby="replace-title"
		onclose={() => (focused as HTMLElement | null)?.focus()}
	>
		<h2 id="replace-title">{t('drop.replaceTitle', data.locale)}</h2>
		<ul>
			{#each existing.files as file, i (i)}<li>{file.name}</li>{/each}
		</ul>
		<div class="buttons">
			<button
				onclick={() => {
					replaceDialog.close();
					void importInto(existing.folder, existing.files, true);
				}}>{t('drop.replace', data.locale)}</button
			>
			<!-- Keeping is the safe answer, so it takes the focus. -->
			<!-- svelte-ignore a11y_autofocus -->
			<button autofocus onclick={() => replaceDialog.close()}>{t('drop.keep', data.locale)}</button>
		</div>
	</dialog>
{/if}

<style>
	/* Below the 44px sticky header, rails and the file strip stick under it. */
	.shell {
		--sticky-top: 44px;
		display: grid;
		grid-template-columns: 240px 1fr;
		min-height: calc(100vh - var(--sticky-top));
	}
	.opener {
		display: none;
	}
	.rail {
		position: sticky;
		top: var(--sticky-top);
		height: calc(100vh - var(--sticky-top));
		box-sizing: border-box;
		overflow-y: auto;
		padding: 16px 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		background: var(--panel);
		border-right: 1px solid var(--hairline);
		font-size: 13px;
	}
	.rail:focus {
		outline: none;
	}
	.rail:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	/* A tree item, outside the tree. */
	.members {
		padding: 3px 6px;
		border-radius: var(--radius);
		color: var(--ink);
		text-decoration: none;
	}
	.members:hover {
		background: var(--hairline);
	}
	.members[aria-current='page'] {
		color: var(--accent);
		font-weight: 500;
	}
	input {
		box-sizing: border-box;
		width: 100%;
		padding: 6px 8px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font: inherit;
	}
	input[name='path'] {
		margin-top: 4px;
		font-family: var(--font-mono);
		font-size: 12.5px;
	}
	summary,
	form button,
	.opener {
		padding: 6px 10px;
		border: 0;
		border-radius: var(--radius);
		background: var(--accent);
		color: #fff;
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	summary {
		list-style: none;
		text-align: center;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 8px;
		color: var(--muted);
	}
	form button {
		align-self: flex-start;
	}
	/* Secondary buttons: tree.new stays the one primary action. */
	form button,
	.opener {
		background: var(--ground);
		color: var(--ink);
		border: 1px solid var(--hairline);
	}
	.error {
		margin: 0;
		color: var(--error);
	}
	:is(a, summary, button, input):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	main {
		min-width: 0;
	}
	/* The rail outside any folder, while a drag would land at the workspace root. */
	.rail:global([data-over]) {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.notes:not(:empty) {
		padding: 8px 32px;
		border-bottom: 1px solid var(--hairline);
		font-size: 13px;
	}
	.notes p {
		margin: 0;
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
	}
	dialog[open] {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	dialog::backdrop {
		background: rgb(28 28 26 / 0.3);
	}
	h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	dialog ul {
		margin: 0;
		padding: 0;
		list-style: none;
		font-family: var(--font-mono);
		font-size: 12.5px;
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

	@media (max-width: 767px) {
		/* The phone header scrolls away, so nothing sticks under it. */
		.shell {
			--sticky-top: 0px;
			display: block;
		}
		.opener {
			display: block;
		}
		.notes:not(:empty) {
			padding: 8px 16px;
		}
		.rail {
			position: fixed;
			inset: 0 auto 0 0;
			z-index: 2;
			width: 240px;
			transform: translateX(-100%);
			visibility: hidden;
		}
		.rail.open {
			transform: none;
			visibility: visible;
		}
		.backdrop {
			position: fixed;
			inset: 0;
			z-index: 1;
			background: rgb(28 28 26 / 0.3);
		}
	}
	@media (max-width: 767px) and (prefers-reduced-motion: no-preference) {
		.rail {
			transition:
				transform var(--ease),
				visibility var(--ease);
		}
		/* Visible at once when opening, so the rail can take focus. */
		.rail.open {
			transition: transform var(--ease);
		}
	}
</style>

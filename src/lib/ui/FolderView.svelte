<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { Role } from '#lib/core/access.ts';
	import type { TreeNode } from '#lib/core/documents.ts';
	import { t, type Locale } from '#lib/i18n/index.ts';
	import FileActions from './FileActions.svelte';
	import { ago } from './time.ts';
	import { docHref } from './href.ts';
	import { dropTarget, getDrops, hasDrops } from './drop.ts';

	let {
		workspace,
		path,
		nodes,
		role,
		locale,
		name,
		folders = []
	}: {
		workspace: string;
		/** '' is the workspace root. */
		path: string;
		nodes: TreeNode[];
		role: Role;
		locale: Locale;
		/** The heading: the folder's name, or the workspace's at the root. */
		name: string;
		/** Every folder path, for the folder's own "Move to…". */
		folders?: string[];
	} = $props();

	const documents = (ns: TreeNode[]): number =>
		ns.reduce((n, c) => n + (c.kind === 'doc' ? 1 : documents(c.children ?? [])), 0);
	let picker = $state<HTMLInputElement>()!;
	// Public pages render this view outside the workspace layout that sets the context (readers only).
	const drops = hasDrops() ? getDrops() : undefined;
</script>

<section
	{@attach role !== 'reader' && dropTarget((data) => drops!.drop(path, data))}
	data-hint={t('drop.here', locale, { folder: name })}
>
	<div class="head">
		<h1>{name}</h1>
		{#if path && role !== 'reader'}
			<FileActions
				{workspace}
				{path}
				kind="folder"
				{folders}
				{role}
				{locale}
				count={documents(nodes)}
			/>
		{/if}
	</div>

	{#if role !== 'reader'}
		<div class="tools">
			<details open={!!page.form?.folderError}>
				<summary>{t('folder.new', locale)}</summary>
				<form method="POST" action="/{workspace}?/folder" use:enhance>
					<input type="hidden" name="parent" value={path} />
					<label>
						{t('folder.name', locale)}
						<input
							name="name"
							required
							value={page.form?.name ?? ''}
							aria-invalid={page.form?.folderError ? 'true' : undefined}
							aria-describedby={page.form?.folderError ? 'folder-error' : undefined}
						/>
					</label>
					{#if page.form?.folderError}
						<p id="folder-error" class="error" role="alert">
							{t(`files.${page.form.folderError as 'exists' | 'invalid'}`, locale)}
						</p>
					{/if}
					<button>{t('tree.create', locale)}</button>
				</form>
			</details>
			<input
				bind:this={picker}
				type="file"
				multiple
				accept=".md,.markdown"
				hidden
				onchange={(e) => {
					drops!.importInto(path, [...e.currentTarget.files!]);
					e.currentTarget.value = ''; // the same file picked again still fires a change
				}}
			/>
			<button type="button" onclick={() => picker.click()}>{t('folder.import', locale)}</button>
		</div>
	{/if}

	{#if nodes.length}
		<ul>
			{#each nodes as node (node.path)}
				<li>
					{#if node.kind === 'folder'}
						<a class="folder" href={docHref(workspace, node.path)}>{node.name}</a>
					{:else}
						<a href={docHref(workspace, node.path)}>{node.title}</a>
						<span class="file">{node.name}</span>
						{#if node.modified}
							<time datetime={node.modified} title={node.modified}
								>{t('folder.modified', locale, { ago: ago(node.modified, locale) })}</time
							>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">{t(role === 'reader' ? 'public.empty' : 'folder.empty', locale)}</p>
	{/if}
</section>

<style>
	section {
		box-sizing: content-box;
		max-width: 72ch;
		margin: 0 auto;
		padding: 32px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		font-size: 13px;
	}
	section:global([data-over]) {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
		border-radius: var(--radius);
	}
	/* First in the section and sticky, so a long folder still shows it. */
	section:global([data-over])::before {
		content: attr(data-hint);
		position: sticky;
		top: var(--sticky-top);
		background: var(--ground);
		color: var(--muted);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	h1 {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
		font-size: 16px;
		font-weight: 600;
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 8px;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 12px;
		padding: 8px 0;
		border-bottom: 1px solid var(--hairline);
	}
	li a {
		color: var(--accent);
		font-weight: 500;
	}
	.folder,
	.file,
	time,
	input[name='name'] {
		font-family: var(--font-mono);
		font-size: 12.5px;
	}
	.file,
	time,
	.empty {
		color: var(--muted);
	}
	time {
		margin-left: auto;
		font-variant-numeric: tabular-nums;
	}
	.empty {
		margin: 0;
	}
	summary,
	button {
		display: inline-block;
		padding: 6px 10px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	summary {
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	details form {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: min(320px, 100%);
		margin-top: 12px;
	}
	details button {
		align-self: flex-start;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-weight: 600;
	}
	input {
		padding: 6px 8px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font-weight: 400;
	}
	.error {
		margin: 0;
		color: var(--error);
	}
	:is(a, summary, button, input):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	@media (max-width: 767px) {
		section {
			padding: 24px 16px;
		}
	}
</style>

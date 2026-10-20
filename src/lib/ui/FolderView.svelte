<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { Role } from '#lib/core/access.ts';
	import type { TreeNode } from '#lib/core/documents.ts';
	import type { Fields } from '#lib/core/markdown.ts';
	import { t, type Locale } from '#lib/i18n/index.ts';
	import FileActions from './FileActions.svelte';
	import { ago } from './time.ts';
	import { docHref } from './href.ts';
	import { dropTarget, getDrops, hasDrops } from './drop.ts';
	import type { FolderListing } from './folderQuery.ts';

	let {
		workspace,
		path,
		nodes,
		role,
		locale,
		name,
		folders = [],
		query,
		fields
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
		/** The listing sorted and filtered from the URL; `nodes` stays the whole folder. */
		query: FolderListing;
		/** Each document's frontmatter fields, for the sorted field's value. */
		fields: Record<string, Fields>;
	} = $props();

	const documents = (ns: TreeNode[]): number =>
		ns.reduce((n, c) => n + (c.kind === 'doc' ? 1 : documents(c.children ?? [])), 0);
	let picker = $state<HTMLInputElement>()!;
	// Public pages render this view outside the workspace layout that sets the context (readers only).
	const drops = hasDrops() ? getDrops() : undefined;
	// The field picked for a new filter, back to "No filter" with each new query (the form is keyed on it too).
	let field: string = $derived(page.url.search && '');
	// A field named like a built-in shadows it, so it is not offered twice.
	const sortFields = $derived(query.fields.filter((f) => f !== 'title' && f !== 'modified'));
	const [whereBefore, whereAfter] = $derived(t('query.where', locale).split('{conditions}'));
</script>

{#snippet mono(text: string, vars: Record<string, string>)}
	{#each text.split(/\{(\w+)\}/) as part, i}{#if i % 2}<span class="mono">{vars[part]}</span>{:else}{part}{/if}{/each}
{/snippet}

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

	{#if query.documents >= 2}
		{#key page.url.search}
			<form class="query" method="GET" aria-label={t('query.label', locale)}>
				{#each query.filters as [k, v]}
					<input type="hidden" name={k} value={v} />
				{/each}
				<label>
					{t('query.sort', locale)}
					<select name="sort">
						<option value="" selected={!query.sort}>{t('query.name', locale)}</option>
						<option value="title" selected={query.sort === 'title'}>{t('query.title', locale)}</option>
						<option value="modified" selected={query.sort === 'modified'}>{t('query.modified', locale)}</option>
						{#each sortFields as f}
							<option class="mono" value={f} selected={query.sort === f}>{f}</option>
						{/each}
					</select>
				</label>
				<label>
					{t('query.order', locale)}
					<select name="order">
						<option value="asc" selected={query.order === 'asc'}>{t('query.asc', locale)}</option>
						<option value="desc" selected={query.order === 'desc'}>{t('query.desc', locale)}</option>
					</select>
				</label>
				{#if query.fields.length}
					<label>
						{t('query.field', locale)}
						<select name="field" onchange={(e) => (field = e.currentTarget.value)}>
							<option value="" selected>{t('query.noFilter', locale)}</option>
							{#each query.fields as f}
								<option class="mono" value={f}>{f}</option>
							{/each}
						</select>
					</label>
					<label>
						{t('query.value', locale)}
						<input
							name="value"
							class="mono"
							maxlength="200"
							autocomplete="off"
							list={field ? `values-${query.fields.indexOf(field)}` : undefined}
						/>
					</label>
					{#each query.fields as f, i}
						<datalist id="values-{i}">
							{#each query.values[f] as v}<option value={v}></option>{/each}
						</datalist>
					{/each}
				{/if}
				<button>{t('query.apply', locale)}</button>
			</form>
		{/key}
	{/if}

	{#if query.filters.length}
		<p class="where">
			{whereBefore}{#each query.filters as [k, v], i}{#if i}{` ${t('query.and', locale)} `}{/if}{@render mono(
					t('query.is', locale),
					{ field: k, value: v }
				)}{/each}{whereAfter}
			<a href={page.url.pathname + query.clear}>{t('query.clear', locale)}</a>
		</p>
	{/if}

	{#if query.nodes.length}
		<ul>
			{#each query.nodes as node (node.path)}
				<li>
					{#if node.kind === 'folder'}
						<a class="folder" href={docHref(workspace, node.path)}>{node.name}</a>
					{:else}
						<a href={docHref(workspace, node.path)}>{node.title}</a>
						{#if query.shown}
							<span class="file">{fields[node.path]?.[query.shown]?.join(', ')}</span>
						{:else}
							<span class="file">{node.name}</span>
						{/if}
						{#if node.modified}
							<time datetime={node.modified} title={node.modified}
								>{t('folder.modified', locale, { ago: ago(node.modified, locale) })}</time
							>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{:else if nodes.length}
		<p class="empty">{t('query.none', locale)}</p>
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
	.query {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 8px;
	}
	/* The mono input is shorter than a select: one height keeps the labels on one line. */
	.query :is(input, select) {
		box-sizing: border-box;
		height: 30px;
	}
	.query input {
		width: 16ch;
	}
	.where {
		margin: -16px 0 0;
		color: var(--muted);
	}
	.where a {
		color: var(--accent);
	}
	.folder,
	.file,
	.mono,
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
	input,
	select {
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
	:is(a, summary, button, input, select):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	@media (max-width: 767px) {
		section {
			padding: 24px 16px;
		}
		.query > * {
			flex: 1 1 100%;
		}
	}
</style>

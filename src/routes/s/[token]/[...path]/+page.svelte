<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import FolderView from '#lib/ui/FolderView.svelte';
	import Rendered from '#lib/ui/Rendered.svelte';
	import { docHref } from '#lib/ui/href.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const base = $derived('s/' + data.token);
	const segments = $derived(data.docPath.split('/'));
	// A workspace link shows the folders above this page; a document link has none to show.
	const crumbs = $derived(
		data.path === null
			? [
					{ name: data.workspaceName, href: '/' + base },
					...segments.slice(0, -1).map((name, i) => ({ name, href: docHref(base, segments.slice(0, i + 1).join('/')) }))
				]
			: []
	);
</script>

<svelte:head>
	<title>{data.kind === 'doc' ? data.title : segments.at(-1)}</title>
</svelte:head>

{#snippet breadcrumb()}
	{#if crumbs.length}
		<nav aria-label={t('public.breadcrumb', data.locale)}>
			<ol>
				{#each crumbs as crumb (crumb.href)}
					<li><a href={crumb.href}>{crumb.name}</a></li>
				{/each}
			</ol>
		</nav>
	{/if}
{/snippet}

{#if data.kind === 'doc'}
	<article>
		{@render breadcrumb()}
		{#if data.heading}<h1>{data.title}</h1>{/if}
		{#if data.entries.length}
			<dl>
				{#each data.entries as [key, value]}
					<dt>{key}</dt>
					<dd>{value}</dd>
				{/each}
			</dl>
		{/if}
		<Rendered html={data.html} />
		<div class="actions">
			<a class="button" href={docHref(base + '/-/raw', data.docPath)}>{t('public.download', data.locale)}</a>
			<a class="button" href={docHref(data.slug, data.docPath)}>{t('public.edit', data.locale)}</a>
			{#if data.signup}
				<a class="button primary" href="/join/{data.token}">{t('public.join', data.locale)}</a>
			{/if}
		</div>
	</article>
{:else}
	<div class="crumbs">{@render breadcrumb()}</div>
	<FolderView
		workspace={base}
		path={data.docPath}
		nodes={data.nodes}
		query={data.query}
		fields={data.fields}
		role="reader"
		locale={data.locale}
		name={segments.at(-1)!}
	/>
{/if}

<style>
	article,
	.crumbs {
		box-sizing: content-box;
		/* FolderView's size, so its 72ch column and this one share a left edge. */
		font-size: 13px;
		max-width: 72ch;
		margin: 0 auto;
		padding: 32px;
	}
	article {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.crumbs {
		padding-bottom: 0;
	}
	/* FolderView's own top padding would double the gap under the breadcrumb. */
	.crumbs + :global(section) {
		padding-top: 16px;
	}
	ol {
		display: flex;
		flex-wrap: wrap;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 13px;
	}
	li + li::before {
		content: '/';
		padding: 0 6px;
		color: var(--muted);
	}
	nav a {
		color: var(--muted);
	}
	h1 {
		margin: 0;
		overflow-wrap: anywhere;
		font-size: 16px;
		font-weight: 600;
	}
	dl {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 4px 12px;
		margin: 0;
		font-size: 13px;
	}
	dt {
		font-family: var(--font-mono);
		font-size: 12.5px;
		color: var(--muted);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding-top: 24px;
		border-top: 1px solid var(--hairline);
		font-size: 13px;
	}
	.button {
		padding: 6px 10px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font-weight: 500;
		text-decoration: none;
	}
	.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}
	a:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	@media (max-width: 767px) {
		article,
		.crumbs {
			padding: 24px 16px;
		}
		.crumbs {
			padding-bottom: 0;
		}
	}
</style>

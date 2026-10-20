<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import { docHref } from '#lib/ui/href.ts';
	import SearchForm from '#lib/ui/SearchForm.svelte';
	import { snippetParts } from '#lib/ui/snippet.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const locale = $derived(data.locale);
	const title = $derived(data.q ? t('search.title', locale, { q: data.q }) : t('search.label', locale));
</script>

<svelte:head><title>{title}</title></svelte:head>

<section>
	<h1>{title}</h1>
	<!-- On phones the header's box is in the drawer: refining a query should not take three steps. -->
	<div class="again"><SearchForm workspace={data.workspace} q={data.q} {locale} button /></div>
	{#if !data.q}
		<p class="muted">{t('search.prompt', locale)}</p>
	{:else if !data.results.length}
		<p class="muted">{t('search.none', locale, { q: data.q })}</p>
	{:else}
		<ul>
			{#each data.results as hit (hit.path)}
				<li>
					<a href={docHref(data.workspace, hit.path)}>{hit.title}</a>
					<span class="path">{hit.path}</span>
					<p>
						{#each snippetParts(hit.snippet) as part, i (i)}{#if part.mark}<mark>{part.text}</mark
								>{:else}{part.text}{/if}{/each}
					</p>
				</li>
			{/each}
		</ul>
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
	h1 {
		margin: 0;
		overflow-wrap: anywhere;
		font-size: 16px;
		font-weight: 600;
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
	a {
		color: var(--accent);
		font-weight: 500;
	}
	a:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.path {
		font-family: var(--font-mono);
		font-size: 12.5px;
		overflow-wrap: anywhere;
	}
	.path,
	.muted {
		color: var(--muted);
	}
	p {
		margin: 0;
	}
	li p {
		flex-basis: 100%;
		overflow-wrap: anywhere;
	}
	mark {
		padding: 0 1px;
		border-radius: 2px;
		background: var(--panel);
		color: var(--ink);
		font-weight: 600;
	}
	.again {
		max-width: 320px;
	}
	@media (min-width: 768px) {
		.again {
			display: none;
		}
	}
	@media (max-width: 767px) {
		section {
			padding: 24px 16px;
		}
	}
</style>

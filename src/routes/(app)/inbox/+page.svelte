<script lang="ts">
	import { enhance } from '$app/forms';
	import type { InboxItem } from '#lib/core/inbox.ts';
	import { t } from '#lib/i18n/index.ts';
	import Header from '#lib/ui/Header.svelte';
	import { docHref } from '#lib/ui/href.ts';
	import { ago } from '#lib/ui/time.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const locale = $derived(data.locale);

	function href(e: InboxItem): string | undefined {
		if (e.type === 'join') return undefined;
		if (e.type === 'delete') return `/${e.workspace}/-/history`;
		return docHref(e.workspace, e.path) + (e.type === 'comment' ? '#comments' : '');
	}
</script>

<svelte:head><title>{t('inbox.title', locale)}</title></svelte:head>

<Header workspaces={data.workspaces} user={data.user} {locale} unread={data.unread} />

<main>
	<h1 id="inbox">{t('inbox.title', locale)}</h1>
	{#if !data.items.length}
		<p class="muted">{t('inbox.empty', locale)}</p>
	{:else}
		{#if data.items.some((e) => e.unread)}
			<form method="POST" action="?/read" use:enhance>
				<input type="hidden" name="upTo" value={data.items[0].id} />
				<button>{t('inbox.markRead', locale)}</button>
			</form>
		{/if}
		<ul aria-labelledby="inbox">
			{#each data.items as e (e.id)}
				<li class:unread={e.unread}>
					<p>
						{#if e.unread}<span class="visually-hidden">{t('inbox.new', locale)}</span>{/if}
						<!-- Paths are in mono: split the sentence around its placeholders. -->
						{#each t(`inbox.${e.type}`, locale).split(/(\{\w+\})/) as part, i (i)}
							{#if part === '{author}'}{e.author}{:else if part === '{workspace}'}{e.workspaceName}{:else if part === '{from}'}<span
									class="mono">{e.from}</span
								>{:else if part === '{path}'}<a class="mono" href={href(e)}>{e.path}</a>{:else}{part}{/if}
						{/each}
						{#if e.agent}<span class="mono muted"> {t('rail.via', locale)} {e.agent}</span>{/if}
					</p>
					<span class="meta muted">
						{e.workspaceName}
						<time class="mono" datetime={e.at} title={e.at}>{ago(e.at, locale)}</time>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main {
		box-sizing: content-box;
		max-width: 72ch;
		margin: 0 auto;
		padding: 32px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		font-size: 13px;
	}
	h1 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	p {
		margin: 0;
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
		justify-content: space-between;
		gap: 4px 12px;
		padding: 8px 0;
		border-bottom: 1px solid var(--hairline);
	}
	li p {
		flex: 1 1 40ch;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.unread {
		font-weight: 600;
	}
	/* Fragment Mono ships only at 400: no synthesised bold. */
	.unread .mono {
		font-weight: 400;
	}
	.meta {
		flex: none;
		display: flex;
		gap: 12px;
		white-space: nowrap;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 12.5px;
		font-variant-numeric: tabular-nums;
	}
	.muted {
		color: var(--muted);
	}
	a {
		color: var(--accent);
	}
	form {
		margin: 0;
	}
	button {
		padding: 6px 10px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	:is(a, button):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	@media (max-width: 767px) {
		main {
			padding: 24px 16px;
		}
	}
</style>

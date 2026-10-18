<script lang="ts">
	import type { Snippet } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import type { Role, Workspace } from '#lib/core/access.ts';
	import type { User } from '#lib/core/accounts.ts';
	import { t, type Locale } from '#lib/i18n/index.ts';

	let {
		workspaces,
		current,
		user,
		role,
		locale,
		children
	}: {
		workspaces: Workspace[];
		current?: string;
		user: User;
		role?: Role;
		locale: Locale;
		/** Rendered first: the workspace shell puts its phone drawer opener here. */
		children?: Snippet;
	} = $props();

	let menu: HTMLDetailsElement;
	let summary: HTMLElement;
	const name = $derived(workspaces.find((w) => w.slug === current)?.name ?? t('nav.workspaces', locale));

	afterNavigate(() => menu && (menu.open = false));
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key !== 'Escape' || !menu.open) return;
		menu.open = false;
		summary.focus();
	}}
	onclick={(e) => {
		if (menu.open && !menu.contains(e.target as Node)) menu.open = false;
	}}
/>

<header>
	{@render children?.()}
	<a class="wordmark" href="/">{t('app.name', locale)}</a>
	<details class="switcher" bind:this={menu}>
		<summary bind:this={summary}>{name}</summary>
		<ul>
			{#each workspaces as w (w.slug)}
				<li>
					<a href="/{w.slug}" aria-current={w.slug === current ? 'page' : undefined}
						>{w.name} <span class="slug">{w.slug}</span></a
					>
				</li>
			{/each}
		</ul>
	</details>
	<span class="end">
		{#if role && role !== 'reader'}
			<a href="/{current}/members">{t('nav.members', locale)}</a>
		{/if}
		<a href="/account">{t('nav.account', locale)}</a>
		<span class="user">{user.name}</span>
		<form method="POST" action="/logout">
			<button>{t('nav.logout', locale)}</button>
		</form>
	</span>
</header>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 12px;
		box-sizing: border-box;
		min-height: 44px;
		padding: 0 16px;
		background: var(--panel);
		border-bottom: 1px solid var(--hairline);
		font-size: 13px;
	}
	a {
		color: var(--ink);
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
	}
	.wordmark {
		font-weight: 600;
	}
	.switcher {
		position: relative;
	}
	summary {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 6px;
		border-radius: var(--radius);
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
		left: 0;
		z-index: 3;
		min-width: 200px;
		max-height: 60vh;
		overflow-y: auto;
		margin: 0;
		padding: 4px;
		list-style: none;
		background: var(--ground);
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
	}
	ul a {
		display: block;
		padding: 4px 6px;
		border-radius: var(--radius);
	}
	ul a:hover {
		background: var(--panel);
		text-decoration: none;
	}
	ul a[aria-current='page'] {
		color: var(--accent);
		font-weight: 500;
	}
	.slug {
		display: block;
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 12.5px;
	}
	.end {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-left: auto;
	}
	.user {
		color: var(--muted);
	}
	form {
		display: contents;
	}
	button {
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}
	button:hover {
		text-decoration: underline;
	}
	:is(a, summary, button):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	ul a:focus-visible {
		outline-offset: -2px;
	}
	@media (min-width: 768px) {
		header {
			position: sticky;
			top: 0;
			z-index: 2;
			height: 44px;
			white-space: nowrap;
		}
	}
	/* Phones: the row wraps instead of overflowing; the name is the first thing to go. */
	@media (max-width: 767px) {
		header {
			flex-wrap: wrap;
			row-gap: 4px;
			padding: 6px 12px;
		}
		.user {
			display: none;
		}
	}
</style>

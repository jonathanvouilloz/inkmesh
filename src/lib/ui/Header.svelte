<script lang="ts">
	import type { Snippet } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import type { Workspace } from '#lib/core/access.ts';
	import type { User } from '#lib/core/accounts.ts';
	import { t, tn, type Locale } from '#lib/i18n/index.ts';
	import SearchForm from './SearchForm.svelte';

	let {
		workspaces,
		current,
		user,
		locale,
		unread,
		search,
		children
	}: {
		workspaces: Workspace[];
		current?: string;
		user: User;
		locale: Locale;
		/** Unread inbox lines, capped at 100 by core. */
		unread: number;
		/** The workspace search box, and the query to show in it. */
		search?: { workspace: string; q: string };
		/** Rendered first: the workspace shell puts its phone drawer opener here. */
		children?: Snippet;
	} = $props();

	// The workspace switcher and the user menu, closed alike by navigation, Escape and an outside click.
	const menus: HTMLDetailsElement[] = [];
	const count = $derived(unread > 99 ? '99+' : String(unread));
	const name = $derived(workspaces.find((w) => w.slug === current)?.name ?? t('nav.workspaces', locale));

	afterNavigate(() => menus.forEach((m) => (m.open = false)));
</script>

<!-- On phones the bar has no room for it: the link moves into the user menu, like Connect. -->
{#snippet inbox(cls?: string)}
	<a
		class={cls}
		href="/inbox"
		aria-current={page.route.id === '/(app)/inbox' ? 'page' : undefined}
		aria-label={unread
			? `${t('nav.inbox', locale)}, ${tn('inbox.unread', unread, locale, count)}`
			: undefined}>{t('nav.inbox', locale)}{#if unread}&nbsp;{count}{/if}</a
	>
{/snippet}

<svelte:window
	onkeydown={(e) => {
		if (e.key !== 'Escape') return;
		for (const m of menus.filter((m) => m.open)) {
			m.open = false;
			m.querySelector('summary')!.focus();
		}
	}}
	onclick={(e) => {
		for (const m of menus) if (m.open && !m.contains(e.target as Node)) m.open = false;
	}}
/>

<header>
	{@render children?.()}
	<a class="wordmark" href="/">{t('app.name', locale)}</a>
	<nav aria-label={t('nav.header', locale)}>
		<details bind:this={menus[0]}>
			<summary><span class="current">{name}</span></summary>
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
		{#if search}
			<div class="search"><SearchForm workspace={search.workspace} q={search.q} {locale} /></div>
		{/if}
		{#if current}
			<a
				class="connect"
				href="/{current}/-/connect"
				aria-current={page.route.id === '/(app)/[workspace]/-/connect' ? 'page' : undefined}
				>{t('nav.connect', locale)}</a
			>
		{/if}
		{@render inbox('inbox')}
		<details class="user" bind:this={menus[1]}>
			<summary
				><span class="current">{user.name}</span>{#if unread}<span class="phone count"
						><span aria-hidden="true">·&nbsp;{count}</span><span class="visually-hidden"
							>, {tn('inbox.unread', unread, locale, count)}</span
						></span
					>{/if}</summary
			>
			<ul>
				{#if current}
					<li class="phone">
						<a
							href="/{current}/-/connect"
							aria-current={page.route.id === '/(app)/[workspace]/-/connect' ? 'page' : undefined}
							>{t('nav.connect', locale)}</a
						>
					</li>
				{/if}
				<li class="phone">{@render inbox()}</li>
				<li><a href="/account">{t('nav.account', locale)}</a></li>
				<li>
					<form method="POST" action="/logout">
						<button>{t('nav.logout', locale)}</button>
					</form>
				</li>
			</ul>
		</details>
	</nav>
</header>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 12px;
		box-sizing: border-box;
		height: 44px;
		padding: 0 16px;
		white-space: nowrap;
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
	nav {
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 0;
		gap: 12px;
	}
	details {
		position: relative;
		min-width: 0;
	}
	.user,
	.inbox,
	.connect {
		margin-left: auto;
	}
	.inbox,
	.connect {
		padding: 3px 6px;
		border-radius: var(--radius);
	}
	:is(.inbox, .connect)[aria-current='page'] {
		color: var(--accent);
		font-weight: 500;
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
	.current {
		max-width: 16rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* The phone bar has no room for the inbox link: its count rides on the user menu instead. */
	.count {
		flex: none;
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
	.user ul {
		right: 0;
		left: auto;
		min-width: 160px;
	}
	ul :is(a, button) {
		display: block;
		box-sizing: border-box;
		width: 100%;
		padding: 4px 6px;
		border-radius: var(--radius);
		text-align: left;
	}
	ul :is(a, button):hover {
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
	form {
		margin: 0;
	}
	button {
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}
	.search {
		width: 200px;
		--search-padding: 4px 8px;
	}
	:is(a, summary, button):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	ul :is(a, button):focus-visible {
		outline-offset: -2px;
	}
	@media (min-width: 768px) {
		header {
			position: sticky;
			top: 0;
			z-index: 2;
		}
		.phone {
			display: none;
		}
		.connect + .inbox,
		.inbox + .user {
			margin-left: 0;
		}
	}
	@media (min-width: 1024px) {
		.search:focus-within {
			width: 280px;
		}
	}
	@media (min-width: 1024px) and (prefers-reduced-motion: no-preference) {
		.search {
			transition: width var(--ease);
		}
	}
	/* Phones: one row; long workspace and user names shrink to an ellipsis, the connect and inbox links move into the user menu. */
	@media (max-width: 767px) {
		/* On phones the search box sits at the top of the drawer instead. */
		.connect,
		.inbox,
		.search {
			display: none;
		}
		header {
			gap: 8px;
			padding: 0 12px;
		}
		nav {
			gap: 8px;
		}
	}
</style>

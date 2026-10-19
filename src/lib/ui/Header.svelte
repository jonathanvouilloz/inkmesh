<script lang="ts">
	import type { Snippet } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import type { Workspace } from '#lib/core/access.ts';
	import type { User } from '#lib/core/accounts.ts';
	import { t, type Locale } from '#lib/i18n/index.ts';

	let {
		workspaces,
		current,
		user,
		locale,
		search,
		children
	}: {
		workspaces: Workspace[];
		current?: string;
		user: User;
		locale: Locale;
		/** The workspace search box, and the query to show in it. */
		search?: { workspace: string; q: string };
		/** Rendered first: the workspace shell puts its phone drawer opener here. */
		children?: Snippet;
	} = $props();

	// The workspace switcher and the user menu, closed alike by navigation, Escape and an outside click.
	const menus: HTMLDetailsElement[] = [];
	const name = $derived(workspaces.find((w) => w.slug === current)?.name ?? t('nav.workspaces', locale));

	afterNavigate(() => menus.forEach((m) => (m.open = false)));
</script>

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
			<form class="search" role="search" action="/{search.workspace}/-/search">
				<input
					type="search"
					name="q"
					value={search.q}
					maxlength="200"
					aria-label={t('search.label', locale)}
					placeholder={t('search.label', locale)}
				/>
			</form>
		{/if}
		{#if current}
			<a
				class="connect"
				href="/{current}/-/connect"
				aria-current={page.route.id === '/(app)/[workspace]/-/connect' ? 'page' : undefined}
				>{t('nav.connect', locale)}</a
			>
		{/if}
		<details class="user" bind:this={menus[1]}>
			<summary><span class="current">{user.name}</span></summary>
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
	.connect {
		margin-left: auto;
	}
	.connect {
		padding: 3px 6px;
		border-radius: var(--radius);
	}
	.connect[aria-current='page'] {
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
	.search input {
		box-sizing: border-box;
		width: 200px;
		padding: 4px 8px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font: inherit;
	}
	:is(a, summary, button, input):focus-visible {
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
		.connect + .user {
			margin-left: 0;
		}
	}
	@media (min-width: 1024px) {
		.search input:focus {
			width: 280px;
		}
	}
	@media (min-width: 1024px) and (prefers-reduced-motion: no-preference) {
		.search input {
			transition: width var(--ease);
		}
	}
	/* Phones: one row; long workspace and user names shrink to an ellipsis, the connect link moves into the user menu. */
	@media (max-width: 767px) {
		/* On phones the search box sits at the top of the drawer instead. */
		.connect,
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

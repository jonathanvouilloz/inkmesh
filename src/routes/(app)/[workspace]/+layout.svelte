<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { t } from '#lib/i18n/index.ts';
	import Header from '#lib/ui/Header.svelte';
	import Tree from '#lib/ui/Tree.svelte';
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
	afterNavigate(() => (open = false));
</script>

<!-- The drawer only exists below 768px; closing it on a wider viewport also lifts inert from main. -->
<svelte:window
	onkeydown={(e) => e.key === 'Escape' && hide()}
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
	<nav id="rail" class="rail" class:open tabindex="-1" bind:this={rail} aria-label={t('nav.documents', data.locale)}>
		{#if data.role !== 'reader'}
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
		<Tree nodes={data.tree} workspace={data.workspace} current={current} />
	</nav>

	{#if open}
		<div class="backdrop" aria-hidden="true" onclick={hide}></div>
	{/if}

	<main inert={open}>{@render children()}</main>
</div>

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

	@media (max-width: 767px) {
		/* The phone header scrolls away, so nothing sticks under it. */
		.shell {
			--sticky-top: 0px;
			display: block;
		}
		.opener {
			display: block;
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

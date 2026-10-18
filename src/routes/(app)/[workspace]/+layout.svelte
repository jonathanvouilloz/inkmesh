<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { t } from '#lib/i18n/index.ts';
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

<svelte:window onkeydown={(e) => e.key === 'Escape' && hide()} />

<div class="shell">
	<header class="topbar">
		<button
			bind:this={opener}
			class="opener"
			aria-label={t('nav.open', data.locale)}
			aria-expanded={open}
			aria-controls="rail"
			onclick={show}>{t('nav.open', data.locale)}</button
		>
		<span class="workspace">{data.workspace}</span>
	</header>

	<nav id="rail" class="rail" class:open tabindex="-1" bind:this={rail}>
		<p class="workspace">{data.workspace}</p>
		<input
			class="search"
			type="search"
			placeholder={t('tree.search', data.locale)}
			aria-label={t('tree.search', data.locale)}
			title={t('tree.searchLater', data.locale)}
			disabled
			aria-disabled="true"
		/>
		<details class="new" open={!!page.form?.createError}>
			<summary>{t('tree.new', data.locale)}</summary>
			<form method="POST" action="/{data.workspace}?/create">
				<label>
					{t('tree.newPath', data.locale)}
					<input
						name="path"
						placeholder="notes/idea.md"
						required
						aria-invalid={page.form?.createError ? 'true' : undefined}
						aria-describedby={page.form?.createError ? 'new-error' : undefined}
					/>
				</label>
				{#if page.form?.createError}
					<p id="new-error" class="error">{t('tree.badPath', data.locale)}</p>
				{/if}
				<button>{t('tree.create', data.locale)}</button>
			</form>
		</details>
		<Tree nodes={data.tree} workspace={data.workspace} current={current} />
	</nav>

	{#if open}
		<div class="backdrop" aria-hidden="true" onclick={hide}></div>
	{/if}

	<main>{@render children()}</main>
</div>

<style>
	.shell {
		display: grid;
		grid-template-columns: 240px 1fr;
		min-height: 100vh;
	}
	.topbar {
		display: none;
	}
	.rail {
		position: sticky;
		top: 0;
		height: 100vh;
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
	.workspace {
		margin: 0;
		font-weight: 600;
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
	.search:disabled {
		cursor: not-allowed;
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
	:is(summary, button, input):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	main {
		min-width: 0;
	}

	@media (max-width: 767px) {
		.shell {
			display: block;
		}
		.topbar {
			display: flex;
			align-items: center;
			gap: 12px;
			height: 48px;
			padding: 0 12px;
			border-bottom: 1px solid var(--hairline);
			font-size: 13px;
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

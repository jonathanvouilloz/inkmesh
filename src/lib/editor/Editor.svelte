<script lang="ts">
	import { onMount } from 'svelte';
	import type { Crepe } from '@milkdown/crepe';
	import '@milkdown/crepe/theme/common/style.css';
	import '@milkdown/crepe/theme/frame.css';
	import { t, type Locale } from '#lib/i18n/index.ts';

	let {
		value = $bindable(),
		raw = false,
		locale,
		onchange
	}: { value: string; raw?: boolean; locale: Locale; onchange: (markdown: string) => void } =
		$props();

	let host: HTMLDivElement;
	// Loaded in onMount: until then (and without JavaScript) the textarea shows the Markdown.
	let load = $state<() => Promise<Crepe>>();

	onMount(() => {
		load = async () => {
			const [{ Crepe }, { crepeFeatures }] = await Promise.all([
				import('@milkdown/crepe'),
				import('./config.ts')
			]);
			const crepe = new Crepe({
				root: host,
				defaultValue: value,
				features: crepeFeatures
			});
			crepe.on((listener) =>
				listener.markdownUpdated((_ctx, markdown) => {
					value = markdown;
					onchange(markdown);
				})
			);
			await crepe.create();
			return crepe;
		};
	});

	// Leaving raw mode destroys and recreates Crepe with the current value: simplest correct way
	// to pick up raw edits. The cleanup is also the onDestroy.
	$effect(() => {
		if (!load || raw) return;
		const ready = load();
		return () => void ready.then((crepe) => crepe.destroy());
	});
</script>

<textarea
	class="raw"
	hidden={!!load && !raw}
	aria-label={t('editor.raw', locale)}
	spellcheck="false"
	bind:value
	oninput={() => onchange(value)}
></textarea>
<div class="rich" hidden={!load || raw} bind:this={host}></div>

<style>
	.raw {
		display: block;
		box-sizing: border-box;
		width: 100%;
		min-height: 70vh;
		padding: 0;
		border: 0;
		resize: vertical;
		background: var(--ground);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 12.5px;
		line-height: 1.7;
		field-sizing: content;
	}
	.raw[hidden],
	.rich[hidden] {
		display: none;
	}
	.raw:focus-visible {
		outline: none;
	}
	.rich :global(.milkdown) {
		--crepe-color-background: var(--ground);
		--crepe-color-on-background: var(--ink);
		--crepe-color-surface: var(--ground);
		--crepe-color-surface-low: var(--panel);
		--crepe-color-on-surface: var(--ink);
		--crepe-color-on-surface-variant: var(--muted);
		--crepe-color-outline: var(--hairline);
		--crepe-color-primary: var(--accent);
		--crepe-color-hover: var(--panel);
		--crepe-color-selected: color-mix(in srgb, var(--accent), transparent 80%);
		--crepe-color-inline-code: var(--ink);
		--crepe-color-inline-area: var(--hairline);
		--crepe-base-font-size: 16.5px;
		--crepe-font-title: var(--font-text);
		--crepe-font-default: var(--font-text);
		--crepe-font-code: var(--font-mono);
		--crepe-shadow-1: none;
		--crepe-shadow-2: none;
	}
	.rich :global(.milkdown .ProseMirror) {
		padding: 0;
	}
	.rich :global(.milkdown .ProseMirror p),
	.rich :global(.milkdown .ProseMirror li) {
		line-height: 1.6;
	}
	.rich :global(.milkdown-toolbar) {
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		box-shadow: 0 2px 2px rgb(28 28 26 / 0.06);
	}
	.rich :global(.milkdown-slash-menu) {
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
	}
</style>

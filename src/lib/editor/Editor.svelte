<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { Crepe } from '@milkdown/crepe';
	import '@milkdown/crepe/theme/common/style.css';
	import '@milkdown/crepe/theme/frame.css';
	import { t, type Locale } from '#lib/i18n/index.ts';

	let {
		value = $bindable(),
		raw = false,
		readonly = false,
		locale,
		onchange,
		onupload
	}: {
		value: string;
		raw?: boolean;
		readonly?: boolean;
		locale: Locale;
		onchange: (markdown: string) => void;
		/** Stores a pasted or dropped image; null when it was refused. Readers get none. */
		onupload?: (file: File) => Promise<{ src: string; alt: string } | null>;
	} = $props();

	let host: HTMLDivElement;
	// Loaded in onMount: until then (and without JavaScript) the textarea shows the Markdown.
	let load = $state<() => Promise<Crepe>>();
	// True once Crepe has rendered: the textarea stays up until then, so there is no blank flash.
	let shown = $state(false);

	onMount(() => {
		load = async () => {
			const [{ Crepe }, { crepeFeatures, inertUnsafeUrls, prefixHeadingIds }, { uploadConfig }] = await Promise.all([
				import('@milkdown/crepe'),
				import('./config.ts'),
				import('@milkdown/kit/plugin/upload')
			]);
			const crepe = new Crepe({
				root: host,
				// untrack: value must never become a dependency of the effect that calls load.
				defaultValue: untrack(() => value),
				features: crepeFeatures,
				// shortcut: only the placeholder is localised; Crepe's toolbar and slash-menu labels stay English, upgrade through featureConfigs when French users ask
				featureConfigs: { [Crepe.Feature.Placeholder]: { text: t('editor.placeholder', locale) } }
			});
			inertUnsafeUrls(crepe);
			prefixHeadingIds(crepe);
			const upload = untrack(() => onupload);
			if (upload)
				crepe.editor.config((ctx) =>
					ctx.update(uploadConfig.key, (prev) => ({
						...prev,
						// Never rejects: the plugin would leave its placeholder behind.
						uploader: async (files, schema) => {
							const images = Array.from(files).filter((file) => file.type.startsWith('image/'));
							const stored = await Promise.all(images.map((file) => upload(file).catch(() => null)));
							return stored.flatMap((image) => (image ? [schema.nodes.image.createAndFill(image)!] : []));
						}
					}))
				);
			crepe.setReadonly(untrack(() => readonly));
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
	// On a fast toggle a new editor may start before the old one finished creating; the old one is
	// destroyed as soon as its create resolves, so two never stay mounted.
	$effect(() => {
		if (!load || raw) return;
		let live = true;
		const ready = load();
		ready.then(() => live && (shown = true), () => {}); // a failed create leaves the textarea up
		return () => {
			live = false;
			shown = false;
			ready.then((crepe) => crepe.destroy(), () => {});
		};
	});
</script>

<textarea
	class="raw"
	hidden={shown && !raw}
	aria-label={t('editor.raw', locale)}
	spellcheck="false"
	{readonly}
	bind:value
	oninput={() => onchange(value)}
></textarea>
<div class="rich" hidden={raw} bind:this={host}></div>

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
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	/* A quiet accent bar in the margin while the page is being edited by keyboard. */
	.rich :global(.milkdown .ProseMirror) {
		margin-left: -16px;
		padding-left: 14px;
		border-left: 2px solid transparent;
	}
	.rich :global(.milkdown .ProseMirror:focus-visible) {
		border-left-color: var(--accent);
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
		padding-top: 0;
		padding-right: 0;
		padding-bottom: 0;
	}
	.rich :global(.milkdown .ProseMirror p),
	.rich :global(.milkdown .ProseMirror li) {
		line-height: 1.6;
	}
	/* --crepe-color-outline (the hairline) also colours Crepe's list markers: give them the muted ink. */
	.rich :global(.milkdown .milkdown-list-item-block li .label-wrapper) {
		color: var(--muted);
	}
	.rich :global(.milkdown .milkdown-list-item-block li .label-wrapper svg) {
		fill: var(--muted);
	}
	.rich :global(.milkdown .milkdown-list-item-block li .label-wrapper .checked svg) {
		fill: var(--accent);
	}
	.rich :global(.milkdown .ProseMirror blockquote::before) {
		width: 2px;
		background: var(--hairline);
	}
	/* Phone readability: code keeps its lines and tables keep their words; both scroll sideways. */
	/* Crepe's static placeholder (shown until CodeMirror mounts) and CodeMirror's lineWrapping both
	   break anywhere; code keeps whole tokens and scrolls sideways instead. */
	.rich :global(.milkdown .milkdown-code-block .cm-content),
	.rich :global(.milkdown .milkdown-code-block .cm-content.cm-lineWrapping),
	.rich :global(.milkdown .milkdown-code-block .milkdown-code-block-placeholder) {
		white-space: pre;
		overflow-wrap: normal;
		word-break: normal;
	}
	.rich :global(.milkdown .milkdown-code-block .cm-scroller),
	.rich :global(.milkdown .milkdown-code-block .milkdown-code-block-placeholder) {
		overflow-x: auto;
	}
	.rich :global(.milkdown .milkdown-table-block table) {
		table-layout: auto;
	}
	/* Phone only: the scroll container would clip Crepe's hover handles, which phones do not use. */
	@media (max-width: 767px) {
		.rich :global(.milkdown .milkdown-table-block .table-wrapper) {
			overflow-x: auto;
		}
	}
	.rich :global(.milkdown .milkdown-table-block :is(th, td)) {
		overflow-wrap: normal;
		font-variant-numeric: tabular-nums;
	}
	.rich :global(.milkdown .milkdown-table-block th) {
		white-space: nowrap;
	}
	/* Desktop has no table scroll: a long unbroken cell value wraps rather than overflow its column. */
	@media (min-width: 768px) {
		.rich :global(.milkdown .milkdown-table-block td) {
			overflow-wrap: anywhere;
		}
	}
	/* shortcut: raw HTML shows as its source, like code; rendering it natively is a later decision */
	.rich :global(.milkdown .ProseMirror span[data-type='html']) {
		padding: 2px 4px;
		border-radius: var(--radius);
		background: var(--panel);
		font-family: var(--font-mono);
		font-size: 12.5px;
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

<script lang="ts">
	import type { HistoryEntry } from '#lib/core/documents.ts';
	import { t, type Locale } from '#lib/i18n/index.ts';

	let {
		entries,
		history,
		locale,
		open = $bindable(),
		opener
	}: {
		entries: [string, string][];
		history: HistoryEntry[];
		locale: Locale;
		open: boolean;
		opener?: HTMLElement;
	} = $props();

	// Mobile bottom sheet: focus its first heading on open, give focus back to the opener on close.
	let aside: HTMLElement;
	$effect(() => {
		if (!open) return;
		aside.querySelector('h2')?.focus();
		return () => opener?.focus();
	});

	const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
		['year', 31536000],
		['month', 2592000],
		['week', 604800],
		['day', 86400],
		['hour', 3600],
		['minute', 60],
		['second', 1]
	];
	function ago(iso: string): string {
		const seconds = (Date.parse(iso) - Date.now()) / 1000;
		const [unit, size] = UNITS.find(([, size]) => Math.abs(seconds) >= size) ?? UNITS[6];
		return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
			Math.round(seconds / size),
			unit
		);
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (open && e.key === 'Escape') open = false;
	}}
	onresize={() => {
		if (open && window.innerWidth >= 768) open = false;
	}}
/>

<aside id="details" class:open bind:this={aside} aria-label={t('rail.open', locale)}>
	{#if entries.length}
		<section>
			<h2 tabindex="-1">{t('rail.file', locale)}</h2>
			<dl>
				{#each entries as [key, value]}
					<dt>{key}</dt>
					<dd>{value}</dd>
				{/each}
			</dl>
		</section>
	{/if}
	<section>
		<h2 tabindex="-1">{t('rail.history', locale)}</h2>
		<ol>
			{#each history.slice(0, 5) as entry (entry.hash)}
				<li>
					<span>{entry.name}</span>
					{#if entry.agent}<span class="mono">{t('rail.via', locale)} {entry.agent}</span>{/if}
					<time class="mono" datetime={entry.date} title={entry.date}>{ago(entry.date)}</time>
					<p>{entry.message}</p>
				</li>
			{/each}
		</ol>
	</section>
</aside>

<style>
	aside {
		box-sizing: border-box;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		background: var(--panel);
		border-left: 1px solid var(--hairline);
		font-size: 13px;
	}
	@media (min-width: 1024px) {
		aside {
			position: sticky;
			top: 0;
			height: 100vh;
			overflow-y: auto;
		}
	}
	h2:focus {
		outline: none;
	}
	h2:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	h2 {
		margin: 0 0 8px;
		font-size: 13px;
		font-weight: 600;
	}
	dl {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 4px 12px;
		margin: 0;
	}
	dt,
	.mono {
		font-family: var(--font-mono);
		font-size: 12.5px;
		color: var(--muted);
	}
	time {
		font-variant-numeric: tabular-nums;
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		gap: 0 6px;
	}
	p {
		flex-basis: 100%;
		margin: 0;
		color: var(--muted);
	}
	@media (max-width: 1023px) {
		aside {
			border-left: 0;
			border-top: 1px solid var(--hairline);
			padding: 16px 32px;
		}
	}
	@media (max-width: 767px) {
		aside {
			position: fixed;
			inset: auto 0 0 0;
			z-index: 1;
			max-height: 60vh;
			overflow-y: auto;
			padding: 16px;
			border-radius: var(--radius) var(--radius) 0 0;
			transform: translateY(100%);
			visibility: hidden;
		}
		aside.open {
			transform: none;
			visibility: visible;
		}
	}
	@media (max-width: 767px) and (prefers-reduced-motion: no-preference) {
		aside {
			transition:
				transform var(--ease),
				visibility var(--ease);
		}
		aside.open {
			transition: transform var(--ease);
		}
	}
</style>

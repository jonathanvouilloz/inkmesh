<script lang="ts">
	import { t, type Locale } from '#lib/i18n/index.ts';

	let {
		path,
		locale,
		raw = $bindable(),
		details = $bindable()
	}: { path: string; locale: Locale; raw: boolean; details: boolean } = $props();
</script>

<div class="strip" data-testid="file-strip">
	<span class="path"><bdi>{path}</bdi></span>
	<span class="state" role="status" aria-live="polite"></span>
	<button
		class="details"
		aria-expanded={details}
		aria-controls="details"
		onclick={() => (details = !details)}>{t('rail.open', locale)}</button
	>
	<button aria-pressed={raw} onclick={() => (raw = !raw)}>{t('strip.raw', locale)}</button>
</div>

<style>
	.strip {
		display: flex;
		align-items: center;
		gap: 12px;
		box-sizing: border-box;
		height: 36px;
		padding: 0 32px;
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--ground);
		border-bottom: 1px solid var(--hairline);
		font-family: var(--font-mono);
		font-size: 12.5px;
		white-space: nowrap;
	}
	/* Truncated from the left so the file name stays visible; bdi keeps the path itself left-to-right. */
	.path {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		direction: rtl;
		text-align: left;
	}
	.state {
		color: var(--muted);
	}
	button {
		padding: 2px 8px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}
	button[aria-pressed='true'] {
		border-color: var(--accent);
		color: var(--accent);
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.details {
		display: none;
	}
	@media (max-width: 767px) {
		.strip {
			padding: 0 16px;
		}
		.details {
			display: block;
		}
	}
	@media (prefers-reduced-motion: no-preference) {
		button {
			transition:
				color var(--ease),
				border-color var(--ease);
		}
	}
</style>

<script lang="ts" module>
	export type SaveState = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';
</script>

<script lang="ts">
	import { t, type Locale } from '#lib/i18n/index.ts';

	let {
		path,
		locale,
		saveState,
		raw = $bindable(),
		details = $bindable()
	}: {
		path: string;
		locale: Locale;
		saveState: SaveState;
		raw: boolean;
		details: boolean;
	} = $props();
</script>

<div class="strip" data-testid="file-strip">
	<span class="path"><bdi>{path}</bdi></span>
	<span class="state {saveState}" role="status" aria-live="polite"
		>{saveState === 'idle' ? '' : t(`save.${saveState}`, locale)}</span
	>
	<span class="actions">
		<button
			class="details"
			aria-expanded={details}
			aria-controls="details"
			onclick={() => (details = !details)}>{t('rail.open', locale)}</button
		>
		<button aria-pressed={raw} onclick={() => (raw = !raw)}>{t('strip.raw', locale)}</button>
	</span>
</div>

<style>
	/* Path left, save state centred, buttons right; the buttons column never shrinks below its content. */
	.strip {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(max-content, 1fr);
		align-items: center;
		gap: 12px;
		box-sizing: border-box;
		min-height: 36px;
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
		overflow: hidden;
		text-overflow: ellipsis;
		direction: rtl;
		text-align: left;
	}
	.state {
		color: var(--muted);
		text-align: center;
	}
	.actions {
		display: flex;
		gap: 8px;
		justify-self: end;
	}
	.saved {
		color: var(--ok);
	}
	.conflict {
		color: var(--warn);
		/* The full sentence wraps instead of pushing the buttons off a narrow strip. */
		white-space: normal;
	}
	.error {
		color: var(--error);
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
		/* The save state takes its own row, so a long sentence never squeezes the path. */
		.strip {
			grid-template-columns: minmax(0, 1fr) max-content;
			grid-template-areas: 'path actions' 'state state';
			row-gap: 0;
			padding: 0 16px;
		}
		.path {
			grid-area: path;
		}
		.actions {
			grid-area: actions;
		}
		.state {
			grid-area: state;
			text-align: left;
		}
		.conflict {
			padding-bottom: 8px;
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

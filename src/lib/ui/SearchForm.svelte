<script lang="ts">
	import { t, type Locale } from '#lib/i18n/index.ts';

	// The workspace search: in the header, in the phone drawer and on the results page. Works without JavaScript.
	let { workspace, q, locale, button = false }: { workspace: string; q: string; locale: Locale; button?: boolean } =
		$props();
</script>

<form role="search" action="/{workspace}/-/search">
	<input
		type="search"
		name="q"
		value={q}
		maxlength="200"
		aria-label={t('search.label', locale)}
		placeholder={t('search.placeholder', locale)}
	/>
	{#if button}<button>{t('search.submit', locale)}</button>{/if}
</form>

<style>
	form {
		display: flex;
		gap: 8px;
		margin: 0;
	}
	input {
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		padding: var(--search-padding, 6px 8px);
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font: inherit;
	}
	button {
		padding: 6px 10px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	:is(input, button):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>

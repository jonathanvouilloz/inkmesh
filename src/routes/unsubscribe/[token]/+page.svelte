<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = $derived(data.locale);
</script>

<svelte:head>
	<title>{data.valid ? t('unsubscribe.title', locale) : t('unsubscribe.invalid', locale)}</title>
</svelte:head>

<main>
	{#if data.valid}
		<h1>{t('unsubscribe.title', locale)}</h1>
		{#if form?.done}
			<p role="status">{t('unsubscribe.done', locale)}</p>
		{:else}
			<form method="POST">
				<p>{t('unsubscribe.text', locale)}</p>
				<button>{t('unsubscribe.confirm', locale)}</button>
			</form>
		{/if}
	{:else}
		<h1>{t('unsubscribe.invalid', locale)}</h1>
	{/if}
</main>

<style>
	main {
		box-sizing: border-box;
		max-width: 360px;
		margin: 0 auto;
		padding: 24px 16px;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 24px;
		font-size: 13px;
	}
	h1 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		text-wrap: balance;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	p {
		margin: 0;
		text-wrap: pretty;
	}
	button {
		align-self: flex-start;
		padding: 6px 10px;
		border: 0;
		border-radius: var(--radius);
		background: var(--accent);
		color: #fff;
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>

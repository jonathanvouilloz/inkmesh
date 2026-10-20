<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = $derived(data.locale);
	const usable = $derived(data.email && !form?.expired);
	const [before, after] = $derived(t('loginLink.continue', locale).split('{email}'));
</script>

<svelte:head>
	<title>{usable ? t('login.title', locale) : t('loginLink.expired', locale)}</title>
</svelte:head>

<main>
	{#if usable}
		<h1>{t('login.title', locale)}</h1>
		<form method="POST">
			<p>{before}<span class="mono">{data.email}</span>{after}</p>
			<button>{t('login.submit', locale)}</button>
		</form>
	{:else}
		<h1>{t('loginLink.expired', locale)}</h1>
		<a href="/login?method=link">{t('loginLink.again', locale)}</a>
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
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 12.5px;
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
	a {
		align-self: flex-start;
		color: var(--accent);
	}
	:is(button, a):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>

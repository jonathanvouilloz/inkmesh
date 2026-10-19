<script lang="ts">
	import { page } from '$app/state';
	import { t } from '#lib/i18n/index.ts';

	const locale = $derived(page.data.locale);
	const message = $derived(t(page.status === 400 ? 'consent.invalid' : 'error.generic', locale));
</script>

<svelte:head><title>{message}</title></svelte:head>

<main>
	<h1>{message}</h1>
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
		font-size: 13px;
	}
	h1 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		text-wrap: pretty;
	}
</style>

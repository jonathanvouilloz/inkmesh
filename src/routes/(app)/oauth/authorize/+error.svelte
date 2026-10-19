<script lang="ts">
	import { page } from '$app/state';
	import { t } from '#lib/i18n/index.ts';

	const locale = $derived(page.data.locale);
</script>

<main>
	<p role="alert">{t(page.status === 400 ? 'consent.invalid' : 'error.generic', locale)}</p>
</main>

<style>
	main {
		box-sizing: border-box;
		max-width: 480px;
		margin: 0 auto;
		padding: 24px 16px;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		font-size: 13px;
	}
	p {
		margin: 0;
		text-wrap: pretty;
	}
</style>

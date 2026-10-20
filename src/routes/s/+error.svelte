<script lang="ts">
	import { page } from '$app/state';
	import { t } from '#lib/i18n/index.ts';

	const locale = $derived(page.data.locale);
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<h1>{t(page.status === 404 ? 'error.notFound' : 'error.generic', locale)}</h1>

<style>
	h1 {
		margin: 0;
		padding: 24px;
		font-size: 16px;
		font-weight: 600;
	}
</style>

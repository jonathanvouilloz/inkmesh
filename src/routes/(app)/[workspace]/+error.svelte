<script lang="ts">
	import { page } from '$app/state';
	import { t } from '#lib/i18n/index.ts';

	const locale = $derived(page.data.locale);
</script>

<div class="error">
	<h1>{t(page.status === 404 ? 'error.notFound' : 'error.generic', locale)}</h1>
	<a href="/{page.params.workspace}">{t('error.back', locale)}</a>
</div>

<style>
	.error {
		padding: 24px;
		font-size: 13px;
	}
	h1 {
		margin: 0 0 12px;
		font-size: 16px;
		font-weight: 600;
	}
	a {
		color: var(--accent);
	}
	a:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>

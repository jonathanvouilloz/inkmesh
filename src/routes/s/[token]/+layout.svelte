<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<!-- Not a link: a visitor has no app home to go back to. -->
<header><span>{t('app.name', data.locale)}</span></header>
<main>
	{@render children()}
</main>

<style>
	header {
		display: flex;
		align-items: center;
		box-sizing: border-box;
		height: 44px;
		padding: 0 16px;
		background: var(--panel);
		border-bottom: 1px solid var(--hairline);
		font-size: 13px;
		font-weight: 600;
	}
	@media (max-width: 767px) {
		header {
			padding: 0 12px;
		}
	}
</style>

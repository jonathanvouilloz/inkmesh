<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<p class="empty">{t('empty.pick', data.locale)}</p>

<style>
	.empty {
		margin: 0;
		padding: 24px;
		color: var(--muted);
		font-size: 13px;
	}
</style>

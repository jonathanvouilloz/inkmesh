<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h1>{t('app.name', data.locale)}</h1>

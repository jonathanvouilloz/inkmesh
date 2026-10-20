<script lang="ts">
	import FolderView from '#lib/ui/FolderView.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.workspaceName}</title>
</svelte:head>

<FolderView
	workspace="s/{data.token}"
	path=""
	nodes={data.nodes}
	query={data.query}
	role="reader"
	locale={data.locale}
	name={data.workspaceName}
/>

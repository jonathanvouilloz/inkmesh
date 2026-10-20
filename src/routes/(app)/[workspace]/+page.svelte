<script lang="ts">
	import FolderView from '#lib/ui/FolderView.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<FolderView
	workspace={data.workspace}
	path=""
	nodes={data.tree}
	query={data.query}
	role={data.role}
	locale={data.locale}
	name={data.workspaces.find((w) => w.slug === data.workspace)?.name ?? data.workspace}
/>

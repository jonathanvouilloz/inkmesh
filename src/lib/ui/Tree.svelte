<script lang="ts">
	import type { TreeNode } from '#lib/core/documents.ts';
	import Tree from './Tree.svelte';

	let { nodes, workspace, current }: { nodes: TreeNode[]; workspace: string; current?: string } =
		$props();
	const href = (path: string) => `/${workspace}/${path.split('/').map(encodeURIComponent).join('/')}`;
</script>

<ul>
	{#each nodes as node (node.path)}
		<li>
			{#if node.kind === 'folder'}
				<details open>
					<summary>{node.name}</summary>
					<Tree nodes={node.children ?? []} {workspace} {current} />
				</details>
			{:else}
				<a href={href(node.path)} aria-current={node.path === current ? 'page' : undefined}
					>{node.title}</a
				>
			{/if}
		</li>
	{/each}
</ul>

<style>
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	ul :global(ul) {
		padding-left: 12px;
	}
	summary,
	a {
		display: block;
		padding: 3px 6px;
		border-radius: var(--radius);
	}
	summary {
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 12.5px;
		cursor: pointer;
	}
	a {
		color: var(--ink);
		text-decoration: none;
	}
	a:hover,
	summary:hover {
		background: var(--hairline);
	}
	a[aria-current='page'] {
		color: var(--accent);
		font-weight: 500;
	}
	:is(a, summary):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
</style>

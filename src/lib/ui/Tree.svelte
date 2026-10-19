<script lang="ts">
	import type { TreeNode } from '#lib/core/documents.ts';
	import Tree from './Tree.svelte';
	import { docHref } from './href.ts';

	let { nodes, workspace, current }: { nodes: TreeNode[]; workspace: string; current?: string } =
		$props();
</script>

<ul>
	{#each nodes as node (node.path)}
		<li>
			{#if node.kind === 'folder'}
				<details open>
					<summary
						><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"
							><path d="M4.5 2.5 8 6l-3.5 3.5" /></svg
						><a
							href={docHref(workspace, node.path)}
							aria-current={node.path === current ? 'page' : undefined}>{node.name}</a
						></summary
					>
					<Tree nodes={node.children ?? []} {workspace} {current} />
				</details>
			{:else}
				<a href={docHref(workspace, node.path)} aria-current={node.path === current ? 'page' : undefined}
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
	li > a {
		display: block;
		padding: 3px 6px;
		border-radius: var(--radius);
	}
	summary {
		display: flex;
		align-items: center;
		gap: 4px;
		list-style: none;
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 12.5px;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	svg {
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
	}
	details[open] > summary svg {
		transform: rotate(90deg);
	}
	@media (prefers-reduced-motion: no-preference) {
		svg {
			transition: transform var(--ease);
		}
	}
	a {
		color: var(--ink);
		text-decoration: none;
	}
	/* The folder name opens the folder view; the caret around it still folds the folder. */
	summary a {
		color: inherit;
	}
	li > a:hover,
	summary:hover {
		background: var(--hairline);
	}
	a[aria-current='page'] {
		color: var(--accent);
		font-weight: 500;
	}
	summary a[aria-current='page'] {
		color: var(--accent);
	}
	:is(a, summary):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
</style>

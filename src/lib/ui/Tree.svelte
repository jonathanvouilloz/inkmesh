<script lang="ts">
	import type { TreeNode } from '#lib/core/documents.ts';
	import { SvelteSet } from 'svelte/reactivity';
	import Tree from './Tree.svelte';
	import { docHref } from './href.ts';
	import { PATH_TYPE, dropTarget, getDrops } from './drop.ts';

	let {
		nodes,
		workspace,
		current,
		editable = false
	}: { nodes: TreeNode[]; workspace: string; current?: string; editable?: boolean } = $props();
	const { drop } = getDrops();
	// Folders start open; the ones folded here, by path.
	const closed = new SvelteSet<string>();
	// Editors drag an item by its link onto a folder.
	const drag = (path: string) => (e: DragEvent) => {
		e.dataTransfer!.setData(PATH_TYPE, path);
		e.dataTransfer!.effectAllowed = 'move';
	};
</script>

<ul>
	{#each nodes as node (node.path)}
		<li>
			{#if node.kind === 'folder'}
				<!-- A fold button beside the folder link: a link inside a summary would be nested interactive content. -->
				<div {@attach editable && dropTarget((data) => drop(node.path, data))}>
					<div class="row">
						<button
							type="button"
							aria-expanded={!closed.has(node.path)}
							aria-labelledby="tree-{node.path}"
							onclick={() => (closed.has(node.path) ? closed.delete(node.path) : closed.add(node.path))}
							><svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"
								><path d="M4.5 2.5 8 6l-3.5 3.5" /></svg
							></button
						><a
							id="tree-{node.path}"
							href={docHref(workspace, node.path)}
							aria-current={node.path === current ? 'page' : undefined}
							ondragstart={editable ? drag(node.path) : undefined}>{node.name}</a
						>
					</div>
					{#if !closed.has(node.path)}
						<Tree nodes={node.children ?? []} {workspace} {current} {editable} />
					{/if}
				</div>
			{:else}
				<a
					href={docHref(workspace, node.path)}
					aria-current={node.path === current ? 'page' : undefined}
					ondragstart={editable ? drag(node.path) : undefined}>{node.title}</a
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
	li > a {
		display: block;
		padding: 3px 6px;
		border-radius: var(--radius);
	}
	.row {
		display: flex;
		align-items: center;
		border-radius: var(--radius);
		color: var(--muted);
		font-family: var(--font-mono);
		font-size: 12.5px;
	}
	button {
		display: flex;
		padding: 3px 0 3px 6px;
		border: 0;
		border-radius: var(--radius);
		background: none;
		color: inherit;
		cursor: pointer;
	}
	.row a {
		flex: 1;
		padding: 3px 6px 3px 4px;
	}
	svg {
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
	}
	button[aria-expanded='true'] svg {
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
	/* The folder name opens the folder view; the caret beside it folds the folder. */
	.row a {
		color: inherit;
	}
	li > a:hover,
	.row:hover {
		background: var(--hairline);
	}
	a[aria-current='page'] {
		color: var(--accent);
		font-weight: 500;
	}
	.row a[aria-current='page'] {
		color: var(--accent);
	}
	/* The folder a drag would land in, with everything already inside it. */
	div:global([data-over]) {
		border-radius: var(--radius);
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	:is(a, button):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
</style>

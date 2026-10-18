<script lang="ts">
	import Editor from '#lib/editor/Editor.svelte';
	import FileStrip from '#lib/ui/FileStrip.svelte';
	import RightRail from '#lib/ui/RightRail.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let raw = $state(false);
	let details = $state(false);
</script>

<div class="document">
	<div class="centre">
		<FileStrip path={data.path} locale={data.locale} bind:raw bind:details />
		<article>
			<!-- Keyed so another document gets a fresh editor with its own body. -->
			{#key data.path}
				<!-- shortcut: changes are dropped until autosave lands in Task 8 -->
				<Editor value={data.body} {raw} locale={data.locale} onchange={() => {}} />
			{/key}
		</article>
	</div>
	<RightRail entries={data.entries} history={data.history} locale={data.locale} open={details} />
</div>

<style>
	.document {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 280px;
		min-height: 100vh;
	}
	.centre {
		min-width: 0;
	}
	article {
		box-sizing: content-box;
		max-width: 72ch;
		margin: 0 auto;
		padding: 32px;
		font-size: 16.5px;
		line-height: 1.6;
	}
	@media (max-width: 1023px) {
		.document {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto auto;
			min-height: 0;
		}
	}
	@media (max-width: 767px) {
		article {
			padding: 16px;
		}
	}
</style>

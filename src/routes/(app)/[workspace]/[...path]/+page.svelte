<script lang="ts">
	import Editor from '#lib/editor/Editor.svelte';
	import FileActions, { folderPaths } from '#lib/ui/FileActions.svelte';
	import FileStrip from '#lib/ui/FileStrip.svelte';
	import FolderView from '#lib/ui/FolderView.svelte';
	import { openDocument } from '#lib/ui/drop.ts';
	import RightRail from '#lib/ui/RightRail.svelte';
	import { untrack } from 'svelte';
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { SaveState } from '#lib/ui/FileStrip.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let raw = $state(false);
	let details = $state(false);
	let opener = $state<HTMLButtonElement>();

	// One autosave per opened document: debounced, never overlapping, stopped by a conflict.
	class Autosave {
		value = $state('');
		state = $state<SaveState>('idle');
		dirty = false;
		#url: string;
		#hash: string;
		#timer: ReturnType<typeof setTimeout> | undefined;
		#inFlight: Promise<void> | undefined;

		constructor(url: string, value: string, hash: string) {
			this.#url = url;
			this.value = value;
			this.#hash = hash;
		}

		get busy() {
			return this.dirty || !!this.#inFlight;
		}

		change(value: string) {
			this.value = value;
			this.dirty = true; // in conflict too: autosave stays stopped, beforeunload warns
			if (this.state === 'conflict') return;
			this.state = 'idle';
			clearTimeout(this.#timer);
			this.#timer = setTimeout(() => this.save(), 2000);
		}

		async save({ reload = true } = {}) {
			clearTimeout(this.#timer);
			while (this.#inFlight) await this.#inFlight;
			if (!this.dirty || this.state === 'conflict') return;
			this.dirty = false;
			this.state = 'saving';
			this.#inFlight = this.#post(reload);
			await this.#inFlight;
			this.#inFlight = undefined;
		}

		async #post(reload: boolean) {
			const body = new FormData();
			body.set('body', this.value);
			body.set('hash', this.#hash);
			try {
				const res = await fetch(this.#url, {
					method: 'POST',
					headers: { 'x-sveltekit-action': 'true' },
					body
				});
				const result = deserialize(await res.text());
				if (result.type === 'success') {
					this.#hash = (result.data as { hash: string }).hash;
					this.state = this.dirty ? 'idle' : 'saved';
					if (reload) void invalidateAll(); // refreshes the History block; the document key below keeps this autosave
				} else if (result.type === 'failure' && result.status === 409) {
					this.dirty = true; // the rejected edit is unsaved: leaving must warn
					this.state = 'conflict';
				}
				else throw result;
			} catch {
				this.dirty = true; // retried with the next change; beforeunload still warns
				this.state = 'error';
			}
		}
	}

	// The action URL is fixed per document, so a save flushed after navigating still targets it.
	// Untracked: page.url also changes on hash navigation, which reloads no data and must keep this autosave.
	// Keyed on the document, not on data: a reload of the same document (after a save) keeps it.
	// Readers never save: the save action would answer 403 anyway.
	const readonly = $derived(data.role === 'reader');
	const doc = $derived(`${data.workspace}/${data.path}`);
	const isDoc = $derived(data.kind === 'doc');
	const autosave = $derived.by(() => {
		void doc;
		if (readonly || !isDoc) return undefined;
		return untrack(() =>
			data.kind === 'doc' ? new Autosave(`${page.url.pathname}?/save`, data.body, data.hash) : undefined
		);
	});
	const folders = $derived(folderPaths(data.tree));
	// Run before this document moves, from its menu or by a drag in the tree.
	async function flush() {
		// No reload: the old path's data would race the move and could 404.
		await autosave?.save({ reload: false });
		if (autosave?.dirty) throw new Error('unsaved');
	}
	$effect(() => {
		openDocument.flush = flush;
		return () => (openDocument.flush = undefined);
	});
	// Leaving a document (in-app navigation or unmount) saves its pending change right away.
	$effect(() => {
		const current = autosave;
		return () => void current?.save();
	});
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (autosave?.busy) event.preventDefault();
	}}
/>

{#if data.kind === 'folder'}
	<!-- Keyed so another folder starts with its forms closed and empty. -->
	{#key doc}
		<FolderView
			workspace={data.workspace}
			path={data.path}
			nodes={data.nodes}
			role={data.role}
			locale={data.locale}
			name={data.path.split('/').pop()!}
			{folders}
		/>
	{/key}
{:else}
	<div class="document">
		<div class="centre">
			<FileStrip
				path={data.path}
				locale={data.locale}
				saveState={autosave?.state ?? 'idle'}
				{readonly}
				bind:raw
				bind:details
				bind:opener
			>
				<FileActions
					workspace={data.workspace}
					path={data.path}
					kind="doc"
					{folders}
					role={data.role}
					locale={data.locale}
					beforesubmit={flush}
				/>
			</FileStrip>
			<article>
				<!-- Keyed so another document gets a fresh editor with its own body. -->
				{#key doc}
					<Editor
						value={autosave?.value ?? data.body}
						{raw}
						{readonly}
						locale={data.locale}
						onchange={(markdown) => autosave?.change(markdown)}
					/>
				{/key}
			</article>
		</div>
		<RightRail
			entries={data.entries}
			history={data.history}
			locale={data.locale}
			bind:open={details}
			{opener}
		/>
	</div>
{/if}

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

<script lang="ts">
	import Editor from '#lib/editor/Editor.svelte';
	import FileStrip from '#lib/ui/FileStrip.svelte';
	import RightRail from '#lib/ui/RightRail.svelte';
	import { deserialize } from '$app/forms';
	import { page } from '$app/state';
	import type { SaveState } from '#lib/ui/FileStrip.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let raw = $state(false);
	let details = $state(false);

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
			if (this.state === 'conflict') return;
			this.dirty = true;
			this.state = 'idle';
			clearTimeout(this.#timer);
			this.#timer = setTimeout(() => this.save(), 2000);
		}

		async save() {
			clearTimeout(this.#timer);
			while (this.#inFlight) await this.#inFlight;
			if (!this.dirty || this.state === 'conflict') return;
			this.dirty = false;
			this.state = 'saving';
			this.#inFlight = this.#post();
			await this.#inFlight;
			this.#inFlight = undefined;
		}

		async #post() {
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
				} else if (result.type === 'failure' && result.status === 409) this.state = 'conflict';
				else throw result;
			} catch {
				this.dirty = true; // retried with the next change; beforeunload still warns
				this.state = 'error';
			}
		}
	}

	// The action URL is fixed per document, so a save flushed after navigating still targets it.
	const autosave = $derived(new Autosave(`${page.url.pathname}?/save`, data.body, data.hash));
	// Leaving a document (in-app navigation or unmount) saves its pending change right away.
	$effect(() => {
		const current = autosave;
		return () => void current.save();
	});
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (autosave.busy) event.preventDefault();
	}}
/>

<div class="document">
	<div class="centre">
		<FileStrip
			path={data.path}
			locale={data.locale}
			saveState={autosave.state}
			bind:raw
			bind:details
		/>
		<article>
			<!-- Keyed so another document gets a fresh editor with its own body. -->
			{#key `${data.workspace}/${data.path}`}
				<Editor
					value={autosave.value}
					{raw}
					locale={data.locale}
					onchange={(markdown) => autosave.change(markdown)}
				/>
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

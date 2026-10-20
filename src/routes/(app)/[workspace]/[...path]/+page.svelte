<script lang="ts">
	import Editor from '#lib/editor/Editor.svelte';
	import { t } from '#lib/i18n/index.ts';
	import Comments from '#lib/ui/Comments.svelte';
	import FileActions, { folderPaths } from '#lib/ui/FileActions.svelte';
	import FileStrip from '#lib/ui/FileStrip.svelte';
	import FolderView from '#lib/ui/FolderView.svelte';
	import { openDocument } from '#lib/ui/drop.ts';
	import { docHref } from '#lib/ui/href.ts';
	import Rendered from '#lib/ui/Rendered.svelte';
	import RightRail from '#lib/ui/RightRail.svelte';
	import { untrack } from 'svelte';
	import { deserialize, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { SaveState } from '#lib/ui/FileStrip.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let raw = $state(false);
	let details = $state(false);
	let opener = $state<HTMLButtonElement>();
	let confirm = $state<HTMLDialogElement>();
	// A refused image, announced in the strip until the next edit or upload.
	let imageMessage = $state('');

	async function upload(file: File) {
		imageMessage = '';
		const body = new FormData();
		body.set('doc', data.path);
		body.set('file', file);
		let reason: 'image.tooLarge' | 'image.notImage' | 'image.network' = 'image.network';
		try {
			const res = await fetch(`/${data.workspace}/-/images`, { method: 'POST', body });
			if (res.status === 201) return (await res.json()) as { src: string; alt: string };
			if (res.status === 413) reason = 'image.tooLarge';
			else if (res.status === 400) reason = 'image.notImage';
		} catch {}
		imageMessage = t('image.failed', data.locale, { reason: t(reason, data.locale) });
		return null;
	}

	// One autosave per opened document: debounced, never overlapping, stopped by a conflict.
	class Autosave {
		value = $state('');
		state = $state<SaveState>('idle');
		dirty = false;
		readonly url: string;
		#hash: string;
		#timer: ReturnType<typeof setTimeout> | undefined;
		#inFlight: Promise<void> | undefined;

		constructor(url: string, value: string, hash: string) {
			this.url = url;
			this.value = value;
			this.#hash = hash;
		}

		get hash() {
			return this.#hash;
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
				const res = await fetch(`${this.url}?/save`, {
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

		// Ends the editing session: the server commits it. Best effort, the idle timer commits it anyway.
		leave() {
			fetch(`${this.url}?/leave`, {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body: new FormData()
			}).catch(() => {});
		}
	}

	// The document URL is fixed per autosave, so a save flushed after navigating still targets it.
	// Untracked: page.url also changes on hash navigation, which reloads no data and must keep this autosave.
	// Keyed on the document, not on data: a reload of the same document (after a save) keeps it.
	// Readers never save: the save action would answer 403 anyway.
	const readonly = $derived(data.role === 'reader');
	const doc = $derived(`${data.workspace}/${data.path}`);
	const isDoc = $derived(data.kind === 'doc');
	// A refused image belongs to its document: the message does not follow to the next one.
	$effect(() => {
		void doc;
		imageMessage = '';
	});
	// Bumped when an import or a move rewrote this document on disk: a fresh autosave and editor show it.
	let version = $state(0);
	const autosave = $derived.by(() => {
		void doc;
		void version;
		if (readonly || !isDoc) return undefined;
		return untrack(() =>
			data.kind === 'doc' ? new Autosave(page.url.pathname, data.body, data.hash) : undefined
		);
	});
	const folders = $derived(folderPaths(data.tree));
	// Run before this document moves (from its menu or by a drag in the tree) and before any drag-move.
	async function flush() {
		// No reload: the old path's data would race the move and could 404.
		await autosave?.save({ reload: false });
		if (autosave?.dirty) throw new Error('unsaved');
	}
	$effect(() => {
		openDocument.flush = flush;
		// An edit typed during the rewrite keeps its editor, and its save meets the conflict state.
		openDocument.reload = () => {
			if (data.kind === 'doc' && data.hash !== autosave?.hash && !autosave?.busy) version++;
		};
		return () => {
			openDocument.flush = undefined;
			openDocument.reload = undefined;
		};
	});
	// Leaving a document (in-app navigation or unmount) saves its pending change right away, then ends its session.
	$effect(() => {
		const current = autosave;
		return () => void current?.save().then(() => current.leave());
	});
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (autosave?.busy) event.preventDefault();
	}}
	onpagehide={() => {
		if (autosave) navigator.sendBeacon(`${autosave.url}?/leave`, new FormData());
	}}
/>

{#if data.kind === 'folder'}
	<!-- Keyed so another folder starts with its forms closed and empty. -->
	{#key doc}
		<FolderView
			workspace={data.workspace}
			path={data.path}
			nodes={data.nodes}
			query={data.query}
			role={data.role}
			locale={data.locale}
			name={data.path.split('/').pop()!}
			{folders}
		/>
	{/key}
{:else}
	<div class="document">
		<div class="centre">
			{#if data.kind === 'version'}
				{@const short = data.version.commit.slice(0, 7)}
				{@const entry = data.history.find((e) => e.hash.startsWith(data.version.commit))}
				<FileStrip
					path={data.path}
					locale={data.locale}
					saveState="idle"
					version={short}
					bind:raw
					bind:details
					bind:opener
				/>
				<article>
					<div class="version">
						<p>
							{#if entry}
								<!-- The date is a timestamp, in mono: split the sentence around it. -->
								{@const [before, after] = t('version.of', data.locale, {
									author: entry.agent ? `${entry.name} ${t('rail.via', data.locale)} ${entry.agent}` : entry.name
								}).split('{date}')}
								{before}<time class="mono" datetime={entry.date} title={entry.date}
									>{new Date(entry.date).toLocaleString(data.locale, {
										dateStyle: 'long',
										timeStyle: 'short',
										timeZone: 'UTC'
									})} UTC</time
								>{after}
							{:else}
								<span class="mono">{t('version.label', data.locale, { hash: short })}</span>
							{/if}
						</p>
						<span class="actions">
							<a href={docHref(data.workspace, data.path)}>{t('version.current', data.locale)}</a>
							{#if !readonly}
								<button class="primary" type="button" onclick={() => confirm?.showModal()}
									>{t('version.restore', data.locale)}</button
								>
							{/if}
						</span>
					</div>
					<Rendered html={data.version.html} />
				</article>
				{#if !readonly}
					<dialog bind:this={confirm} aria-labelledby="restore-title">
						<form method="POST" action="?/restore" use:enhance>
							<h2 id="restore-title">{t('version.restore', data.locale)}</h2>
							<input type="hidden" name="commit" value={data.version.commit} />
							<p>{t('version.confirm', data.locale)}</p>
							<div class="buttons">
								<button class="primary">{t('version.restore', data.locale)}</button>
								<!-- Keeping the current text is the safe answer, so it takes the focus. -->
								<!-- svelte-ignore a11y_autofocus -->
								<button type="button" autofocus onclick={() => confirm?.close()}
									>{t('files.cancel', data.locale)}</button
								>
							</div>
						</form>
					</dialog>
				{/if}
			{:else}
				<FileStrip
					path={data.path}
					locale={data.locale}
					saveState={autosave?.state ?? 'idle'}
					{readonly}
					message={imageMessage}
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
					<!-- Keyed so another document, or the same one replaced, gets a fresh editor with its own body. -->
					{#key `${doc}:${version}`}
						<Editor
							value={autosave?.value ?? data.body}
							{raw}
							{readonly}
							locale={data.locale}
							onchange={(markdown) => {
								imageMessage = '';
								autosave?.change(markdown);
							}}
							onupload={readonly ? undefined : upload}
						/>
					{/key}
					<Comments comments={data.comments} locale={data.locale} />
				</article>
			{/if}
		</div>
		<RightRail
			entries={data.kind === 'version' ? data.version.entries : data.entries}
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
	.version {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 16px;
		margin-bottom: 24px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--hairline);
		font-size: 13px;
	}
	.version p {
		margin: 0;
		color: var(--muted);
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 12.5px;
		font-variant-numeric: tabular-nums;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	a {
		color: var(--accent);
	}
	button {
		padding: 6px 10px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
	}
	:is(a, button):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	dialog {
		box-sizing: border-box;
		width: min(360px, calc(100vw - 32px));
		padding: 24px 16px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font-size: 13px;
	}
	dialog::backdrop {
		background: rgb(28 28 26 / 0.3);
	}
	dialog form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	dialog h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	dialog p {
		margin: 0;
		text-wrap: pretty;
	}
	.buttons {
		display: flex;
		gap: 8px;
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

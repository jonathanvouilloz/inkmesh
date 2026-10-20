<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { Comment } from '#lib/core/comments.ts';
	import { t, tn, type Locale } from '#lib/i18n/index.ts';
	import Rendered from './Rendered.svelte';
	import { ago } from './time.ts';

	type Item = Comment & { name: string; agent?: string; html: string };
	let { comments, locale }: { comments: Item[]; locale: Locale } = $props();

	const open = $derived(comments.filter((c) => !c.resolved));
	const resolved = $derived(comments.filter((c) => c.resolved));
	// From the action's result, so a refused comment shows its error and keeps its text without JavaScript too.
	const commentError = $derived(page.form?.commentError as 'empty' | 'too-large' | undefined);
	let heading: HTMLElement;
</script>

{#snippet item(c: Item, resolve: boolean)}
	<li>
		<p class="meta">
			<span>{c.name}</span>
			{#if c.agent}<span class="mono">{t('rail.via', locale)} {c.agent}</span>{/if}
			<time class="mono" datetime={c.at} title={c.at}>{ago(c.at, locale)}</time>
		</p>
		<Rendered html={c.html} />
		<!-- The clicked button leaves the list: focus goes back to the section heading. -->
		<form
			method="POST"
			action="?/resolve"
			use:enhance={() =>
				async ({ update }) => {
					await update();
					heading.focus();
				}}
		>
			<input type="hidden" name="id" value={c.id} />
			<input type="hidden" name="resolved" value={resolve ? '1' : '0'} />
			<button>{t(resolve ? 'comments.resolve' : 'comments.reopen', locale)}</button>
		</form>
	</li>
{/snippet}

<!-- Unkeyed: a hand-edited thread may repeat an id, and a duplicate key would break the page. -->
<section id="comments" aria-labelledby="comments-title">
	<h2 id="comments-title" tabindex="-1" bind:this={heading}>{t('comments.title', locale)}</h2>
	{#if open.length}
		<ol>
			{#each open as c}{@render item(c, true)}{/each}
		</ol>
	{:else}
		<p class="empty">{t('comments.empty', locale)}</p>
	{/if}
	{#if resolved.length}
		<details>
			<summary>{tn('comments.resolved', resolved.length, locale)}</summary>
			<ol>
				{#each resolved as c}{@render item(c, false)}{/each}
			</ol>
		</details>
	{/if}
	<form class="add" method="POST" action="?/comment" use:enhance>
		<label for="comment-body">{t('comments.add', locale)}</label>
		<textarea
			id="comment-body"
			name="body"
			rows="3"
			value={commentError ? (page.form?.body as string) : ''}
			aria-invalid={commentError ? 'true' : undefined}
			aria-describedby={commentError ? 'comment-error' : undefined}
		></textarea>
		{#if commentError}
			<p id="comment-error" class="error" role="alert">
				{t(commentError === 'empty' ? 'comments.needed' : 'comments.tooLong', locale)}
			</p>
		{/if}
		<button>{t('comments.submit', locale)}</button>
	</form>
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-top: 48px;
		padding-top: 24px;
		border-top: 1px solid var(--hairline);
		font-size: 13px;
		line-height: 1.5;
	}
	h2:focus {
		outline: none;
	}
	h2:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
	}
	ol {
		display: flex;
		flex-direction: column;
		gap: 20px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		--rendered-size: 15px;
	}
	li :global(.rendered) {
		align-self: stretch;
	}
	p {
		margin: 0;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0 6px;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 12.5px;
		color: var(--muted);
	}
	time {
		font-variant-numeric: tabular-nums;
	}
	.empty {
		color: var(--muted);
	}
	details ol {
		margin-top: 16px;
	}
	summary {
		width: fit-content;
		color: var(--muted);
		cursor: pointer;
	}
	.add {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
	}
	label {
		font-weight: 600;
	}
	textarea {
		box-sizing: border-box;
		width: 100%;
		min-height: 80px;
		padding: 6px 8px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		font-size: 15px;
		resize: vertical;
	}
	textarea[aria-invalid='true'] {
		border-color: var(--error);
	}
	.error {
		color: var(--error);
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
	.add button {
		margin-top: 4px;
	}
	:is(button, textarea, summary):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>

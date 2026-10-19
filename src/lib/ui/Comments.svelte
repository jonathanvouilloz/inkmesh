<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Comment } from '#lib/core/comments.ts';
	import { t, type Locale } from '#lib/i18n/index.ts';
	import Rendered from './Rendered.svelte';
	import { ago } from './time.ts';

	let { comments, locale }: { comments: Array<Comment & { html: string }>; locale: Locale } = $props();

	const open = $derived(comments.filter((c) => !c.resolved));
	const resolved = $derived(comments.filter((c) => c.resolved));
	let commentError = $state<'empty' | 'too-large'>();
</script>

{#snippet item(c: Comment & { html: string }, resolve: boolean)}
	{@const at = c.author.indexOf(' via ')}
	<li>
		<p class="meta">
			<span>{at < 0 ? c.author : c.author.slice(0, at)}</span>
			{#if at >= 0}<span class="mono">{t('rail.via', locale)} {c.author.slice(at + 5)}</span>{/if}
			<time class="mono" datetime={c.at} title={c.at}>{ago(c.at, locale)}</time>
		</p>
		<Rendered html={c.html} />
		<form method="POST" action="?/resolve" use:enhance>
			<input type="hidden" name="id" value={c.id} />
			<input type="hidden" name="resolved" value={resolve ? '1' : '0'} />
			<button>{t(resolve ? 'comments.resolve' : 'comments.reopen', locale)}</button>
		</form>
	</li>
{/snippet}

<section id="comments" aria-labelledby="comments-title">
	<h2 id="comments-title">{t('comments.title', locale)}</h2>
	{#if open.length}
		<ol>
			{#each open as c (c.id)}{@render item(c, true)}{/each}
		</ol>
	{:else}
		<p class="empty">{t('comments.empty', locale)}</p>
	{/if}
	{#if resolved.length}
		<details>
			<summary>{t('comments.resolved', locale, { count: String(resolved.length) })}</summary>
			<ol>
				{#each resolved as c (c.id)}{@render item(c, false)}{/each}
			</ol>
		</details>
	{/if}
	<form
		class="add"
		method="POST"
		action="?/comment"
		use:enhance={() =>
			async ({ result, update }) => {
				commentError =
					result.type === 'failure' ? (result.data?.commentError as typeof commentError) : undefined;
				// A refused comment keeps its text in the field.
				await update({ reset: result.type === 'success' });
			}}
	>
		<label for="comment-body">{t('comments.add', locale)}</label>
		<textarea
			id="comment-body"
			name="body"
			rows="3"
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

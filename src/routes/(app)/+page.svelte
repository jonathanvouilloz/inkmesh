<script lang="ts">
	import { untrack } from 'svelte';
	import { t } from '#lib/i18n/index.ts';
	import Header from '#lib/ui/Header.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	// A refused create reloads the page (no enhance), so the initial form values are the ones to keep.
	let name = $state(untrack(() => form?.name ?? ''));
	let slug = $state(untrack(() => form?.slug ?? ''));
	// The slug follows the name until the user types in it.
	let slugEdited = $state(untrack(() => !!form?.slug));
	const suggest = (s: string) =>
		s
			.normalize('NFD')
			.replace(/\p{M}/gu, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '');
</script>

<svelte:head><title>{t('home.title', data.locale)}</title></svelte:head>

<Header workspaces={data.workspaces} user={data.user} locale={data.locale} />

<main>
	<h1>{t('home.title', data.locale)}</h1>
	{#if data.workspaces.length}
		<ul>
			{#each data.workspaces as w (w.slug)}
				<li>
					<a href="/{w.slug}">{w.name}</a>
					<span class="slug">{w.slug}</span>
					<span class="role">{t(`role.${w.role}`, data.locale)}</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">{t('home.empty', data.locale)}</p>
	{/if}

	{#if data.user.admin}
		<details class="new" open={!!form?.createError}>
			<summary>{t('home.create', data.locale)}</summary>
			<form method="POST" action="?/create">
				<label>
					{t('home.name', data.locale)}
					<input
						name="name"
						required
						maxlength="80"
						aria-invalid={form?.createError === 'name' ? 'true' : undefined}
						aria-describedby={form?.createError === 'name' ? 'create-error' : undefined}
						bind:value={name}
						oninput={() => slugEdited || (slug = suggest(name))}
					/>
				</label>
				<label>
					{t('home.slug', data.locale)}
					<input
						name="slug"
						required
						bind:value={slug}
						oninput={() => (slugEdited = slug !== '')}
						aria-invalid={form?.createError && form.createError !== 'name' ? 'true' : undefined}
						aria-describedby={form?.createError && form.createError !== 'name' ? 'create-error' : undefined}
					/>
				</label>
				{#if form?.createError}
					<p id="create-error" class="error">
						{t(`home.${({ name: 'nameBad', exists: 'exists', slug: 'slugBad' } as const)[form.createError]}`, data.locale)}
					</p>
				{/if}
				<button>{t('tree.create', data.locale)}</button>
			</form>
		</details>
	{/if}
</main>

<style>
	main {
		box-sizing: content-box;
		max-width: 72ch;
		margin: 0 auto;
		padding: 32px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		font-size: 13px;
	}
	h1 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		align-items: baseline;
		gap: 12px;
		padding: 8px 0;
		border-bottom: 1px solid var(--hairline);
	}
	li a {
		color: var(--accent);
		font-size: 13px;
		font-weight: 500;
	}
	.slug,
	input[name='slug'] {
		font-family: var(--font-mono);
		font-size: 12.5px;
	}
	.slug,
	.empty {
		color: var(--muted);
	}
	.role {
		margin-left: auto;
		color: var(--muted);
	}
	.empty {
		margin: 0;
	}
	.new {
		align-self: flex-start;
	}
	summary,
	form button {
		display: inline-block;
		padding: 6px 10px;
		border-radius: var(--radius);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	summary {
		list-style: none;
		background: var(--accent);
		color: #fff;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: min(320px, 100%);
		margin-top: 12px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-weight: 600;
	}
	input {
		padding: 6px 8px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		font-weight: 400;
	}
	form button {
		align-self: flex-start;
		border: 1px solid var(--hairline);
		background: var(--ground);
		color: var(--ink);
	}
	.error {
		margin: 0;
		color: var(--error);
	}
	:is(a, summary, button, input):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	@media (max-width: 767px) {
		main {
			padding: 24px 16px;
		}
	}
</style>

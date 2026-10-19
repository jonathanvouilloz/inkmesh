<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	// svelte-ignore state_referenced_locally
	let name = $state(form?.name ?? data.suggestedName);
	const [beforeHost, afterHost] = $derived(t('consent.redirect', data.locale).split('{host}'));
	const query = $derived(new URLSearchParams(data.params).toString());
</script>

<svelte:head><title>{t('consent.title', data.locale, { client: data.clientName })}</title></svelte:head>

<main>
	<h1>{t('consent.title', data.locale, { client: data.clientName })}</h1>
	<p>{beforeHost}<span class="mono">{data.redirectHost}</span>{afterHost}</p>
	{#if data.loopback}
		<p class="warn">{t('consent.loopback', data.locale)}</p>
	{/if}
	{#if data.workspaces.length}
		<div>
			<p>{t('consent.roles', data.locale)}</p>
			<ul>
				{#each data.workspaces as workspace (workspace.slug)}
					<li>{workspace.name} · {t(`role.${workspace.role}`, data.locale)}</li>
				{/each}
			</ul>
		</div>
	{:else}
		<p>{t('consent.none', data.locale)}</p>
	{/if}
	<form method="POST" action="?{query}&/allow">
		<label>
			{t('consent.name', data.locale)}
			<input
				name="name"
				required
				maxlength="40"
				bind:value={name}
				aria-invalid={form?.nameError ? 'true' : undefined}
				aria-describedby={form?.nameError ? 'name-hint name-error' : 'name-hint'}
			/>
		</label>
		<p id="name-hint" class="hint">
			{t('consent.nameHint', data.locale, { user: data.user.name, name: name.trim() })}
		</p>
		{#if form?.nameError}
			<p id="name-error" class="error" role="alert">{t(form.nameError, data.locale)}</p>
		{/if}
		<div class="actions">
			<button class="secondary" formaction="?{query}&/deny" formnovalidate>{t('consent.deny', data.locale)}</button>
			<button>{t('consent.allow', data.locale)}</button>
		</div>
	</form>
</main>

<style>
	main {
		box-sizing: border-box;
		max-width: 360px;
		margin: 0 auto;
		padding: 24px 16px;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 16px;
		font-size: 13px;
	}
	h1 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	p {
		margin: 0;
		text-wrap: pretty;
	}
	ul {
		margin: 4px 0 0;
		padding-left: 16px;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 12.5px;
	}
	.warn {
		color: var(--warn);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 8px;
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
	.hint {
		color: var(--muted);
		overflow-wrap: anywhere;
	}
	.error {
		color: var(--error);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 8px;
	}
	button {
		padding: 6px 10px;
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		background: var(--accent);
		color: #fff;
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	.secondary {
		border-color: var(--hairline);
		background: var(--ground);
		color: var(--ink);
	}
	:is(button, input):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>

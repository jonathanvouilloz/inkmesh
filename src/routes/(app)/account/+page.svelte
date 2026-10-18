<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import Header from '#lib/ui/Header.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const nameError = $derived(form?.error === 'account.nameBad' ? form.error : null);
	const passwordError = $derived(form?.error && form.error !== 'account.nameBad' ? form.error : null);
</script>

<svelte:head><title>{t('account.title', data.locale)}</title></svelte:head>

<Header workspaces={data.workspaces} user={data.user} locale={data.locale} />

<main>
	<h1>{t('account.title', data.locale)}</h1>

	<section>
		<h2 id="name-heading">{t('account.name', data.locale)}</h2>
		<form method="POST" action="?/rename">
			<input
				name="name"
				autocomplete="name"
				required
				maxlength="80"
				value={data.user.name}
				aria-labelledby="name-heading"
				aria-invalid={nameError ? 'true' : undefined}
				aria-describedby={nameError ? 'name-error' : 'name-history'}
			/>
			<p id="name-history" class="note">{t('account.history', data.locale)}</p>
			<button>{t('account.save', data.locale)}</button>
			{#if nameError}
				<p id="name-error" class="error" role="alert">{t(nameError, data.locale)}</p>
			{:else if form?.ok === 'rename'}
				<p class="ok" role="status">{t('account.saved', data.locale)}</p>
			{/if}
		</form>
	</section>

	<section>
		<h2 id="password-heading">{t('account.password', data.locale)}</h2>
		<form method="POST" action="?/password">
			<label>
				{t('account.current', data.locale)}
				<input
					name="current"
					type="password"
					autocomplete="current-password"
					required
					aria-invalid={passwordError === 'account.wrong' ? 'true' : undefined}
					aria-describedby={passwordError ? 'password-error' : undefined}
				/>
			</label>
			<label>
				{t('account.next', data.locale)}
				<input
					name="next"
					type="password"
					autocomplete="new-password"
					required
					aria-invalid={passwordError === 'account.short' ? 'true' : undefined}
					aria-describedby={passwordError ? 'password-error' : undefined}
				/>
			</label>
			<button>{t('account.change', data.locale)}</button>
			{#if passwordError}
				<p id="password-error" class="error" role="alert">{t(passwordError, data.locale)}</p>
			{:else if form?.ok === 'password'}
				<p class="ok" role="status">{t('account.changed', data.locale)}</p>
			{/if}
		</form>
	</section>
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
	h2 {
		margin: 0 0 8px;
		font-size: 13px;
		font-weight: 600;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: min(320px, 100%);
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
	button {
		align-self: flex-start;
		padding: 6px 10px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	p {
		margin: 0;
	}
	.note {
		text-wrap: pretty;
		color: var(--muted);
	}
	section + section {
		padding-top: 24px;
		border-top: 1px solid var(--hairline);
	}
	.ok {
		color: var(--ok);
	}
	.error {
		color: var(--error);
	}
	:is(button, input):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	@media (max-width: 767px) {
		main {
			padding: 24px 16px;
		}
	}
</style>

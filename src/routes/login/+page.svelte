<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>{t('login.title', data.locale)}</title></svelte:head>

<main>
	<h1>{t('app.name', data.locale)}</h1>
	<form method="POST">
		<input type="hidden" name="next" value={data.next} />
		<label>
			{t('login.email', data.locale)}
			<input
				name="email"
				type="email"
				autocomplete="email"
				required
				value={form?.email ?? ''}
				aria-invalid={form?.error ? 'true' : undefined}
				aria-describedby={form?.error ? 'login-error' : undefined}
			/>
		</label>
		<label>
			{t('login.password', data.locale)}
			<input
				name="password"
				type="password"
				autocomplete="current-password"
				required
				aria-invalid={form?.error ? 'true' : undefined}
				aria-describedby={form?.error ? 'login-error' : undefined}
			/>
		</label>
		<button>{t('login.submit', data.locale)}</button>
		{#if form?.error}
			<p id="login-error" class="error" role="alert">{t(form.error, data.locale)}</p>
		{/if}
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
		gap: 24px;
		font-size: 13px;
	}
	h1 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
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
		border: 0;
		border-radius: var(--radius);
		background: var(--accent);
		color: #fff;
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	:is(button, input):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.error {
		margin: 0;
		color: var(--error);
	}
	@media (prefers-reduced-motion: no-preference) {
		input,
		button {
			transition: outline-color var(--ease);
		}
	}
</style>

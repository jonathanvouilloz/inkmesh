<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	// After a link request the URL is `?/link`: the answer says which form to show.
	const method = $derived(form?.method ?? data.method);
	const query = (link: boolean) => {
		const params = new URLSearchParams(link ? { method: 'link' } : {});
		if (data.next) params.set('next', data.next);
		const search = params.toString();
		return search ? '?' + search : '/login';
	};
</script>

<svelte:head><title>{t('login.title', data.locale)}</title></svelte:head>

<main>
	<h1>{t('login.title', data.locale)}</h1>
	{#if form?.sent}
		{@const [before, after] = t('login.linkSent', data.locale).split('{email}')}
		<p role="status">{before}<span class="mono">{form.email}</span>{after}</p>
	{:else if method === 'link'}
		<form method="POST" action="?/link">
			<input type="hidden" name="next" value={data.next} />
			<label>
				{t('login.email', data.locale)}
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="mono"
					name="email"
					type="email"
					autocomplete="email"
					required
					autofocus={!!form?.error}
					defaultValue={form?.email ?? ''}
					aria-invalid={form?.error ? 'true' : undefined}
					aria-describedby={form?.error ? 'login-error' : undefined}
				/>
			</label>
			{#if form?.error}
				<p id="login-error" class="error" role="alert">{t(form.error, data.locale)}</p>
			{/if}
			<button>{t('login.sendLink', data.locale)}</button>
			<a href={query(false)}>{t('login.usePassword', data.locale)}</a>
		</form>
	{:else}
		<form method="POST" action="?/password">
			<input type="hidden" name="next" value={data.next} />
			<label>
				{t('login.email', data.locale)}
				<!-- The form is the whole page; after a failed attempt focus goes back to its first field. -->
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="mono"
					name="email"
					type="email"
					autocomplete="email"
					required
					autofocus={!!form?.error}
					defaultValue={form?.email ?? ''}
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
			{#if form?.error}
				<p id="login-error" class="error" role="alert">{t(form.error, data.locale)}</p>
			{/if}
			<button>{t('login.submit', data.locale)}</button>
			{#if data.mail}<a href={query(true)}>{t('login.useLink', data.locale)}</a>{/if}
		</form>
	{/if}
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
	.mono {
		font-family: var(--font-mono);
		font-size: 12.5px;
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
	:is(button, input, a):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	a {
		align-self: flex-start;
		color: var(--accent);
	}
	p[role='status'] {
		margin: 0;
	}
	.error {
		margin: -8px 0 0;
		color: var(--error);
	}
</style>

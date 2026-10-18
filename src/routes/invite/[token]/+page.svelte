<script lang="ts">
	import { page } from '$app/state';
	import { t } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = $derived(data.locale);
	const vars = $derived(
		data.invitation && {
			workspace: data.invitation.workspace.name,
			role: t(`role.${data.invitation.role}`, locale).toLocaleLowerCase(locale)
		}
	);
	const fieldError = $derived(form?.error === 'invite.password' ? 'password' : form?.error ? 'email' : null);
</script>

<svelte:head>
	<title>{vars ? t('invite.title', locale, vars) : t('invite.invalid', locale)}</title>
</svelte:head>

<main>
	{#if vars}
		<h1>{t('invite.title', locale, vars)}</h1>
		{#if data.user}
			<form method="POST" action="?/join">
				<button>{t('invite.join', locale, vars)}</button>
			</form>
		{:else}
			<form method="POST" action="?/signup">
				<label>
					{t('invite.name', locale)}
					<input name="name" autocomplete="name" required maxlength="80" value={form?.name ?? ''} />
				</label>
				<label>
					{t('login.email', locale)}
					<input
						class="mono"
						name="email"
						type="email"
						autocomplete="email"
						required
						value={form?.email ?? ''}
						aria-invalid={fieldError === 'email' ? 'true' : undefined}
						aria-describedby={fieldError === 'email' ? 'invite-error' : undefined}
					/>
				</label>
				{#if fieldError === 'email'}
					<p id="invite-error" class="error" role="alert">
						{#if form?.error === 'invite.exists'}
							{t('invite.exists', locale)}
							<a href="/login?next={encodeURIComponent(page.url.pathname)}">{t('invite.signin', locale)}</a>
						{:else}
							{t('invite.email', locale)}
						{/if}
					</p>
				{/if}
				<label>
					{t('login.password', locale)}
					<input
						name="password"
						type="password"
						autocomplete="new-password"
						required
						minlength="10"
						maxlength="1024"
						aria-invalid={fieldError === 'password' ? 'true' : undefined}
						aria-describedby="password-hint"
					/>
				</label>
				<p
					id="password-hint"
					class:error={fieldError === 'password'}
					role={fieldError === 'password' ? 'alert' : undefined}
				>
					{t('invite.password', locale)}
				</p>
				<button>{t('invite.create', locale)}</button>
			</form>
		{/if}
	{:else}
		<div>
			<h1>{t('invite.invalid', locale)}</h1>
			<p class="help">{t('invite.invalidHelp', locale)}</p>
		</div>
		<a class="action" href="/login">{t('login.submit', locale)}</a>
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
	p {
		margin: -8px 0 0;
		color: var(--muted);
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
	a {
		color: var(--accent);
	}
	p.help {
		margin: 8px 0 0;
	}
	a.action {
		align-self: flex-start;
		padding: 6px 10px;
		border-radius: var(--radius);
		background: var(--accent);
		color: #fff;
		font-weight: 500;
		text-decoration: none;
	}
	:is(a, button, input):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	p.error {
		color: var(--error);
	}
</style>

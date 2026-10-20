<script lang="ts">
	import { t, type Locale } from '#lib/i18n/index.ts';

	// The invitation and join pages: a join button for a signed-in visitor, a sign-up form for anyone else.
	let {
		locale,
		signedIn,
		joinLabel,
		form
	}: {
		locale: Locale;
		signedIn: boolean;
		joinLabel: string;
		/** The sign-up action's failure, so a refused sign-up keeps its name and email. */
		form?: { error?: string; name?: string; email?: string } | null;
	} = $props();

	const fieldError = $derived(
		form?.error === 'invite.password'
			? 'password'
			: form?.error === 'invite.email' || form?.error === 'invite.exists'
				? 'email'
				: null
	);
	// The page's load redirects ?signin to the login form, back here after: the token never shows in the HTML.
	const signin = '?signin';
</script>

{#if signedIn}
	<form method="POST" action="?/join">
		<button>{joinLabel}</button>
	</form>
{:else}
	<form method="POST" action="?/signup">
		<label>
			{t('invite.name', locale)}
			<input name="name" autocomplete="name" required maxlength="80" defaultValue={form?.name ?? ''} />
		</label>
		<label>
			{t('login.email', locale)}
			<input
				class="mono"
				name="email"
				type="email"
				autocomplete="email"
				required
				defaultValue={form?.email ?? ''}
				aria-invalid={fieldError === 'email' ? 'true' : undefined}
				aria-describedby={fieldError === 'email' ? 'signup-error' : undefined}
			/>
		</label>
		{#if fieldError === 'email'}
			<p id="signup-error" class="error" role="alert">
				{#if form?.error === 'invite.exists'}
					{t('invite.exists', locale)}
					<a href={signin}>{t('invite.signin', locale)}</a>
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
		<p class="account">{t('signup.haveAccount', locale)} <a href={signin}>{t('invite.signin', locale)}</a></p>
	</form>
{/if}

<style>
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
	p.account {
		margin: 0;
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
	:is(a, button, input):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	p.error {
		color: var(--error);
	}
</style>

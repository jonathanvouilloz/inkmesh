<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import SignupForm from '#lib/ui/SignupForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = $derived(data.locale);
	const vars = $derived(
		data.invitation && {
			workspace: data.invitation.workspace.name,
			role: t(`role.${data.invitation.role}`, locale).toLocaleLowerCase(locale)
		}
	);
</script>

<svelte:head>
	<title>{vars ? t('invite.title', locale, vars) : t('invite.invalid', locale)}</title>
</svelte:head>

<main>
	{#if vars}
		<div>
			<h1>{t('invite.title', locale, vars)}</h1>
			{#if !data.user}<p>{t('invite.terms', locale, vars)}</p>{/if}
		</div>
		<SignupForm {locale} {form} signedIn={!!data.user} joinLabel={t('invite.join', locale, vars)} />
	{:else}
		<div>
			<h1>{t('invite.invalid', locale)}</h1>
			<p>{t('invite.invalidHelp', locale)}</p>
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
	p {
		margin: 8px 0 0;
		color: var(--muted);
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
	a.action:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>

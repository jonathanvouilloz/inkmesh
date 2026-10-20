<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import SignupForm from '#lib/ui/SignupForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = $derived(data.locale);
	const vars = $derived(
		data.link && {
			workspace: data.link.workspaceName,
			role: t(`role.${data.link.role}`, locale).toLocaleLowerCase(locale)
		}
	);
</script>

<svelte:head>
	<title>{vars ? t('join.title', locale, vars) : t('join.closed', locale)}</title>
</svelte:head>

<main>
	{#if vars && form?.error !== 'join.closed'}
		<div>
			<h1>{t('join.title', locale, vars)}</h1>
			<!-- Before anyone gives a name and an email: the role granted, and who sees them. -->
			{#if !data.user}<p>{t('join.terms', locale, vars)}</p>{/if}
		</div>
		{#if form?.error === 'join.tooMany'}
			<p class="error" role="alert">{t('join.tooMany', locale)}</p>
		{/if}
		<SignupForm {locale} {form} signedIn={!!data.user} joinLabel={t('join.as', locale, vars)} />
	{:else}
		<h1>{t('join.closed', locale)}</h1>
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
	p.error {
		margin: 0;
		color: var(--error);
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

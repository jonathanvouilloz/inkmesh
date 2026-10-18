<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = $derived(data.locale);
	const owner = $derived(data.role === 'owner');
	const lastOwner = $derived(data.members.filter((m) => m.role === 'owner').length === 1);
	let copied = $state(false);

	async function copy(link: string) {
		await navigator.clipboard.writeText(link);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<svelte:head><title>{t('members.title', locale)}</title></svelte:head>

<div class="page">
	<h1 id="members">{t('members.title', locale)}</h1>
	{#if form?.error}
		<p class="error" role="alert">{t(form.error, locale)}</p>
	{/if}
	<table aria-labelledby="members">
		<thead>
			<tr>
				<th>{t('invite.name', locale)}</th>
				<th>{t('invite.email', locale)}</th>
				<th>{t('members.role', locale)}</th>
				{#if owner}<td></td>{/if}
			</tr>
		</thead>
		<tbody>
			{#each data.members as m (m.user.id)}
				<tr>
					<td>{m.user.name}</td>
					<td class="mono">{m.user.email}</td>
					<td>
						{#if owner}
							<form method="POST" action="?/setRole">
								<input type="hidden" name="userId" value={m.user.id} />
								<!-- shortcut: submits on change, no separate button; add one if keyboard users report stray submits -->
								<select
									name="role"
									aria-label="{t('members.role', locale)}, {m.user.name}"
									onchange={(e) => e.currentTarget.form?.requestSubmit()}
								>
									{#each data.roles as r (r)}
										<option value={r} selected={r === m.role}>{t(`role.${r}`, locale)}</option>
									{/each}
								</select>
							</form>
						{:else}
							{t(`role.${m.role}`, locale)}
						{/if}
					</td>
					{#if owner}
						<td class="end">
							{#if !(lastOwner && m.role === 'owner')}
								<form method="POST" action="?/remove">
									<input type="hidden" name="userId" value={m.user.id} />
									<button>{t('members.remove', locale)}</button>
								</form>
							{/if}
						</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>

	{#if data.pending.length}
		<h2 id="pending">{t('members.pending', locale)}</h2>
		<table aria-labelledby="pending">
			<thead>
				<tr>
					<th>{t('members.role', locale)}</th>
					<th>{t('members.by', locale)}</th>
					<th>{t('members.expires', locale)}</th>
					<td></td>
				</tr>
			</thead>
			<tbody>
				{#each data.pending as p (p.id)}
					<tr>
						<td>{t(`role.${p.role}`, locale)}</td>
						<td>{p.createdBy}</td>
						<td class="mono">
							<time datetime={p.expiresAt}>{new Date(p.expiresAt).toLocaleDateString(locale)}</time>
						</td>
						<td class="end">
							{#if owner || p.createdById === data.user.id}
								<form method="POST" action="?/revoke">
									<input type="hidden" name="id" value={p.id} />
									<button>{t('members.revoke', locale)}</button>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	<h2>{t('members.invite', locale)}</h2>
	<form class="invite" method="POST" action="?/invite">
		<label>
			{t('members.newRole', locale)}
			<select name="role">
				{#each data.roles as r (r)}
					<option value={r}>{t(`role.${r}`, locale)}</option>
				{/each}
			</select>
		</label>
		<button class="primary">{t('members.create', locale)}</button>
	</form>
	{#if form?.link}
		{@const link = form.link}
		<div class="link">
			<label>
				{t('members.link', locale)}
				<span class="row">
					<input class="mono" readonly value={link} onfocus={(e) => e.currentTarget.select()} />
					<button type="button" aria-live="polite" onclick={() => copy(link)}
						>{t(copied ? 'members.copied' : 'members.copy', locale)}</button
					>
				</span>
			</label>
			<p>{t('members.once', locale)}</p>
		</div>
	{/if}
</div>

<style>
	.page {
		box-sizing: content-box;
		max-width: 72ch;
		margin: 0 auto;
		padding: 32px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		font-size: 13px;
	}
	h1,
	h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	h2 {
		margin-top: 16px;
		font-size: 13px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		padding: 6px 12px 6px 0;
		border-bottom: 1px solid var(--hairline);
		text-align: left;
		vertical-align: middle;
	}
	th {
		color: var(--muted);
		font-weight: 600;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 12.5px;
		font-variant-numeric: tabular-nums;
	}
	td.mono {
		overflow-wrap: anywhere;
	}
	.end {
		padding-right: 0;
		text-align: right;
	}
	form {
		margin: 0;
	}
	.invite {
		display: flex;
		align-items: flex-end;
		gap: 8px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-weight: 600;
	}
	.row {
		display: flex;
		gap: 8px;
	}
	.row input {
		flex: 1;
		min-width: 0;
	}
	input,
	select,
	button {
		padding: 6px 8px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		font-weight: 400;
	}
	input.mono {
		font-family: var(--font-mono);
		font-size: 12.5px;
	}
	button {
		padding: 6px 10px;
		cursor: pointer;
	}
	.primary {
		border-color: var(--accent);
		background: var(--accent);
		color: #fff;
		font-weight: 500;
	}
	.link {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	p {
		margin: 0;
		color: var(--muted);
	}
	.error {
		color: var(--error);
	}
	:is(button, input, select):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	@media (prefers-reduced-motion: no-preference) {
		:is(button, input, select) {
			transition: outline-color var(--ease);
		}
	}
	@media (max-width: 767px) {
		.page {
			padding: 24px 16px;
		}
	}
</style>

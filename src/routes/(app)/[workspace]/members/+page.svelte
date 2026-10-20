<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import { ago } from '#lib/ui/time.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = $derived(data.locale);
	const owner = $derived(data.role === 'owner');
	const lastOwner = $derived(data.members.filter((m) => m.role === 'owner').length === 1);
	let copied = $state('');
	let revokeDialog = $state<HTMLDialogElement>()!;
	let linksHeading = $state<HTMLHeadingElement>();
	let opener: HTMLElement | undefined;
	let revoking = $state<{ id: number; name: string }>();

	async function copy(id: string, link: string) {
		try {
			await navigator.clipboard.writeText(link);
		} catch {
			// No clipboard outside a secure context: leave the link selected for a manual copy.
			const input = document.getElementById(id) as HTMLInputElement;
			input.focus();
			input.select();
			return;
		}
		copied = id;
		setTimeout(() => (copied = ''), 2000);
	}

	// Without JavaScript the row's form revokes at once; with it, the dialog asks first.
	function confirmRevoke(e: MouseEvent, id: number, name: string) {
		e.preventDefault();
		[revoking, opener] = [{ id, name }, e.currentTarget as HTMLElement];
		revokeDialog.showModal();
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
				<th>{t('members.role', locale)}</th>
				{#if owner}<th><span class="visually-hidden">{t('table.actions', locale)}</span></th>{/if}
			</tr>
		</thead>
		<tbody>
			{#each data.members as m (m.user.id)}
				<tr>
					<td>{m.user.name}<span class="mono email">{m.user.email}</span></td>
					<td>
						{#if owner}
							<form class="row" method="POST" action="?/setRole">
								<input type="hidden" name="userId" value={m.user.id} />
								<select name="role" aria-label="{t('members.role', locale)}, {m.user.name}">
									{#each data.roles as r (r)}
										<option value={r} selected={r === m.role}>{t(`role.${r}`, locale)}</option>
									{/each}
								</select>
								<button>{t('members.save', locale)}</button>
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
					<th><span class="visually-hidden">{t('table.actions', locale)}</span></th>
				</tr>
			</thead>
			<tbody>
				{#each data.pending as p (p.id)}
					<tr>
						<td>{t(`role.${p.role}`, locale)}</td>
						<td>{p.createdBy}</td>
						<td class="mono">
							<time datetime={p.expiresAt} title={p.expiresAt}>{ago(p.expiresAt, locale)}</time>
						</td>
						<td class="end">
							{#if p.canRevoke}
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
		<button>{t('members.create', locale)}</button>
	</form>
	{#if form?.link}
		{@render oneTime('invite-link', form.link, 'members.once')}
	{/if}

	{#if data.publicLinks}
		<h2 id="public-links" tabindex="-1" bind:this={linksHeading}>{t('share.title', locale)}</h2>
		<p>{t('share.intro', locale)}</p>
		{#if data.publicLinks.length}
			<table class="links" aria-labelledby="public-links">
				<thead>
					<tr>
						<th>{t('share.scope', locale)}</th>
						<th>{t('share.signup', locale)}</th>
						<th class="created">{t('members.by', locale)}</th>
						<th><span class="visually-hidden">{t('table.actions', locale)}</span></th>
					</tr>
				</thead>
				<tbody>
					{#each data.publicLinks as l (l.id)}
						{@const scope = l.path ?? t('share.workspace', locale)}
						<!-- The token's last characters tell apart links to the same scope, and match the URL's end. -->
						{@const name = l.hint ? `${scope} …${l.hint}` : scope}
						<tr>
							<td>
								{#if l.path}<span class="mono path">{l.path}</span>{:else}{scope}{/if}
								{#if l.hint}<span class="mono hint">…{l.hint}</span>{/if}
							</td>
							<td>
								<form class="row" method="POST" action="?/shareSignup#public-links">
									<input type="hidden" name="id" value={l.id} />
									<select name="signup" aria-label="{t('share.signup', locale)}, {name}">
										{@render signups(l.signupRole ?? '')}
									</select>
									<button>{t('members.save', locale)}</button>
								</form>
							</td>
							<td class="created">
								{l.createdBy ?? ''}
								<time class="mono email" datetime={l.createdAt} title={l.createdAt}>{ago(l.createdAt, locale)}</time>
							</td>
							<td class="end">
								<form method="POST" action="?/shareRevoke#public-links">
									<input type="hidden" name="id" value={l.id} />
									<button
										aria-label="{t('share.revoke', locale)}, {name}"
										onclick={(e) => confirmRevoke(e, l.id, name)}
										>{t('share.revoke', locale)}</button
									>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p>{t('share.empty', locale)}</p>
		{/if}

		<form class="invite share" method="POST" action="?/shareCreate#public-links">
			<label class="scope">
				{t('share.scope', locale)}
				<select name="scope" class="mono">
					<option value="">{t('share.workspace', locale)}</option>
					{#each data.documents as d (d)}
						<option value={d} selected={d === data.share}>{d}</option>
					{/each}
				</select>
			</label>
			<label>
				{t('share.signup', locale)}
				<select name="signup">{@render signups('')}</select>
			</label>
			<button>{t('share.create', locale)}</button>
		</form>
		{#if form?.shareError}
			<p class="error" role="alert">{t('error.notFound', locale)}</p>
		{/if}
		{#if form?.shareUrl}
			{@render oneTime('share-link', form.shareUrl, 'share.once')}
		{/if}
	{/if}
</div>

{#snippet signups(current: string)}
	<option value="" selected={current === ''}>{t('share.off', locale)}</option>
	<option value="reader" selected={current === 'reader'}>{t('share.asReader', locale)}</option>
	<option value="editor" selected={current === 'editor'}>{t('share.asEditor', locale)}</option>
{/snippet}

{#snippet oneTime(id: string, link: string, once: 'members.once' | 'share.once')}
	<div class="link">
		<label for={id}>{t(id === 'invite-link' ? 'members.link' : 'share.link', locale)}</label>
		<span class="row">
			<!-- Shown once: focus goes to it (after the #public-links fragment took it), so it is copied first. -->
			<input
				{id}
				class="mono"
				readonly
				value={link}
				{@attach (input) => input.focus()}
				aria-describedby="{id}-once"
				onfocus={(e) => e.currentTarget.select()}
			/>
			<button type="button" aria-live="polite" onclick={() => copy(id, link)}
				>{t(copied === id ? 'members.copied' : 'members.copy', locale)}</button
			>
		</span>
		<p id="{id}-once">{t(once, locale)}</p>
	</div>
{/snippet}

<dialog
	bind:this={revokeDialog}
	aria-labelledby="revoke-title"
	onclose={() => (opener?.isConnected ? opener : linksHeading)?.focus()}
>
	<form method="POST" action="?/shareRevoke#public-links">
		<h2 id="revoke-title">{t('share.revoke', locale)}</h2>
		<input type="hidden" name="id" value={revoking?.id} />
		<p>{t('share.revokeConfirm', locale, { link: revoking?.name ?? '' })}</p>
		<div class="buttons">
			<button>{t('share.revoke', locale)}</button>
			<!-- Keeping is the safe answer, so it takes the focus. -->
			<!-- svelte-ignore a11y_autofocus -->
			<button type="button" autofocus onclick={() => revokeDialog.close()}>{t('files.cancel', locale)}</button>
		</div>
	</form>
</dialog>

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
	.email {
		display: block;
		color: var(--muted);
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
		align-items: center;
		gap: 8px;
	}
	.link label {
		font-weight: 600;
	}
	/* On a phone the role cell wraps its Save button rather than breaking the email. */
	td .row {
		flex-wrap: wrap;
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
		font-weight: 500;
		cursor: pointer;
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
	h2:focus {
		outline: none;
	}
	.path {
		overflow-wrap: anywhere;
	}
	.hint {
		color: var(--muted);
		white-space: nowrap;
	}
	/* The scope column takes the slack, so Save stays beside its select. */
	.links td:first-child {
		width: 100%;
	}
	.links td .row {
		flex-wrap: nowrap;
	}
	.share {
		flex-wrap: wrap;
	}
	.scope {
		flex: 1 1 240px;
		min-width: 0;
	}
	select.mono {
		font-family: var(--font-mono);
		font-size: 12.5px;
		text-overflow: ellipsis;
	}
	dialog {
		box-sizing: border-box;
		width: min(360px, calc(100vw - 32px));
		padding: 24px 16px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font-size: 13px;
	}
	dialog::backdrop {
		background: rgb(28 28 26 / 0.3);
	}
	dialog form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	dialog h2 {
		margin: 0;
		font-size: 16px;
	}
	dialog p {
		color: var(--ink);
	}
	.buttons {
		display: flex;
		gap: 8px;
	}
	:is(button, input, select):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	@media (max-width: 767px) {
		.page {
			padding: 24px 16px;
		}
		/* Phones keep what a link covers, its sign-up and Revoke; who created it is the one to go. */
		.created {
			display: none;
		}
		/* Each link in two lines: what it covers, then its sign-up and Revoke. */
		.links,
		.links tbody {
			display: block;
		}
		.links thead {
			display: none;
		}
		.links tr {
			display: grid;
			grid-template-columns: 1fr auto;
			column-gap: 8px;
			border-bottom: 1px solid var(--hairline);
		}
		.links td {
			border: 0;
		}
		.links td:first-child {
			grid-column: 1 / -1;
			width: auto;
		}
	}
</style>

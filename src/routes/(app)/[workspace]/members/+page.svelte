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
	const mailErrors = {
		email: 'members.mailBad',
		throttled: 'members.mailThrottled',
		failed: 'members.mailFailed'
	} as const;

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
				{#if owner}<th class="end"><span class="visually-hidden">{t('table.actions', locale)}</span></th>{/if}
			</tr>
		</thead>
		<tbody>
			{#each data.members as m (m.user.id)}
				<tr>
					<td>{m.user.name}<span class="mono email">{m.user.email}</span></td>
					<td class="role">
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

	<!-- The fragment brings the answer back into view, on a phone too. -->
	<hgroup>
		<h2 id="invite">{t('members.invite', locale)}</h2>
		<p>{t('members.inviteIntro', locale)}</p>
	</hgroup>
	<form class="invite" method="POST" action="?/invite#invite">
		<label>
			{t('members.newRole', locale)}
			<select name="role">
				{#each data.roles as r (r)}
					<option value={r}>{t(`role.${r}`, locale)}</option>
				{/each}
			</select>
		</label>
		{#if data.mail}
			<label class="to">
				{t('members.sendTo', locale)}
				<!-- Kept and focused after a refusal, so the address can be corrected rather than typed again. -->
				<!-- svelte-ignore a11y_autofocus -->
				<input
					type="email"
					name="email"
					class="mono"
					autocomplete="off"
					spellcheck="false"
					defaultValue={form?.email ?? ''}
					autofocus={!!form?.mailError}
					aria-invalid={form?.mailError === 'email'}
					aria-describedby={form?.mailError ? 'invite-mail' : undefined}
				/>
			</label>
		{/if}
		<button>{t('members.create', locale)}</button>
	</form>
	{#if form?.link}
		{@render oneTime('invite-link', form.link, 'members.once')}
	{/if}
	{#if form?.mailed}
		{@const [before, after] = t('members.mailed', locale).split('{email}')}
		<p class="ok" role="status">{before}<span class="mono">{form.mailed}</span>{after}</p>
	{:else if form?.mailError}
		<p id="invite-mail" class="error" role="alert">{t(mailErrors[form.mailError], locale)}</p>
	{/if}

	{#if data.pending.length}
		<h2 id="pending">{t('members.pending', locale)}</h2>
		<table aria-labelledby="pending">
			<thead>
				<tr>
					<th>{t('members.role', locale)}</th>
					<th>{t('members.by', locale)}</th>
					<th>{t('members.expires', locale)}</th>
					<th class="end"><span class="visually-hidden">{t('table.actions', locale)}</span></th>
				</tr>
			</thead>
			<tbody>
				{#each data.pending as p (p.id)}
					<tr class:new={p.id === form?.invited}>
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

	{#if data.publicLinks}
		<hgroup>
			<h2 id="public-links" tabindex="-1" bind:this={linksHeading}>{t('share.title', locale)}</h2>
			<p>{t('share.intro', locale)}</p>
		</hgroup>
		{#if data.publicLinks.length}
			<table class="links" aria-labelledby="public-links">
				<thead>
					<tr>
						<th>{t('share.scope', locale)}</th>
						<th>{t('share.signup', locale)}</th>
						<th class="created">{t('members.by', locale)}</th>
						<th class="end"><span class="visually-hidden">{t('table.actions', locale)}</span></th>
					</tr>
				</thead>
				<tbody>
					{#each data.publicLinks as l (l.id)}
						{@const scope = l.path ?? t('share.workspace', locale)}
						<!-- The token's last characters tell apart links to the same scope, and match the URL's end. -->
						{@const name = l.hint ? `${scope}\u00a0…\u2060${l.hint}` : scope}
						<!-- The hint ends the new URL; four random characters, so a second match is unlikely and harmless. -->
						<tr class:new={!!l.hint && !!form?.shareUrl?.endsWith(l.hint)}>
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

		<form class="invite" method="POST" action="?/shareCreate#public-links">
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
	<section class="link" aria-labelledby="{id}-title">
		<h3 id="{id}-title">{t('members.newLink', locale)}</h3>
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
	</section>
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
		max-width: var(--page-width);
		margin: 0 auto;
		padding: 32px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		font-size: 13px;
	}
	h1,
	h2,
	h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	h2,
	hgroup {
		margin-top: 16px;
	}
	h2,
	h3 {
		font-size: 13px;
	}
	/* A section's one-line description sits under its heading, apart from what follows. */
	hgroup {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	hgroup h2 {
		margin-top: 0;
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
	/* The first column takes the slack and alone wraps, so every row's controls sit together at the right. */
	td:first-child {
		width: 100%;
	}
	th,
	td:not(:first-child) {
		white-space: nowrap;
	}
	/* One actions column, as wide in every table, so Remove and Revoke line up. */
	.end {
		width: 96px;
		padding-right: 0;
		text-align: right;
		white-space: nowrap;
	}
	/* The row a new link just added, lit for a few seconds. */
	tr.new {
		background: color-mix(in srgb, var(--accent), transparent 92%);
	}
	@media (prefers-reduced-motion: no-preference) {
		tr.new {
			animation: lit 4s ease-out forwards;
		}
	}
	@keyframes lit {
		60% {
			background: color-mix(in srgb, var(--accent), transparent 92%);
		}
		to {
			background: transparent;
		}
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
	/* The one-time link: told apart from the tables by the accent rule and ground. */
	.link {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px 16px;
		border-left: 3px solid var(--accent);
		border-radius: 0 var(--radius) var(--radius) 0;
		background: color-mix(in srgb, var(--accent), transparent 92%);
	}
	.link h3 {
		margin-bottom: 4px;
	}
	p {
		margin: 0;
		color: var(--muted);
	}
	.error {
		color: var(--error);
	}
	.ok {
		color: var(--ok);
	}
	h2:focus {
		outline: none;
	}
	.path {
		overflow-wrap: anywhere;
	}
	.hint,
	.created time {
		white-space: nowrap;
	}
	.hint {
		color: var(--muted);
	}
	.invite {
		flex-wrap: wrap;
	}
	/* One height for a row's select, input and button, so their labels line up. */
	.invite :is(input, select, button) {
		box-sizing: border-box;
		height: 32px;
	}
	.scope,
	.to {
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
		/* The role cell wraps its Save button rather than breaking the email. */
		.role .row {
			flex-wrap: wrap;
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

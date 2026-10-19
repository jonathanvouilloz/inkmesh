<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '$app/forms';
	import type { Agent } from '#lib/core/agents.ts';
	import { t } from '#lib/i18n/index.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = $derived(data.locale);

	const tools = ['claude', 'claude-code', 'chatgpt', 'cursor', 'mcp', 'script'] as const;
	// Without JavaScript the create form reloads the page: come back to the tool it was sent from.
	let tool = $state<(typeof tools)[number]>(untrack(() => form?.kind) ?? 'claude');
	const token = $derived(form?.token && form.kind === tool ? form.token : undefined);

	const bearer = (value: string) => `"Authorization: Bearer ${value}"`;
	const api = $derived(`${data.apiUrl}/workspaces/${data.workspace}`);
	// Each recipe's copyable blocks; the token-based ones exist only once a token is shown.
	const blocks = $derived.by((): Array<{ label: string; value: string }> => {
		const url = data.mcpUrl;
		if (tool === 'claude-code')
			return [{ label: t('connect.terminal', locale), value: `claude mcp add --transport http --scope user inkmesh ${url}` }];
		if (tool === 'cursor')
			return [{ label: t('connect.config', locale), value: `{ "mcpServers": { "inkmesh": { "url": "${url}" } } }` }];
		if (!token) return [];
		if (tool === 'mcp')
			return [
				{
					label: t('connect.config', locale),
					value: `{ "mcpServers": { "inkmesh": { "type": "http", "url": "${url}", "headers": { "Authorization": "Bearer ${token}" } } } }`
				},
				{
					label: t('connect.tools.claude-code', locale),
					value: `claude mcp add --transport http inkmesh ${url} --header ${bearer(token)}`
				}
			];
		return [
			{
				label: t('connect.drop', locale),
				value: `curl -X PUT -H ${bearer('$INKMESH_TOKEN')} -H "Content-Type: text/markdown" --data-binary @report.md ${api}/documents/reports/report.md`
			},
			{ label: t('connect.changes', locale), value: `curl -H ${bearer('$INKMESH_TOKEN')} ${api}/changes` }
		];
	});

	let copied = $state('');
	async function copy(id: string, value: string) {
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			// No clipboard outside a secure context: leave the value selected for a manual copy.
			(document.getElementById(id) as HTMLInputElement).select();
			return;
		}
		copied = id;
		setTimeout(() => copied === id && (copied = ''), 2000);
	}

	// Refresh the list until every agent has connected, only while someone can see it.
	let visible = $state(typeof document === 'undefined' || document.visibilityState === 'visible');
	const pending = $derived(data.agents.some((a) => a.lastUsedAt === null));
	$effect(() => {
		if (!visible || !pending) return;
		const timer = setInterval(invalidateAll, 5000);
		return () => clearInterval(timer);
	});

	let renameDialog: HTMLDialogElement;
	let revokeDialog: HTMLDialogElement;
	let agentsHeading: HTMLHeadingElement;
	let opener: HTMLElement | undefined;
	let target = $state<Agent>();
	let name = $state('');
	let renameError = $state(false);

	function open(dialog: HTMLDialogElement, agent: Agent, button: HTMLElement) {
		[target, name, renameError, opener] = [agent, agent.name, false, button];
		dialog.showModal();
	}
	// Refreshing instead of applying the result keeps the one-time token on screen.
	const submit: SubmitFunction = ({ formElement }) =>
		async ({ result, update }) => {
			if (result.type === 'failure') {
				renameError = true;
				return;
			}
			if (result.type !== 'success') return update();
			await invalidateAll();
			formElement.closest('dialog')!.close();
		};
	// A revoked agent's row is gone: focus lands on the list's heading instead.
	const back = () => (opener?.isConnected ? opener : agentsHeading).focus();
</script>

<svelte:head><title>{t('connect.title', locale)}</title></svelte:head>
<svelte:document onvisibilitychange={() => (visible = document.visibilityState === 'visible')} />

{#snippet field(id: string, label: string, value: string)}
	<div class="field">
		<label for={id}>{label}</label>
		<span class="row">
			{#if value.length > 60}
				<textarea {id} class="mono" readonly rows="3" {value} onfocus={(e) => e.currentTarget.select()}></textarea>
			{:else}
				<input {id} class="mono" readonly {value} onfocus={(e) => e.currentTarget.select()} />
			{/if}
			<button type="button" aria-live="polite" onclick={() => copy(id, value)}
				>{t(copied === id ? 'connect.copied' : 'connect.copy', locale)}</button
			>
		</span>
	</div>
{/snippet}

<div class="page">
	<h1>{t('connect.title', locale)}</h1>
	<p>{t('connect.intro', locale, { user: data.user.name })}</p>

	<h2 id="agents" tabindex="-1" bind:this={agentsHeading}>{t('connect.agents', locale)}</h2>
	{#if data.agents.length}
		<table aria-labelledby="agents">
			<thead>
				<tr>
					<th>{t('connect.name', locale)}</th>
					<th class="created">{t('connect.created', locale)}</th>
					<th>{t('connect.lastUsed', locale)}</th>
					<td></td>
				</tr>
			</thead>
			<tbody>
				{#each data.agents as a (a.id)}
					<tr>
						<td>
							<span class="mono">{a.name}</span>
							<span class="kind">{t(a.oauth ? 'connect.oauth' : 'connect.token', locale)}</span>
						</td>
						<td class="mono created">
							<time datetime={a.createdAt}>{new Date(a.createdAt).toLocaleDateString(locale)}</time>
						</td>
						<td>
							{#if a.lastUsedAt}
								<time class="mono" datetime={a.lastUsedAt}
									>{new Date(a.lastUsedAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</time
								>
							{:else}
								<span class="muted">{t('connect.notYet', locale)}</span>
							{/if}
						</td>
						<td class="end">
							<span class="row actions">
								<button type="button" onclick={(e) => open(renameDialog, a, e.currentTarget)}
									>{t('connect.rename', locale)}</button
								>
								<button type="button" onclick={(e) => open(revokeDialog, a, e.currentTarget)}
									>{t('connect.revoke', locale)}</button
								>
							</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p>{t('connect.empty', locale)}</p>
	{/if}

	<h2>{t('connect.add', locale)}</h2>
	<fieldset>
		<legend>{t('connect.tool', locale)}</legend>
		{#each tools as value (value)}
			<label class="choice"><input type="radio" name="tool" {value} bind:group={tool} />{t(`connect.tools.${value}`, locale)}</label>
		{/each}
	</fieldset>

	{#if tool !== 'script'}
		{@render field('server-url', t('connect.url', locale), data.mcpUrl)}
	{/if}
	<ol>
		{#each t(`connect.steps.${tool}`, locale).split('\n') as step, i (i)}
			<!-- Backticks in a step mark a command or file name: it is never translated. -->
			<li>{#each step.split('`') as part, j (j)}{#if j % 2}<code>{part}</code>{:else}{part}{/if}{/each}</li>
		{/each}
	</ol>
	{#if tool === 'chatgpt'}<p>{t('connect.chatgptNote', locale)}</p>{/if}

	{#if tool === 'mcp' || tool === 'script'}
		<form class="create" method="POST" action="?/create" use:enhance>
			<input type="hidden" name="kind" value={tool} />
			<label>
				{t('connect.name', locale)}
				<input
					name="name"
					class="mono"
					required
					maxlength="40"
					value={form?.nameError ? form.name : ''}
					aria-invalid={form?.nameError ? 'true' : undefined}
					aria-describedby={form?.nameError ? 'name-error' : undefined}
				/>
			</label>
			<button>{t('connect.create', locale)}</button>
		</form>
		{#if form?.nameError}
			<p id="name-error" class="error" role="alert">{t('connect.nameBad', locale)}</p>
		{/if}
		{#if token}
			{@render field('token', t('connect.token', locale), token)}
			<p>{t('connect.once', locale)}</p>
		{/if}
	{/if}
	{#each blocks as block, i (block.label)}
		{@render field(`block-${i}`, block.label, block.value)}
	{/each}
</div>

<dialog bind:this={renameDialog} aria-labelledby="rename-title" onclose={back}>
	<form method="POST" action="?/rename" use:enhance={submit}>
		<h2 id="rename-title">{t('connect.rename', locale)}</h2>
		<input type="hidden" name="id" value={target?.id} />
		<label>
			{t('connect.name', locale)}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				name="name"
				class="mono"
				required
				maxlength="40"
				autofocus
				bind:value={name}
				aria-invalid={renameError ? 'true' : undefined}
				aria-describedby={renameError ? 'rename-error' : undefined}
			/>
		</label>
		{#if renameError}
			<p id="rename-error" class="error" role="alert">{t('connect.nameBad', locale)}</p>
		{/if}
		<div class="buttons">
			<button>{t('connect.rename', locale)}</button>
			<button type="button" onclick={() => renameDialog.close()}>{t('files.cancel', locale)}</button>
		</div>
	</form>
</dialog>

<dialog bind:this={revokeDialog} aria-labelledby="revoke-title" onclose={back}>
	<form method="POST" action="?/revoke" use:enhance={submit}>
		<h2 id="revoke-title">{t('connect.revoke', locale)}</h2>
		<input type="hidden" name="id" value={target?.id} />
		<p>{t('connect.revokeConfirm', locale, { name: target?.name ?? '' })}</p>
		<div class="buttons">
			<button>{t('connect.revoke', locale)}</button>
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
	h2:focus {
		outline: none;
	}
	p {
		margin: 0;
		color: var(--muted);
		text-wrap: pretty;
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
	.mono,
	code {
		font-family: var(--font-mono);
		font-size: 12.5px;
		font-variant-numeric: tabular-nums;
	}
	.kind {
		display: block;
		color: var(--muted);
	}
	.muted {
		color: var(--muted);
	}
	.end {
		padding-right: 0;
		text-align: right;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.actions {
		justify-content: flex-end;
		flex-wrap: wrap;
	}
	fieldset {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
		margin: 0;
		padding: 0;
		border: 0;
	}
	legend {
		margin-bottom: 8px;
		padding: 0;
		font-weight: 600;
	}
	.choice {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 6px;
		font-weight: 400;
		cursor: pointer;
	}
	.choice input {
		margin: 0;
		accent-color: var(--accent);
	}
	ol {
		margin: 0;
		padding-left: 20px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		line-height: 1.5;
	}
	form {
		margin: 0;
	}
	.create {
		display: flex;
		align-items: flex-end;
		gap: 8px;
	}
	.create label {
		flex: 0 1 240px;
		min-width: 0;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-weight: 600;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.field label {
		font-weight: 600;
	}
	.field .row {
		align-items: flex-start;
	}
	.field :is(input, textarea) {
		flex: 1;
		min-width: 0;
	}
	textarea {
		resize: none;
		field-sizing: content;
		line-height: 1.5;
		word-break: break-all;
	}
	input,
	textarea,
	button {
		padding: 6px 8px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		font-weight: 400;
	}
	:is(input, textarea).mono {
		font-family: var(--font-mono);
		font-size: 12.5px;
	}
	button {
		padding: 6px 10px;
		font-weight: 500;
		white-space: nowrap;
		cursor: pointer;
	}
	.error {
		color: var(--error);
	}
	:is(button, input, textarea):focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
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
	/* Phones keep the name, the last use and the actions; the creation date is the one to go. */
	@media (max-width: 767px) {
		.page {
			padding: 24px 16px;
		}
		.created {
			display: none;
		}
	}
</style>

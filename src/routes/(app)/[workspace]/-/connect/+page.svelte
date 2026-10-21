<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '$app/forms';
	import type { Agent } from '#lib/core/agents.ts';
	import { t } from '#lib/i18n/index.ts';
	import { ago } from '#lib/ui/time.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = $derived(data.locale);

	const tools = ['claude', 'claude-code', 'chatgpt', 'cursor', 'mcp', 'script'] as const;
	type Recipe = (typeof tools)[number] | 'claude-code-ssh';
	// Without JavaScript the create form reloads the page: come back to the recipe it was sent from.
	const sent = untrack(() => form?.kind) as Recipe | undefined;
	let tool = $state<(typeof tools)[number] | undefined>(sent === 'claude-code-ssh' ? 'claude-code' : sent);
	// Claude Code on a server reached over SSH cannot finish the browser sign-in: it takes a token instead.
	let where = $state<'local' | 'ssh'>(sent === 'claude-code-ssh' ? 'ssh' : 'local');
	const recipe = $derived<Recipe | undefined>(tool === 'claude-code' && where === 'ssh' ? 'claude-code-ssh' : tool);
	const needsToken = $derived(recipe === 'claude-code-ssh' || recipe === 'mcp' || recipe === 'script');
	const token = $derived(form?.token && form.kind === recipe ? form.token : undefined);

	const bearer = (value: string) => `"Authorization: Bearer ${value}"`;
	const api = $derived(`${data.apiUrl}/workspaces/${data.workspace}`);
	// The copyable blocks of each step, by step index; token-based ones exist only once a token is shown.
	const blocks = $derived.by((): Record<number, Array<{ label: string; value: string }>> => {
		const url = data.mcpUrl;
		const server = { label: t('connect.url', locale), value: url };
		if (recipe === 'claude' || recipe === 'chatgpt') return { 1: [server] };
		if (recipe === 'claude-code')
			return { 0: [{ label: t('connect.terminal', locale), value: `claude mcp add --transport http --scope user inkmesh ${url}` }] };
		if (recipe === 'cursor')
			return { 1: [{ label: t('connect.config', locale), value: JSON.stringify({ mcpServers: { inkmesh: { url } } }, null, 2) }] };
		if (!token) return {};
		if (recipe === 'claude-code-ssh')
			return {
				1: [
					{
						label: t('connect.terminal', locale),
						value: `claude mcp add --transport http --scope user inkmesh ${url} --header ${bearer(token)}`
					}
				]
			};
		if (recipe === 'mcp')
			return {
				1: [
					{
						label: t('connect.config', locale),
						value: JSON.stringify(
							{ mcpServers: { inkmesh: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } },
							null,
							2
						)
					}
				]
			};
		return {
			1: [{ label: t('connect.token', locale), value: token }],
			2: [
				{
					label: t('connect.drop', locale),
					value: `curl -X PUT -H ${bearer('$INKMESH_TOKEN')} -H "Content-Type: text/markdown" --data-binary @report.md ${api}/documents/reports/report.md`
				},
				{ label: t('connect.changes', locale), value: `curl -H ${bearer('$INKMESH_TOKEN')} ${api}/changes` }
			]
		};
	});

	let copied = $state('');
	let copyTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => () => clearTimeout(copyTimer));
	async function copy(id: string, value: string) {
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			// No clipboard outside a secure context: leave the value selected for a manual copy.
			(document.getElementById(id) as HTMLInputElement).select();
			return;
		}
		copied = id;
		clearTimeout(copyTimer);
		copyTimer = setTimeout(() => (copied = ''), 2000);
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
	let renameError = $state<'connect.nameBad' | 'connect.nameTaken'>();

	function open(dialog: HTMLDialogElement, agent: Agent, button: HTMLElement) {
		[target, name, renameError, opener] = [agent, agent.name, undefined, button];
		dialog.showModal();
	}
	// Refreshing instead of applying the result keeps the one-time token on screen.
	const submit: SubmitFunction = ({ formElement }) =>
		async ({ result, update }) => {
			if (result.type === 'failure' && result.data?.renameError) {
				renameError = result.data.renameError;
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
			<button type="button" onclick={() => copy(id, value)}
				>{t(copied === id ? 'connect.copied' : 'connect.copy', locale)}</button
			>
		</span>
	</div>
{/snippet}

<div class="page">
	<p class="visually-hidden" role="status">{copied ? t('connect.copied', locale) : ''}</p>
	<h1>{t('connect.title', locale)}</h1>
	<p>{t('connect.intro', locale, { user: data.user.name })}</p>

	<h2 id="choose">{t('connect.choose', locale)}</h2>
	<div class="tiles" role="radiogroup" aria-labelledby="choose">
		{#each tools as value (value)}
			<label class="tile"><input type="radio" name="tool" {value} bind:group={tool} />{t(`connect.tools.${value}`, locale)}</label>
		{/each}
	</div>

	{#if tool === 'claude-code'}
		<h2 id="where">{t('connect.where', locale)}</h2>
		<div class="tiles" role="radiogroup" aria-labelledby="where">
			{#each ['local', 'ssh'] as const as value (value)}
				<label class="tile"><input type="radio" name="where" {value} bind:group={where} />{t(`connect.where.${value}`, locale)}</label>
			{/each}
		</div>
	{/if}

	{#if recipe}
		<ol class="steps">
			{#each t(`connect.steps.${recipe}`, locale).split('\n') as step, i (i)}
				<li>
					<span class="number">{t('connect.step', locale, { n: String(i + 1) })}</span>
					<!-- Backticks in a step mark a command or file name: it is never translated. -->
					<p class="text">{#each step.split('`') as part, j (j)}{#if j % 2}<code>{part}</code>{:else}{part}{/if}{/each}</p>
					{#if i === 0 && needsToken}
						<form class="create" method="POST" action="?/create" use:enhance>
							<input type="hidden" name="kind" value={recipe} />
							<label>
								{t('connect.name', locale)}
								<input
									name="name"
									class="mono"
									required
									maxlength="40"
									defaultValue={form?.nameError ? form.name : ''}
									aria-invalid={form?.nameError ? 'true' : undefined}
									aria-describedby={form?.nameError ? 'name-error' : undefined}
								/>
							</label>
							<button class="primary">{t('connect.create', locale)}</button>
						</form>
						{#if form?.nameError}
							<p id="name-error" class="error" role="alert">{t(form.nameError, locale)}</p>
						{/if}
					{/if}
					{#each blocks[i] ?? [] as block, k (block.label)}
						{@render field(`block-${i}-${k}`, block.label, block.value)}
					{/each}
					{#if i === 1 && token}<p class="once">{t('connect.once', locale)}</p>{/if}
				</li>
			{/each}
		</ol>
		{#if recipe === 'chatgpt'}<p>{t('connect.chatgptNote', locale)}</p>{/if}
		<p class="done">{t('connect.done', locale)}</p>
	{/if}

	<h2 id="agents" class="agents" tabindex="-1" bind:this={agentsHeading}>{t('connect.agents', locale)}</h2>
	{#if data.agents.length}
		<table aria-labelledby="agents">
			<thead>
				<tr>
					<th>{t('connect.name', locale)}</th>
					<th class="created">{t('connect.created', locale)}</th>
					<th>{t('connect.lastUsed', locale)}</th>
					<th><span class="visually-hidden">{t('table.actions', locale)}</span></th>
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
							<time datetime={a.createdAt} title={a.createdAt}>{ago(a.createdAt, locale)}</time>
						</td>
						<td>
							{#if a.lastUsedAt}
								<time class="mono" datetime={a.lastUsedAt} title={a.lastUsedAt}>{ago(a.lastUsedAt, locale)}</time>
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
			<p id="rename-error" class="error" role="alert">{t(renameError, locale)}</p>
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
		max-width: var(--page-width);
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
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 8px;
	}
	.tile {
		position: relative;
		padding: 12px 14px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		font-weight: 500;
		cursor: pointer;
		transition: border-color var(--ease), background-color var(--ease);
	}
	.tile:hover {
		background: var(--panel);
	}
	.tile:has(input:checked) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.tile:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	/* The native radio, invisible, covers the whole tile: it takes clicks, keys and screen readers. */
	.tile input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.steps {
		margin: 8px 0 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--hairline);
	}
	.steps li {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 16px 0;
		border-bottom: 1px solid var(--hairline);
	}
	.number {
		font-family: var(--font-mono);
		font-size: 12.5px;
		color: var(--muted);
	}
	.steps .text {
		color: var(--ink);
		font-size: 14px;
		line-height: 1.5;
	}
	/* The design system keeps green and amber for save and conflict states only. */
	.once {
		color: var(--ink);
		font-weight: 500;
	}
	h2.agents {
		margin-top: 32px;
	}
	button.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
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
		overflow-wrap: anywhere;
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
	@media (min-width: 768px) {
		td > .mono {
			white-space: nowrap;
		}
	}
	/* Phones keep the name, the last use and the actions; the creation date is the one to go. */
	@media (max-width: 767px) {
		.page {
			padding: 24px 16px;
		}
		.created {
			display: none;
		}
		.actions {
			flex-wrap: wrap;
		}
	}
</style>

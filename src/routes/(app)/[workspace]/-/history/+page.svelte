<script lang="ts">
	import { t } from '#lib/i18n/index.ts';
	import { ago } from '#lib/ui/time.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const locale = $derived(data.locale);
	const editable = $derived(data.role !== 'reader');
</script>

<svelte:head><title>{t('deleted.title', locale)}</title></svelte:head>

<div class="page">
	<h1 id="deleted">{t('deleted.title', locale)}</h1>
	{#if form?.restoreError}
		<!-- The path is in mono: split the sentence around it. -->
		{@const [before, after] = t('deleted.exists', locale).split('{path}')}
		<p class="error" role="alert">{before}<span class="mono">{form.path}</span>{after}</p>
	{/if}
	{#if !data.deleted.length}
		<p class="muted">{t('deleted.empty', locale)}</p>
	{:else}
		<table aria-labelledby="deleted">
			<thead>
				<tr>
					<th>{t('deleted.path', locale)}</th>
					<th>{t('deleted.by', locale)}</th>
					<th>{t('deleted.when', locale)}</th>
					{#if editable}<th><span class="visually-hidden">{t('table.actions', locale)}</span></th>{/if}
				</tr>
			</thead>
			<tbody>
				{#each data.deleted as d (d.path)}
					<tr>
						<td class="mono path">{d.path}</td>
						<td>
							{d.name}{#if d.agent}<span class="mono muted"> {t('rail.via', locale)} {d.agent}</span>{/if}
						</td>
						<td class="mono muted"><time datetime={d.date} title={d.date}>{ago(d.date, locale)}</time></td>
						{#if editable}
							<td class="end">
								<form method="POST" action="?/restore">
									<input type="hidden" name="path" value={d.path} />
									<button aria-label="{t('deleted.restore', locale)}, {d.path}"
										>{t('deleted.restore', locale)}</button
									>
								</form>
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
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
	h1 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
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
	.path {
		overflow-wrap: anywhere;
	}
	.muted {
		color: var(--muted);
	}
	.end {
		padding-right: 0;
		text-align: right;
	}
	form {
		margin: 0;
	}
	button {
		padding: 6px 10px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius);
		background: var(--ground);
		color: var(--ink);
		font: inherit;
		font-weight: 500;
		cursor: pointer;
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	p {
		margin: 0;
	}
	.error {
		color: var(--error);
	}
	@media (max-width: 767px) {
		.page {
			padding: 24px 16px;
		}
	}
</style>

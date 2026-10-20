<script lang="ts">
	let { html }: { html: string } = $props();
</script>

<!-- html comes only from renderHtml (sanitised on the server). -->
<div class="rendered">{@html html}</div>

<style>
	/* The editor's document look (Crepe with DESIGN.md's tokens); --rendered-size sets the scale (15px in comments). */
	.rendered {
		font-family: var(--font-text);
		font-size: var(--rendered-size, 16.5px);
		line-height: 1.6;
		color: var(--ink);
		overflow-wrap: break-word;
	}
	.rendered :global(:is(p, ul, ol, pre, blockquote, table, hr)) {
		margin: 0;
		padding: 4px 0;
	}
	.rendered > :global(:first-child) {
		margin-top: 0;
	}
	.rendered :global(:is(h1, h2, h3, h4, h5, h6)) {
		margin: 0;
		padding: 2px 0;
		font-weight: 400;
		letter-spacing: var(--tracking-heading);
	}
	.rendered :global(h1) {
		font-size: 2.625em;
		line-height: 1.1905;
		margin-top: 32px;
	}
	.rendered :global(h2) {
		font-size: 2.25em;
		line-height: 1.2222;
		margin-top: 28px;
	}
	.rendered :global(h3) {
		font-size: 2em;
		line-height: 1.25;
		margin-top: 24px;
	}
	.rendered :global(h4) {
		font-size: 1.75em;
		line-height: 1.2857;
		margin-top: 20px;
	}
	.rendered :global(h5) {
		font-size: 1.5em;
		line-height: 1.3333;
		margin-top: 16px;
	}
	.rendered :global(h6) {
		font-size: 1.125em;
		font-weight: 700;
		margin-top: 16px;
	}
	.rendered :global(:is(ul, ol)) {
		padding-left: 1.5em;
	}
	.rendered :global(li::marker) {
		color: var(--muted);
	}
	.rendered :global(li:has(> input[type='checkbox'])) {
		list-style: none;
	}
	.rendered :global(input[type='checkbox']) {
		margin: 0 6px 0 -1.4em;
		accent-color: var(--accent);
	}
	.rendered :global(a) {
		color: var(--accent);
	}
	.rendered :global(code) {
		padding: 0 2px;
		border-radius: 4px;
		background: var(--hairline);
		font-family: var(--font-mono);
		font-size: 87.5%;
	}
	/* Code keeps its lines and scrolls sideways, like the editor's. */
	.rendered :global(pre) {
		margin: 4px 0;
		padding: 10px;
		border-radius: var(--radius);
		background: var(--panel);
		overflow-x: auto;
	}
	.rendered :global(pre code) {
		padding: 0;
		background: none;
	}
	.rendered :global(blockquote) {
		padding-left: 16px;
		border-left: 2px solid var(--hairline);
	}
	.rendered :global(hr) {
		height: 1px;
		margin: 12px 0;
		padding: 0;
		border: 0;
		background: var(--hairline);
	}
	.rendered :global(img) {
		max-width: 100%;
		vertical-align: bottom;
	}
	.rendered :global(table) {
		display: block;
		max-width: 100%;
		overflow-x: auto;
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
	}
	/* The editor's table: a hairline grid and a panel-toned header row. */
	.rendered :global(:is(th, td)) {
		padding: 6px 12px;
		border: 1px solid var(--hairline);
	}
	/* A column's Markdown alignment arrives as an align attribute, which any text-align would override. */
	.rendered :global(:is(th, td):not([align])) {
		text-align: left;
	}
	.rendered :global(th) {
		background: var(--panel);
		font-weight: 600;
		white-space: nowrap;
	}
</style>

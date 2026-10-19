import { Crepe, type CrepeConfig } from '@milkdown/crepe';
import { imageSchema, linkSchema } from '@milkdown/kit/preset/commonmark';

// ImageBlock writes the image ratio into the alt text, so it stays off (see alt-text.test.ts).
export const crepeFeatures: CrepeConfig['features'] = { [Crepe.Feature.ImageBlock]: false };

// True for relative URLs and http, https, mailto. Browsers ignore control characters and spaces
// while reading a scheme, so they go before the check (`java\tscript:` is `javascript:`).
export function safeUrl(url: string): boolean {
	const scheme = /^([a-z][a-z\d+.-]*):/i.exec(url.replace(/[\x00-\x20\x7f]/g, ''))?.[1];
	return !scheme || ['http', 'https', 'mailto'].includes(scheme.toLowerCase());
}

type DOMSpec = [string, Record<string, unknown>, ...unknown[]];

// Drops one attribute from a rendered element when its URL is unsafe. Only the DOM changes:
// the mark or node keeps its URL, so the Markdown source is never rewritten.
function dropUnsafe(attr: string, attrs: Record<string, unknown>) {
	const { [attr]: url, ...rest } = attrs;
	return typeof url === 'string' && safeUrl(url) ? attrs : rest;
}

// Renders links and images with an unsafe URL inert: a link without href, an image without src.
export function inertUnsafeUrls(crepe: Crepe) {
	crepe.editor
		.use(
			linkSchema.extendSchema((prev) => (ctx) => {
				const base = prev(ctx);
				return {
					...base,
					toDOM: (mark, inline) => {
						const [tag, attrs, ...rest] = base.toDOM!(mark, inline) as DOMSpec;
						return [tag, dropUnsafe('href', { ...attrs, href: mark.attrs.href }), ...rest] as DOMSpec;
					}
				};
			})
		)
		.use(
			imageSchema.extendSchema((prev) => (ctx) => {
				const base = prev(ctx);
				return {
					...base,
					toDOM: (node) => {
						const [tag, attrs, ...rest] = base.toDOM!(node) as DOMSpec;
						return [tag, dropUnsafe('src', attrs), ...rest] as DOMSpec;
					}
				};
			})
		);
}

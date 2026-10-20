import { CONTENT_TYPES, type ImageType } from '#lib/core/images.ts';

/** An image whose type was read from its bytes; the browser may neither sniff nor run it. */
export const imageResponse = (bytes: Buffer, type: ImageType) =>
	new Response(new Uint8Array(bytes), {
		headers: {
			'content-type': CONTENT_TYPES[type],
			'x-content-type-options': 'nosniff',
			'content-security-policy': "default-src 'none'",
			'cache-control': 'private, max-age=0, must-revalidate'
		}
	});

/** A document as a `.md` download named after its file. */
export function downloadResponse(path: string, source: string): Response {
	// RFC 5987 also reserves ' ( ) *, which encodeURIComponent leaves alone.
	const name = encodeURIComponent(path.split('/').pop()!).replace(
		/['()*]/g,
		(c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
	);
	return new Response(source, {
		headers: {
			'content-type': 'text/markdown; charset=utf-8',
			'content-disposition': `attachment; filename*=UTF-8''${name}`
		}
	});
}

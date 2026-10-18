const BASE = 'http://inkmesh.invalid';

// Parsing like a browser catches the tricks a prefix check misses ("/\evil.com", "/\t/evil.com");
// control characters are refused outright and only the normalised URL is returned, never the raw input.
export function safeNext(next: FormDataEntryValue | string | null): string {
	if (typeof next !== 'string' || !next.startsWith('/') || /[\x00-\x1f\x7f]/.test(next)) return '/';
	const url = URL.parse(next, BASE);
	return url?.origin === BASE ? url.pathname + url.search + url.hash : '/';
}

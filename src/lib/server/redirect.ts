const BASE = 'http://inkmesh.invalid';

// Parsing like a browser catches the tricks a prefix check misses ("/\evil.com", "/\t/evil.com").
export function safeNext(next: FormDataEntryValue | string | null): string {
	return typeof next === 'string' && next.startsWith('/') && new URL(next, BASE).origin === BASE ? next : '/';
}

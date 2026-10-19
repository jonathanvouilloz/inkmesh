import { expect, it } from 'vitest';
import { crossSiteForbidden } from './csrf.ts';

const site = 'http://localhost:4174';
const forbidden = (method: string, path: string, type: string | null, origin: string | null) => {
	const headers = new Headers();
	if (type) headers.set('content-type', type);
	if (origin) headers.set('origin', origin);
	const url = new URL(path, site);
	return crossSiteForbidden(new Request(url, { method, headers }), url);
};
const form = 'multipart/form-data; boundary=x';
const evil = 'https://evil.example';

it('refuses cross-site form posts outside the agent endpoints', () => {
	expect(forbidden('POST', '/demo/a.md?/save', form, evil)).toBe(true);
	expect(forbidden('POST', '/demo/a.md?/save', form, null)).toBe(true);
	expect(forbidden('POST', '/demo/a.md?/save', form, site)).toBe(false);
	expect(forbidden('GET', '/demo/a.md', null, evil)).toBe(false);
	expect(forbidden('POST', '/demo/a.md?/save', 'application/json', evil)).toBe(false);
	expect(forbidden('DELETE', '/demo', null, null)).toBe(true);
	expect(forbidden('PATCH', '/login', 'Application/X-WWW-Form-Urlencoded; charset=utf-8', evil)).toBe(true);
	expect(forbidden('PUT', '/login', 'text/plain', evil)).toBe(true);
	expect(forbidden('POST', '/login', 'application/x-sveltekit-formdata', evil)).toBe(true);
});

it('lets agents through', () => {
	expect(forbidden('POST', '/oauth/token', 'application/x-www-form-urlencoded', null)).toBe(false);
	expect(forbidden('POST', '/oauth/register', 'application/json', null)).toBe(false);
	expect(forbidden('PUT', '/api/v1/workspaces/demo/documents/a.md', 'application/x-www-form-urlencoded', null)).toBe(false);
	expect(forbidden('DELETE', '/api/v1/workspaces/demo/documents/a.md', null, null)).toBe(false);
	expect(forbidden('POST', '/mcp', 'text/plain', evil)).toBe(false);
	expect(forbidden('POST', '/mcp/x', form, evil)).toBe(false);
	for (const path of ['/apix', '/api', '/mcpx', '/oauth/authorize', '/oauth/token/x', '/api/../login'])
		expect(forbidden('POST', path, form, evil)).toBe(true);
});

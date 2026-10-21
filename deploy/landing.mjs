// Serves the static landing page (site/) and sends every other path to the app with a 308,
// so old links (public links, invitations, /mcp) keep working after the app moved to its own host.
// Usage: APP_ORIGIN=https://app.example.com LANDING_PORT=9311 node deploy/landing.mjs site
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? 'site');
const app = process.env.APP_ORIGIN;
const port = Number(process.env.LANDING_PORT ?? 9311);
if (!app) throw new Error('APP_ORIGIN is required');

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
	'.png': 'image/png',
	'.woff2': 'font/woff2'
};

async function file(pathname) {
	let rel;
	try {
		rel = decodeURIComponent(pathname);
	} catch {
		return null;
	}
	const full = resolve(join(root, rel.endsWith('/') ? rel + 'index.html' : rel));
	if (full !== root && !full.startsWith(root + sep)) return null;
	const info = await stat(full).catch(() => null);
	if (!info) return null;
	return info.isDirectory() ? { redirect: pathname + '/' } : { full };
}

createServer(async (req, res) => {
	const url = new URL(req.url, 'http://landing');
	const found = req.method === 'GET' || req.method === 'HEAD' ? await file(url.pathname) : null;
	if (found?.redirect) {
		res.writeHead(301, { Location: found.redirect + url.search }).end();
		return;
	}
	if (!found || !TYPES[extname(found.full)]) {
		res.writeHead(308, { Location: app + req.url }).end();
		return;
	}
	const body = await readFile(found.full);
	res.writeHead(200, {
		'Content-Type': TYPES[extname(found.full)],
		'Cache-Control': 'public, max-age=300',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'strict-origin-when-cross-origin'
	});
	res.end(req.method === 'HEAD' ? undefined : body);
}).listen(port, '127.0.0.1');

import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { assertRole } from './access.ts';
import { commitAuthor, type Actor } from './actor.ts';
import { workspaceDir } from './data.ts';
import { documentFile, encodeUrlPath, writeAtomic } from './documents.ts';
import { gitCommit } from './git.ts';
import { serialised } from './lock.ts';
import { assertFolderName, InvalidContent, resolveInside } from './paths.ts';

export type ImageType = 'png' | 'jpeg' | 'gif' | 'webp';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const CONTENT_TYPES: Record<ImageType, string> = {
	png: 'image/png',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp'
};
const EXTENSIONS: Record<ImageType, string> = {
	png: 'png',
	jpeg: 'jpg',
	gif: 'gif',
	webp: 'webp'
};

const notAnImage = () => Object.assign(new Error('not an image'), { code: 'ENOENT' });

/** The format whose signature `bytes` starts with, or null: what the bytes are, whatever their name says. */
export function imageType(bytes: Uint8Array): ImageType | null {
	const at = (offset: number, sig: string | number[]) => {
		const expected = typeof sig === 'string' ? Buffer.from(sig, 'latin1') : Buffer.from(sig);
		return Buffer.from(bytes.subarray(offset, offset + expected.length)).equals(expected);
	};
	if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
	if (at(0, [0xff, 0xd8, 0xff])) return 'jpeg';
	if (at(0, 'GIF87a') || at(0, 'GIF89a')) return 'gif';
	if (at(0, 'RIFF') && at(8, 'WEBP')) return 'webp';
	return null;
}

/** The format a file name claims, from its extension. */
export function extensionType(name: string): ImageType | null {
	const ext = /\.(png|jpe?g|gif|webp)$/i.exec(name)?.[1].toLowerCase();
	return ext ? (ext === 'jpg' ? 'jpeg' : (ext as ImageType)) : null;
}

/** Stores an uploaded image next to its document under a fresh name and commits it; no event, not indexed. */
export async function saveImage(
	slug: string,
	docPath: string,
	fileName: string,
	bytes: Uint8Array,
	actor: Actor
): Promise<{ path: string; src: string; alt: string }> {
	assertRole(slug, actor, 'editor');
	const root = workspaceDir(slug);
	const doc = documentFile(root, docPath);
	if (!(await fs.stat(doc)).isFile()) throw notAnImage(); // a folder named like a document
	if (bytes.byteLength > MAX_IMAGE_BYTES) throw new InvalidContent('too-large');
	const type = imageType(bytes);
	if (!type || extensionType(fileName) !== type) throw new InvalidContent('not-image');
	return serialised(slug, async () => {
		let file: string;
		for (;;) {
			file = join(
				dirname(doc),
				`${basename(doc, '.md')}-${randomBytes(4).toString('hex')}.${EXTENSIONS[type]}`
			);
			try {
				await writeAtomic(file, bytes, true);
				break;
			} catch (err) {
				if ((err as { code?: unknown }).code !== 'EEXIST') throw err;
			}
		}
		const rel = relative(root, file);
		try {
			await gitCommit(root, {
				paths: [rel],
				message: `Add image ${rel}`,
				author: commitAuthor(actor)
			});
		} catch (err) {
			await fs.unlink(file);
			throw err;
		}
		return {
			path: rel,
			src: encodeUrlPath(basename(file)),
			alt: fileName.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '')
		};
	});
}

/** An image's bytes when its extension and signature agree; core-internal, no role check (public links). */
export async function readImageFile(
	slug: string,
	path: string
): Promise<{ bytes: Buffer; type: ImageType }> {
	const root = workspaceDir(slug);
	const rel = relative(root, resolveInside(root, path));
	if (dirname(rel) !== '.') assertFolderName(dirname(rel));
	const type = extensionType(rel);
	if (!type || basename(rel).startsWith('.')) throw notAnImage();
	const bytes = await fs.readFile(join(root, rel)).catch((err) => {
		throw (err as { code?: unknown }).code === 'EISDIR' ? notAnImage() : err;
	});
	if (imageType(bytes) !== type) throw notAnImage();
	return { bytes, type };
}

export async function readImage(
	slug: string,
	path: string,
	actor: Actor
): Promise<{ bytes: Buffer; type: ImageType }> {
	assertRole(slug, actor, 'reader');
	return readImageFile(slug, path);
}

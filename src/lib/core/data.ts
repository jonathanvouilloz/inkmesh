import path from 'node:path';
import { InvalidPath } from './paths.ts';

export function dataDir(): string {
	return path.resolve(process.env.INKMESH_DATA || '.data');
}

export function workspaceDir(slug: string): string {
	if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) throw new InvalidPath(slug);
	return path.join(dataDir(), 'workspaces', slug);
}

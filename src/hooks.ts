import type { Reroute } from '@sveltejs/kit/hooks';

// Images are linked by their natural URL (next to their document); the raw routes serve them.
const workspaceImage = /^\/(?!api\/)([a-z0-9][a-z0-9-]{1,39})\/(?!-\/)(.+\.(?:png|jpe?g|gif|webp))$/i;
const publicImage = /^\/s\/([A-Za-z0-9_-]{43})\/(?!-\/)(.+\.(?:png|jpe?g|gif|webp))$/i;

export const reroute: Reroute = ({ url }) => {
	const path = url.pathname;
	if (publicImage.test(path)) return path.replace(publicImage, '/s/$1/-/raw/$2');
	if (workspaceImage.test(path)) return path.replace(workspaceImage, '/$1/-/raw/$2');
};

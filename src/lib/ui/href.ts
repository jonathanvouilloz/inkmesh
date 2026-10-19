/** The URL of a document or folder: `/<workspace>/<segments, each URI-encoded>`. */
export function docHref(workspace: string, path: string): string {
	return `/${workspace}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

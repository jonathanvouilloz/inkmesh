import {
	ApiError,
	apiResponse,
	ops,
	readBody,
	requireAgent,
	type WriteMode
} from '#lib/server/agent-api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiResponse(async () => {
		const { actor } = requireAgent(event, null);
		const doc = await ops.read(actor, event.params.workspace, event.params.path);
		return Response.json(doc, { headers: { etag: `"${doc.hash}"` } });
	});

function writeMode(headers: Headers): WriteMode {
	const ifMatch = headers.get('if-match');
	const ifNoneMatch = headers.get('if-none-match');
	if (ifMatch !== null && ifNoneMatch !== null)
		throw new ApiError(400, 'bad_request', 'send If-Match or If-None-Match, not both');
	if (ifNoneMatch !== null) {
		if (ifNoneMatch.trim() !== '*') throw new ApiError(400, 'bad_request', 'If-None-Match only accepts *');
		return 'create';
	}
	if (ifMatch === null) return 'replace';
	const hash = /^\s*"([0-9a-f]{64})"\s*$/.exec(ifMatch)?.[1];
	if (!hash) throw new ApiError(400, 'bad_request', 'If-Match takes one quoted hash');
	return { expectedHash: hash };
}

export const PUT: RequestHandler = (event) =>
	apiResponse(async () => {
		const { actor } = requireAgent(event, null);
		const mode = writeMode(event.request.headers);
		const bytes = await readBody(event.request);
		const doc = await ops.write(actor, event.params.workspace, event.params.path, bytes, mode);
		return Response.json({ path: doc.path, hash: doc.hash }, { status: doc.created ? 201 : 200 });
	});

export const DELETE: RequestHandler = (event) =>
	apiResponse(async () => {
		const { actor } = requireAgent(event, null);
		await ops.remove(actor, event.params.workspace, event.params.path);
		return new Response(null, { status: 204 });
	});

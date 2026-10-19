import { ApiError, apiResponse, ops, requireAgent } from '#lib/server/agent-api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiResponse(async () => {
		const { actor } = requireAgent(event, null);
		return Response.json(await ops.comments(actor, event.params.workspace, event.params.path));
	});

export const POST: RequestHandler = (event) =>
	apiResponse(async () => {
		const { actor } = requireAgent(event, null);
		const body = await event.request.json().catch(() => null);
		if (typeof body?.body !== 'string')
			throw new ApiError(400, 'bad_request', 'the body must be JSON { "body": string }');
		const done = await ops.comment(actor, event.params.workspace, event.params.path, body.body);
		return Response.json(done, { status: 201 });
	});

import { ApiError, apiResponse, ops, requireAgent } from '#lib/server/agent-api.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	apiResponse(async () => {
		const { actor } = requireAgent(event, null);
		const body = await event.request.json().catch(() => null);
		if (typeof body?.from !== 'string' || typeof body?.to !== 'string')
			throw new ApiError(400, 'bad_request', 'the body must be JSON { "from": string, "to": string }');
		return Response.json(await ops.move(actor, event.params.workspace, body.from, body.to));
	});

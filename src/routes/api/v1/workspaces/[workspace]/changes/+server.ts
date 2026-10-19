import { ApiError, apiResponse, ops, requireAgent } from '#lib/server/agent-api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiResponse(async () => {
		const { actor } = requireAgent(event, null);
		const since = event.url.searchParams.get('since');
		if (since !== null && !/^\d{1,15}$/.test(since))
			throw new ApiError(400, 'bad_request', 'since must be an integer ≥ 0');
		return Response.json(ops.changes(actor, event.params.workspace, since === null ? undefined : Number(since)));
	});

import { apiResponse, ops, requireAgent } from '#lib/server/agent-api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiResponse(async () => {
		const { actor } = requireAgent(event, null);
		return Response.json(ops.search(actor, event.params.workspace, event.url.searchParams.get('q') ?? ''));
	});

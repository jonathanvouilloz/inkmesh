import { apiResponse, ops, requireAgent } from '#lib/server/agent-api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiResponse(async () =>
		Response.json(await ops.tree(requireAgent(event, null).actor, event.params.workspace))
	);

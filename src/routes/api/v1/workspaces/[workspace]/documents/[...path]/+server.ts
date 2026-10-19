import { apiResponse, ops, requireAgent } from '#lib/server/agent-api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiResponse(async () => {
		const { actor } = requireAgent(event, null);
		const doc = await ops.read(actor, event.params.workspace, event.params.path);
		return Response.json(doc, { headers: { etag: `"${doc.hash}"` } });
	});

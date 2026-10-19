import { apiResponse, ops, requireAgent } from '#lib/server/agent-api.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = (event) =>
	apiResponse(async () => Response.json(ops.workspaces(requireAgent(event, null).actor)));

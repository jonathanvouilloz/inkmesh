import { error, fail } from '@sveltejs/kit';
import { Forbidden } from '#lib/core/access.ts';
import { agentsOf, createAgent, renameAgent, revokeAgent } from '#lib/core/agents.ts';
import { requireRole } from '#lib/server/guard.ts';
import type { Actions, PageServerLoad } from './$types';

// Agents belong to the user, not the workspace: any member sees and manages all of theirs here.
export const load: PageServerLoad = async ({ params, locals, parent, url }) => {
	await parent(); // the layouts' redirect and 404 come first
	requireRole(params.workspace, locals, 'reader');
	return { agents: agentsOf(locals.actor!.id), mcpUrl: url.origin + '/mcp', apiUrl: url.origin + '/api/v1' };
};

const agentId = (value: FormDataEntryValue | null): number =>
	/^\d{1,15}$/.test(String(value)) ? Number(value) : error(400);

// Another user's agent is a 403.
function attempt(run: () => void) {
	try {
		run();
	} catch (err) {
		if (err instanceof Forbidden) error(403);
		throw err;
	}
}

export const actions: Actions = {
	create: async ({ params, locals, request }) => {
		requireRole(params.workspace, locals, 'reader');
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const kind = (['mcp', 'script'] as const).find((k) => k === form.get('kind')) ?? error(400);
		try {
			return { token: createAgent(locals.actor!.id, name).token, kind };
		} catch (err) {
			if (err instanceof RangeError) return fail(400, { nameError: true, name });
			throw err;
		}
	},
	rename: async ({ params, locals, request }) => {
		requireRole(params.workspace, locals, 'reader');
		const form = await request.formData();
		const id = agentId(form.get('id'));
		try {
			attempt(() => renameAgent(locals.actor!.id, id, String(form.get('name') ?? '')));
		} catch (err) {
			if (err instanceof RangeError) return fail(400, { renameError: true });
			throw err;
		}
	},
	revoke: async ({ params, locals, request }) => {
		requireRole(params.workspace, locals, 'reader');
		const id = agentId((await request.formData()).get('id'));
		attempt(() => revokeAgent(locals.actor!.id, id));
	}
};

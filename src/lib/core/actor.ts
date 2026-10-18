export type Actor = { id: number; name: string; agent?: string };

export function commitAuthor(actor: Actor): { name: string; email: string } {
	return {
		name: actor.agent ? `${actor.name} via ${actor.agent}` : actor.name,
		email: `user-${actor.id}@inkmesh.local`
	};
}

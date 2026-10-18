export type Actor = { id: number; name: string; agent?: string };

// shortcut: single configured actor, no accounts; replaced by sessions in milestone 2
export function currentActor(): Actor {
	return { id: 1, name: process.env.INKMESH_OWNER_NAME || 'Owner' };
}

export function commitAuthor(actor: Actor): { name: string; email: string } {
	return {
		name: actor.agent ? `${actor.name} via ${actor.agent}` : actor.name,
		email: `user-${actor.id}@inkmesh.local`
	};
}

// See https://svelte.dev/docs/kit/types#app.d.ts
import type { User } from '#lib/core/accounts.ts';
import type { Actor } from '#lib/core/actor.ts';
import type { Locale } from '#lib/i18n/index.ts';

declare global {
	namespace App {
		interface Locals {
			locale: Locale;
			user: User | null;
			actor: Actor | null;
		}
	}
}

export {};

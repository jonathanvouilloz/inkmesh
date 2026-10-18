// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Locale } from '#lib/i18n/index.ts';

declare global {
	namespace App {
		interface Locals {
			locale: Locale;
		}
	}
}

export {};

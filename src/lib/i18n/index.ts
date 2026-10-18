import { en } from './en.ts';
import { fr } from './fr.ts';

export type Locale = 'en' | 'fr';

const strings = { en, fr };

export function t(key: keyof typeof en, locale: Locale): string {
	return strings[locale][key];
}

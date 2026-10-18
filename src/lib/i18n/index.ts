import { en } from './en.ts';
import { fr } from './fr.ts';

export type Locale = 'en' | 'fr';

const strings = { en, fr };

/** `vars` fills `{name}` placeholders; an unknown placeholder stays as written. */
export function t(key: keyof typeof en, locale: Locale, vars?: Record<string, string>): string {
	const text = strings[locale][key];
	return vars ? text.replace(/\{(\w+)\}/g, (match, name) => vars[name] ?? match) : text;
}

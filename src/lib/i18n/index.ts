import { en } from './en.ts';
import { fr } from './fr.ts';

export type Locale = 'en' | 'fr';

const strings = { en, fr };

/** `vars` fills `{name}` placeholders; an unknown placeholder stays as written. */
export function t(key: keyof typeof en, locale: Locale, vars?: Record<string, string>): string {
	const text = strings[locale][key];
	return vars ? text.replace(/\{(\w+)\}/g, (match, name) => vars[name] ?? match) : text;
}

type Plural<K> = K extends `${infer Base}.one` ? Base : never;

/** `key.one` or `key.other` by the locale's plural rule for `n`; `{count}` reads `shown` (say "99+"). */
export function tn(key: Plural<keyof typeof en>, n: number, locale: Locale, shown = String(n)): string {
	const form = new Intl.PluralRules(locale).select(n) === 'one' ? 'one' : 'other';
	return t(`${key}.${form}` as keyof typeof en, locale, { count: shown });
}

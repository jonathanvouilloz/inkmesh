import type { Locale } from '#lib/i18n/index.ts';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 31536000],
	['month', 2592000],
	['week', 604800],
	['day', 86400],
	['hour', 3600],
	['minute', 60],
	['second', 1]
];
/** A relative time such as "3 minutes ago", in the reader's language. */
export function ago(iso: string, locale: Locale): string {
	const seconds = (Date.parse(iso) - Date.now()) / 1000;
	const [unit, size] = UNITS.find(([, size]) => Math.abs(seconds) >= size) ?? UNITS[6];
	return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
		Math.round(seconds / size),
		unit
	);
}

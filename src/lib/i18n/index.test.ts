import { describe, expect, it } from 'vitest';
import { t } from './index.ts';
import { en } from './en.ts';
import { fr } from './fr.ts';

describe('t', () => {
	it('returns the string for the locale', () => {
		expect(t('save.saved', 'fr')).toBe('Enregistré');
		expect(t('save.saved', 'en')).toBe('Saved');
	});

	it('has the same keys in both languages', () => {
		expect(Object.keys(fr)).toEqual(Object.keys(en));
	});
});

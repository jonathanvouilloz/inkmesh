import { describe, expect, it } from 'vitest';
import { t, tn } from './index.ts';
import { en } from './en.ts';
import { fr } from './fr.ts';

describe('t', () => {
	it('returns the string for the locale', () => {
		expect(t('save.saved', 'fr')).toBe('Enregistré');
		expect(t('save.saved', 'en')).toBe('Saved');
	});

	it('fills placeholders', () => {
		expect(t('invite.title', 'en', { workspace: 'Demo', role: 'Editor' })).toBe(
			'Join Demo as Editor'
		);
		expect(t('invite.join', 'en', { workspace: 'Demo' })).toBe('Join Demo as {role}');
	});

	it('has the same keys in both languages', () => {
		expect(Object.keys(fr)).toEqual(Object.keys(en));
	});

	it('picks the plural form of the locale', () => {
		expect(tn('comments.resolved', 1, 'fr')).toBe('1 résolu');
		expect(tn('comments.resolved', 2, 'fr')).toBe('2 résolus');
		expect(tn('inbox.unread', 100, 'fr', '99+')).toBe('99+ non lus');
		expect(tn('inbox.unread', 1, 'en')).toBe('1 unread');
	});
});

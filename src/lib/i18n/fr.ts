import type { en } from './en.ts';

export const fr: Record<keyof typeof en, string> = {
	'app.name': 'inkmesh',
	'nav.open': 'Ouvrir la navigation',
	'tree.new': 'Nouveau document',
	'tree.newPath': 'Chemin du nouveau document, ex. notes/idee.md',
	'tree.create': 'Créer',
	'tree.badPath': 'Indiquez un chemin terminé par .md, sans ..',
	'tree.search': 'Rechercher',
	'tree.searchLater': 'La recherche arrive dans une version ultérieure',
	'strip.raw': 'Brut',
	'strip.rich': 'Éditeur',
	'save.saving': 'Enregistrement…',
	'save.saved': 'Enregistré',
	'save.conflict':
		'Ce fichier a changé sur le disque depuis son ouverture. Rechargez pour voir la nouvelle version.',
	'save.error': 'Enregistrement impossible',
	'rail.file': 'Fichier',
	'rail.history': 'Historique',
	'rail.via': 'via',
	'rail.open': 'Détails',
	'editor.raw': 'Markdown brut',
	'editor.placeholder': 'Commencez à écrire, ou tapez / pour un bloc',
	'empty.pick': "Choisissez un document dans l'arborescence"
};

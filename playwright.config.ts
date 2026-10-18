import { defineConfig } from '@playwright/test';

// Own data directory, rebuilt on every run: e2e never touches the developer's .data and always starts from the seed.
const data = './.data-e2e';
process.env.INKMESH_DATA = data;

export default defineConfig({
	webServer: {
		command: `rm -rf ${data} && npm run seed && npm run build && npm run preview`,
		port: 4173
	},
	use: { baseURL: 'http://localhost:4173' },
	testDir: 'e2e',
	// One worker: the files run in order (document, save, shell), so save.spec's commits come after
	// document.spec reads the seeded history.
	workers: 1,
	projects: [
		{ name: 'setup', testMatch: /auth\.setup\.ts/ },
		{
			name: 'chromium',
			dependencies: ['setup'],
			testIgnore: /login\.spec\.ts/,
			use: { storageState: `${data}/owner.json` }
		},
		{
			name: 'anonymous',
			testMatch: /login\.spec\.ts/,
			use: { storageState: { cookies: [], origins: [] } }
		}
	]
});

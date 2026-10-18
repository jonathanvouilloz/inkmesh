import { defineConfig } from '@playwright/test';

process.env.INKMESH_DATA ||= './.data';

export default defineConfig({
	webServer: { command: 'npm run seed && npm run build && npm run preview', port: 4173 },
	use: { baseURL: 'http://localhost:4173' },
	testDir: 'e2e'
});

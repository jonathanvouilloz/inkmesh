import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// The origin check runs in hooks.server.ts (src/lib/server/csrf.ts), minus the agent endpoints.
			csrf: { trustedOrigins: ['*'] }
		})
	],
	test: { include: ['src/**/*.test.ts'] }
});

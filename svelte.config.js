import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = { kit: {
  adapter: adapter(),
  		version: {
        name: Date.now().toString(),        // ideally, this should be something deterministic like the output of `git rev-parse HEAD`
        pollInterval: 60000 * 10            // if undefined, no polling will occur
		}
} };

export default config;

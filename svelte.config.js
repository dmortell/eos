import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = { kit: {
  adapter: adapter(),
  		version: {
        name: Date.now().toString(),        // ideally, this should be something deterministic like the output of `git rev-parse HEAD`
        pollInterval: 10000                  // 10 seconds — for testing; increase to 600000 (10min) for production
		}
} };

export default config;

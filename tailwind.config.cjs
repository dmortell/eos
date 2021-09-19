const { tailwindExtractor } = require("tailwindcss/lib/lib/purgeUnusedStyles");

const mode = process.env.NODE_ENV;
const dev = mode === "development";
// console.log('tailwind:', {mode,dev})

module.exports = {
	mode: "aot",
	future: { purgeLayersByDefault: true, removeDeprecatedGapUtilities: true, },
	purge: {
		enabled: !dev,		// todo disable purge in dev
		content: [ "./src/**/*.{html,js,svelte,ts}", ],
		options: {
			defaultExtractor: (content) => [
				// If this stops working, please open an issue at https://github.com/svelte-add/tailwindcss/issues rather than bothering Tailwind Labs about it
				...tailwindExtractor(content),
				// Match Svelte class: directives (https://github.com/tailwindlabs/tailwindcss/discussions/1731)
				...[...content.matchAll(/(?:class:)*([\w\d-/:%.]+)/gm)].map(([_match, group, ..._rest]) => group),
			],
		},
		safelist: [/^svelte-[\d\w]+$/],
	},
	theme: { extend: { screens: { 'print': {'raw': 'print'}, }, }, },
	variants: { extend: {}, },
	plugins: [],
};



// module.exports = {
// 	purge: {
// 		enabled: !dev,		// disable purge in dev
// 		content: ["./src/**/*.{html,js,svelte,ts}"],
// 		options: {
// 			defaultExtractor: (content) => [
// 				...tailwindExtractor(content),
// 				// Match Svelte class: directives (https://github.com/tailwindlabs/tailwindcss/discussions/1731)
// 				...[...content.matchAll(/(?:class:)*([\w\d-/:%.]+)/gm)].map(([_match, group, ..._rest]) => group),
// 			],
// 		},
// 		safelist: [/^svelte-[\d\w]+$/],
// 	},
// 	theme: {
// 		extend: {
// 			screens: { 'print': {'raw': 'print'}, },
// 		},
// 	},
// };

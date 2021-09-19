const { tailwindExtractor } = require("tailwindcss/lib/lib/purgeUnusedStyles");

const mode = process.env.NODE_ENV;
const dev = mode === "development";
// console.log('tailwind:', {mode,dev})

module.exports = {
	mode: "aot",
	future: { purgeLayersByDefault: true, removeDeprecatedGapUtilities: true, standardFontWeights: true, defaultLineHeights: true,},
	purge: {
		enabled: !dev,		// disable purge in dev so we can access other css in devtools
		content: [ "./src/**/*.{html,js,svelte,ts}", ],
		options: {
			keyframes: true,
			defaultExtractor: (content) => [
				...tailwindExtractor(content),
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

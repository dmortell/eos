const { tailwindExtractor } = require("tailwindcss/lib/lib/purgeUnusedStyles");
const mode = process.env.NODE_ENV;
const dev = mode === "development";
console.log('tailwind.config.js running in',mode)

// By default Tailwind only removes unused classes it generates itself, or explicitly wrapped in a @layer directive
// To remove all unused styles, set mode: 'all' and preserveHtmlElements: false and be very careful to provide the paths to all files that might reference any classes or HTML elements

module.exports = {
	mode: "jit",				// mode: "aot",
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
			// safelist: [ 'bg-blue-500', 'text-center', 'hover:opacity-100', 'lg:text-right', ],
		},
		safelist: [/^svelte-[\d\w]+$/],
	},
	theme: { extend: { screens: { 'print': {'raw': 'print'}, }, }, },
	variants: { extend: {}, },
	plugins: [],
};
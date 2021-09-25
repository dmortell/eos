const tailwindcss = require("tailwindcss");
const autoprefixer = require("autoprefixer");
const cssnano = require("cssnano");				// CSS compressor

const mode = process.env.NODE_ENV;
const dev = mode === "development";

module.exports = {
	plugins: [
		tailwindcss,		// require("tailwindcss")
		autoprefixer,		// require('autoprefixer'),
		!dev && cssnano({ preset: [ "default", { discardComments: { removeAll: true } }, ], }),
	],
};

// module.exports = {
// 	plugins: [
// 	  require('postcss-import'),
// 	  require('tailwindcss')(),
// 	  require('postcss-preset-env')({ stage: 1 }),
// 	],
// };
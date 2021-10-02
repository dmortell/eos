// const tailwindcss = require("tailwindcss");
const autoprefixer = require("autoprefixer");
const cssnano = require("cssnano");				// CSS compressor PostCSS plugin
const mode = process.env.NODE_ENV;
const dev = mode === "development";

module.exports = {
	plugins: [
		// tailwindcss,
		autoprefixer,
		!dev && cssnano({ preset: [ "default"], }),
	],
};

// module.exports = {
// 	plugins: [
// 	  require('postcss-import'),
// 	  require('tailwindcss')(),
// 	  require('postcss-preset-env')({ stage: 1 }),
// 	],
// };
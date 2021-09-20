const tailwindcss = require("tailwindcss");
const autoprefixer = require("autoprefixer");
const cssnano = require("cssnano");				// CSS compressor

const mode = process.env.NODE_ENV;
const dev = mode === "development";

module.exports = {
	plugins: [
		tailwindcss,		// or require("tailwindcss")
		autoprefixer,
		!dev && cssnano({ preset: [ "default", { discardComments: { removeAll: true } }, ], }),
	],
};
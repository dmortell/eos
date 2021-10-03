const preprocess = require("svelte-preprocess");	// https://github.com/sveltejs/svelte-preprocess/blob/main/docs/usage.md
module.exports = {
	preprocess: [ preprocess({ postcss: false }), ],
};

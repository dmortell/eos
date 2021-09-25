import { defineConfig } from 'vite'		// see // https://vitejs.dev/config/
import { svelte } from '@sveltejs/vite-plugin-svelte'
import {resolve} from 'path'
import preprocess from 'svelte-preprocess';
// import WindiCSS from 'vite-plugin-windicss';
// import ViteComponents from 'vite-plugin-components';		// Ondemand components auto importing for Vite/Vue - deprecated renamed to `unplugin-vue-components`
// purgeCss not used - using cssnano in pastcss.js and tailwindExtractor.purgeUnusedStyles() in tailwind.cjs to purge unused styles

export default defineConfig({
	server: {
		fs: { strict: true, },			// turn off "Unrestricted file system access" warnings
	},
	// base: '/eire-eos/dist/',
	// root: './',
	// publicDir: resolve(__dirname, 'public'),
	processCssUrls: true,
	build: {
		// target: ['es2019', 'chrome61', 'edge18', 'firefox60', 'safari16'], // default esbuild config with edge18 instead of edge16
		manifest: true,
		minify: true,
		brotliSize: true,
		chunkSizeWarningLimit: 1000, // allow compressing large files (default is 500) by slowing the build. Please consider that Brotli reduces bundles size by 80%!
    //   sourcemap: true,
	// 	outDir: resolve(__dirname, 'dist'),
	// 	assetsInlineLimit: 0,
	// 	emptyOutDir: true,
	},
	rollupDedupe: ['svelte'],
	resolve: {
		alias: {								// Must also add these paths to compilerOptions in jsconfig.json for VSCode
			$js: resolve('./src/js'),			// resolve(__dirname, './src/js'),
			$lib: resolve('./src/lib'),
			$pages: resolve('./src/pages'),
		}
	},
	plugins: [svelte({ preprocess: preprocess({ postcss: true }) })],		// to parse ts, postcss, less, pug files
	//plugins: [svelte({ preprocess: preprocess() })],						// to parse ts, postcss, less, pug files
	// plugins: [svelte()],
})
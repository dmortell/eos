import { defineConfig } from 'vite'		// see // https://vitejs.dev/config/
import { svelte } from '@sveltejs/vite-plugin-svelte'
import {resolve} from 'path'
import preprocess from 'svelte-preprocess';
// import WindiCSS from 'vite-plugin-windicss';
// purgeCss is called in tailwind.config.js to purge unused css styles
// so dont use dynamic class names like class="text-{{error ? 'red':'green'}}-600">
// instead, use complete class names like class={error ? 'text-red-600':'text-green-600'}
// cssnano in postcss.js conpresses css

// export default defineConfig(({ command, mode }) => {
//   if (command === 'serve') return {}      // serve specific config
//   else return {} 										      // build specific config
// })

export default defineConfig({
	server: {
		fs: { strict: true, },			// turn off "Unrestricted file system access" warnings
	},
	// root: './',										// location of index.html
	// base: '/eire-eos/dist/',			// base public path when served
	// publicDir: resolve(__dirname, 'public'),			// assets (served at / in dev and copied to outDir in build)
	// processCssUrls: true,
	build: {
		// target: ['es2019', 'chrome61', 'edge18', 'firefox60', 'safari16'], // default esbuild config with edge18 instead of edge16
		// manifest: true,								// generate manifest.json with map of non-hashed asset filenames to hashed versions
		// minify: true,									// default is 'terser' which is slower but smaller. 'esbuild' is faster but larger
		// brotliSize: false,								// default true. enables brotli compressed size reporting
		// chunkSizeWarningLimit: 1000, // warning limit for compressing large files (default is 500) by slowing the build. Please consider that Brotli reduces bundles size by 80%!
    // sourcemap: true,							// generate prod sourcemaps
		// outDir: resolve(__dirname, 'dist'),
		// assetsInlineLimit: 0,
		// emptyOutDir: true,
	},
	// rollupDedupe: ['svelte'],
	resolve: {
		alias: {								// Must also add these paths to compilerOptions in jsconfig.json for VSCode
			$js: resolve('./src/js'),			// resolve(__dirname, './src/js'),
			$lib: resolve('./src/lib'),
			$pages: resolve('./src/pages'),
		}
	},
	plugins: [svelte()]				//   plugins: [svelte({ preprocess: preprocess() })],
	// plugins: [svelte({ preprocess: preprocess({ postcss: false }) })],		// to parse ts, postcss, less, pug files
})
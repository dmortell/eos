import { defineConfig } from 'vite'		// see // https://vitejs.dev/config/
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'path'
export default defineConfig({
	server: {
		fs: { strict: false, },			// turn off "Unrestricted file system access" warnings
	},
	// base: '/eire-eos/dist/',
	// root: './',
	// publicDir: path.resolve(__dirname, 'public'),
	// build: {
	// 	outDir: path.resolve(__dirname, 'dist'),
	// 	assetsInlineLimit: 0,
	// 	emptyOutDir: true,
	// },
	resolve: {
		alias: {						// Must also add these paths to compilerOptions in jsconfig.json for VSCode
			$js: path.resolve('./src/js'),
			$lib: path.resolve('./src/lib'),
			$pages: path.resolve('./src/pages'),
		}
	},
	plugins: [svelte()]
})
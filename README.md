# Svelte + Vite

This template should help get you started developing with Svelte in Vite.


npm install tailwindcss@npm:@tailwindcss/postcss7-compat postcss@^7 autoprefixer@^9
npm install tailwindcss@npm:@tailwindcss/postcss7-compat postcss-cli@^7 autoprefixer@^9 concurrently cross-env --save-dev
<!-- Add cssnano for further compression of css -->

<!-- Try WindiCSS instead of Tailwind https://github.com/windicss/vite-plugin-windicss -->

  // icons https://www.npmjs.com/package/@mdi/js
  // find icons here https://materialdesignicons.com/

## tsconfig.json showing error
Seems to be a bug in latest version of vsc? https://github.com/microsoft/vscode/issues/132531

settings.json
	// "svelte.enable-ts-plugin": true,

## Initial build size

```
> npm vite build

vite v2.5.10 building for production...
✓ 9 modules transformed.
dist/assets/svelte.d72399d3.png   5.06 KiB
dist/index.html                   0.49 KiB
dist/assets/index.36259e27.css    0.87 KiB / brotli: 0.39 KiB
dist/assets/index.1caec9c3.js     2.14 KiB / brotli: 0.94 KiB
dist/assets/vendor.76e3af60.js    3.11 KiB / brotli: 1.30 KiB
PS F:\WebSrv\xampp-5.6\htdocs\eire-eos>
```

## Build size
Build size with Firebase, Tailwindcss

✓ 93 modules transformed.
dist/index.html                   1.95 KiB
dist/manifest.json                0.33 KiB
dist/assets/vendor.3e03fd40.css   3.05 KiB / brotli: 0.76 KiB
dist/assets/index.16c2b101.css    43.19 KiB / brotli: 7.91 KiB
dist/assets/index.f523f608.js     90.75 KiB / brotli: 21.76 KiB
dist/assets/vendor.798394b4.js    604.52 KiB / brotli: 113.98 KiB

todo: restore "checkJs": true in jsconfig.json

## Recommended IDE Setup

[VSCode](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode).

## Need an official Svelte framework?

Check out [SvelteKit](https://github.com/sveltejs/kit#readme), which is also powered by Vite. Deploy anywhere with its serverless-first approach and adapt to various platforms, with out of the box support for TypeScript, SCSS, and Less, and easily-added support for mdsvex, GraphQL, PostCSS, Tailwind CSS, and more.

## Technical considerations

**Why use this over SvelteKit?**

- It brings its own routing solution which might not be preferable for some users.
- It is first and foremost a framework that just happens to use Vite under the hood, not a Vite app.
  `vite dev` and `vite build` wouldn't work in a SvelteKit environment, for example.

This template contains as little as possible to get started with Vite + Svelte, while taking into account the developer experience with regards to HMR and intellisense. It demonstrates capabilities on par with the other `create-vite` templates and is a good starting point for beginners dipping their toes into a Vite + Svelte project.

Should you later need the extended capabilities and extensibility provided by SvelteKit, the template has been structured similarly to SvelteKit so that it is easy to migrate.

**Why `global.d.ts` instead of `compilerOptions.types` inside `jsconfig.json` or `tsconfig.json`?**

Setting `compilerOptions.types` shuts out all other types not explicitly listed in the configuration. Using triple-slash references keeps the default TypeScript setting of accepting type information from the entire workspace, while also adding `svelte` and `vite/client` type information.

**Why include `.vscode/extensions.json`?**

Other templates indirectly recommend extensions via the README, but this file allows VS Code to prompt the user to install the recommended extension upon opening the project.

**Why enable `checkJs` in the JS template?**

It is likely that most cases of changing variable types in runtime are likely to be accidental, rather than deliberate. This provides advanced typechecking out of the box. Should you like to take advantage of the dynamically-typed nature of JavaScript, it is trivial to change the configuration.

**Why is HMR not preserving my local component state?**

HMR state preservation comes with a number of gotchas! It has been disabled by default in both `svelte-hmr` and `@sveltejs/vite-plugin-svelte` due to its often surprising behavior. You can read the details [here](https://github.com/rixo/svelte-hmr#svelte-hmr).

If you have state that's important to retain within a component, consider creating an external store which would not be replaced by HMR.

```js
// store.js
// An extremely simple external store
import { writable } from 'svelte/store'
export default writable(0)
```

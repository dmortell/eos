# EOS

A time sheet system built with Vite, Svelte and Firebase with Chota, and deployed to Vercel.
Work in progress.

# Installation

`pnpm` is recommended instead of `npm` as it saves a lot of disk space used by duplicate node_modules if you are working on muiltiple projects.
On MacOs use `sudo pnpm` instead of `npm`.

If you prefer typescript, install vite with the `--template svelte-ts` option.

Icons are from https://www.npmjs.com/package/@mdi/js. Find icons here https://materialdesignicons.com/

```
pnpm init vite@latest <project_folder> --template svelte
cd <project_folder>
pnpm install
pnpm i firebase @mdi/js
pnpm i -D chota svelte-chota svelte-preprocess svelte-select
pnpm run dev
```

Add `paths` to jsconfig.json and `resolve.alias` to vite.config.js to allow resolving aliases in imports.


## jsconfig.json error
You can ignore the source-map not found errors in `jsconfig.json`, but if you find the errors annoying then the following link suggests installing source-map types 0.5.2 https://github.com/DefinitelyTyped/DefinitelyTyped/issues/23649

`npm install @types/source-map@0.5.2`

<!-- Seems to be a bug in latest version of vsc? https://github.com/microsoft/vscode/issues/132531

settings.json
	// "svelte.enable-ts-plugin": true, -->

## Build error
If you get a PostCSS 8 error when you build your project with Tailwind, you may need to either update your PostCSS to v8 (which may break other dependencies) or use tailwind/postcss7-compat as described here https://tailwindcss.com/docs/installation#post-css-7-compatibility-build


## Initial build size

```
> npm vite build

vite v2.5.10 building for production...
✓ 9 modules transformed.
dist/index.html                   0.49 KiB
dist/assets/index.36259e27.css    0.87 KiB / brotli: 0.39 KiB
dist/assets/index.1caec9c3.js     2.14 KiB / brotli: 0.94 KiB
dist/assets/vendor.76e3af60.js    3.11 KiB / brotli: 1.30 KiB
```

## Build size
Build size with Firebase and Tailwindcss
```
✓ 93 modules transformed.
dist/index.html                   1.95 KiB
dist/manifest.json                0.33 KiB
dist/assets/vendor.3e03fd40.css   3.05 KiB / brotli: 0.76 KiB
dist/assets/index.16c2b101.css    43.19 KiB / brotli: 7.91 KiB
dist/assets/index.f523f608.js     90.75 KiB / brotli: 21.76 KiB
dist/assets/vendor.798394b4.js    604.52 KiB / brotli: 113.98 KiB
```

After removing tailwind
```
✓ 110 modules transformed.
dist/index.html                   1.64 KiB
dist/assets/vendor.c38dee97.css   11.15 KiB / gzip: 2.66 KiB
dist/assets/index.bd062de8.css    28.60 KiB / gzip: 6.07 KiB
dist/assets/index.7ecb0b0d.js     106.91 KiB / gzip: 31.89 KiB
dist/assets/vendor.23c8b66c.js    645.55 KiB / gzip: 153.80 KiB
```

Next try reducing Firebase size

## Recommended IDE Setup

[VSCode](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode).


# Commit to github

Committing to github makes it very easy to deploy your app to Vercel.

1) If you want to sync to github, navigate to the local project root directory and create a local git repository:
 `git init`

2) Once that is successful, click on the 'Source Control' icon on the left navbar in VS-Code. One should be able to see files ready to be commit-ed. Press on 'Commit' button, provide comments, stage the changes and commit the files. Alternatively you can run from CLI
`git commit -m "Your comment"`

3) Now visit your GitHub account and create a new Repository. Exclude creating 'README.md', '.gitignore' files. Also do not add any License to the repo. Sometimes these settings cause issues while pushing in.

4) Copy the link to your newly created GitHub Repository. `https://github.com/<username>/eos.git`

5) Come back to the terminal in VS-CODE and type these commands in succession:
```
git branch -M main
git remote add origin <Link to GitHub Repo>    // maps the remote repo link to local git repo
git remote -v                                  // verify the link to the remote repo
git push -u origin main                        // pushes the commit-ed changes into the remote repo
```

Note: If it is the first time the local git account is trying to connect to GitHub, you may be required to enter credentials to GitHub in a separate window.

6) You can see the success message in the Terminal. You can also verify by refreshing the GitHub repo online.

# Configure Firebase

Setup a Firebase Firestore database.
Click the Project Overview cogwheel and select Project Settings.
Add an App, then copy the `const firebaseConfig = { };` settings to stores.js

## Set up firebase hosting

To enable email verifications you will need Dynamic Links which is a service of firebase hosting.

```
npm install -g firebase-tools
```

Open a terminal window and navigate to or create a root directory for your web app
```
firebase login
firebase init
```

When you are ready to deploy your web app

```
firebase deploy
```

After deploying, view your app at `sunny-jetty-180208.web.app`

# Secure Firebase

```
// Set up Firestore in your project directory, creates a .rules file
firebase init firestore

// Edit the generated .rules file to your desired security rules
// ...

// Deploy your .rules file
firebase deploy --only firestore:rules
```

# Microsoft Azure

https://azure.microsoft.com/en-us/ click Azure Portal in your profile avatar.
https://portal.azure.com/ select Azure Active Directory from the top-left hamburger.
Set your tenant Id in the microsoftSignin() function in stores.js
Find App Registrations and create an app or select your existing app
In Manage > Authentication, click Redirect URLs and add an URI to your app URL when for Azure to redirect to after authentication eg `https://your-app.firebaseapp.com/__/auth/handler` then click Save.
(Get the redirect URL from Firebase > Authentication > Microsoft)

<!-- https://your-app.vercel.app/ -->

# Deploy to Vercel

You can deploy your app to Vercel via github. To deploy the app, follow these steps.
1. Register for an account with Vercel.
2. Navigate to the root of your app and run `npx vercel`. The first time you do it, you'll be prompted to enter your email address, and follow the steps in the email sent to that address, for security purposes.
3. Run `npx vercel` again, and you'll be prompted to answer a few questions

```
? Set up and deploy “F:\htdocs\eos”? [Y/n] y
? Which scope do you want to deploy to? dmortell
? Link to existing project? [y/N] n
? What’s your project’s name? eos
? In which directory is your code located? ./
> Upload [====================] 99% 0.0sAuto-detected Project Settings (Vite):
- Build Command: `npm run build` or `vite build`
- Output Directory: dist
- Development Command: vite
? Want to override the settings? [y/N] n
🔗  Linked to dmortell/eos (created .vercel and added it to .gitignore)
🔍  Inspect: https://vercel.com/dmortell/eire-eos/Cb67K34BWm2xXYKnuskz5LgRAFJa [1s]
✅  Production: https://eire-eos.vercel.app [copied to clipboard] [2m]
📝  Deployed to production. Run `vercel --prod` to overwrite later (https://vercel.link/2F).
💡  To change the domain or build command, go to https://vercel.com/dmortell/eire-eos/settings
```

After making a local git commit, click the refresh at bottom-left of VSC to push to github, then your app should be automatically deployed to Vercel.

To enable sign-in to your Vercel app, in Firebase > Authentication > Sign-in Method, add the Vercel domain `your-app.vercel.app` to Authorised Domains
<!-- // This domain (eos-gamma.vercel.app) is not authorized to run this operation. Add it to the OAuth redirect domains list in the Firebase console -> Auth section -> Sign in method tab.
https://eos-gamma.vercel.app/ -->

You could also consider deploying to https://surge.sh/ as an alternative to Vercel

## URLs to assets

Local assets are normally referenced as relative to the index.html.
Put images and other assets in your project `/public` folder.
The css for components styles will be generated in the dist/assets folder.

`background: url(/logo.png) transparent 5px 50% no-repeat;`

Use a relative URL in index.html, or else set a base URL in vite.config.js and jsconfig.json
`<link rel="icon" href="./favicon.ico">`


## Technical considerations

**Why use this over SvelteKit?**

- It brings its own routing solution which might not be preferable for some users.
- It is first and foremost a framework that just happens to use Vite under the hood, not a Vite app.
  `vite dev` and `vite build` wouldn't work in a SvelteKit environment, for example.

**Why `global.d.ts` (`vite-end.d.ts`) instead of `compilerOptions.types` inside `jsconfig.json` or `tsconfig.json`?**

Setting `compilerOptions.types` shuts out all other types not explicitly listed in the configuration. Using triple-slash references keeps the default TypeScript setting of accepting type information from the entire workspace, while also adding `svelte` and `vite/client` type information.

**Why include `.vscode/extensions.json`?**

Other templates indirectly recommend extensions via the README, but this file allows VS Code to prompt the user to install the recommended extension upon opening the project.

**Why is HMR not preserving my local component state?**

HMR state preservation comes with a number of gotchas! It has been disabled by default in both `svelte-hmr` and `@sveltejs/vite-plugin-svelte` due to its often surprising behavior. You can read the details [here](https://github.com/rixo/svelte-hmr#svelte-hmr).

If you have state that's important to retain within a component, consider creating an external store which would not be replaced by HMR.

```js
// store.js
// An extremely simple external store
import { writable } from 'svelte/store'
export default writable(0)
```

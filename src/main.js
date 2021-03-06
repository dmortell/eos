// import "./tailwind.css"
import 'chota';
import "./global.css"
import App from './App.svelte'
// import '../functions/index.js'
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
	document.body.classList.add('dark');
}
const app = new App({ target: document.body, props:{} });		// Mount Svelte App
export default app;
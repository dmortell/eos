import "./tailwind.css"
import 'chota';
import "./global.css"
import App from './App.svelte'
const app = new App({ target: document.body });		// Mount Svelte App

// if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
// 	document.body.classList.add('dark');
// }
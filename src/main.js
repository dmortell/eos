import "./tailwind.css"
import 'chota';
import "./global.css"
import App from './App.svelte'
const el = document.getElementById("app-loading").style.display = "none";
const app = new App({ target: document.body, props:{} });		// Mount Svelte App

// if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
// 	document.body.classList.add('dark');
// }
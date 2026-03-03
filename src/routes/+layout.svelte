<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.ico';
	import { setContext } from 'svelte';
	import { Session, Firestore } from '$lib';
	let { children } = $props();

	class App { locale = $state('ja') }
	let settings = new App();
	let session = new Session()
	let db = new Firestore();
	setContext('settings', settings)
	setContext('session', session)
	setContext('db', db)
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>EOS</title>
</svelte:head>

{@render children()}

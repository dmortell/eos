<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.ico';
	import { setContext } from 'svelte';
	import { Session, Firestore, Titlebar, Spinner } from '$lib';
	let { children } = $props();

	class App { locale = $state('ja') }
	let settings = new App();
	let session = new Session()
	let db = new Firestore();
	setContext('settings', settings)
	setContext('session', session)
	setContext('db', db)

	// Delay showing login card to avoid flicker on refresh for authenticated users
	let showLogin = $state(false)
	let loginTimer: ReturnType<typeof setTimeout> | null = null
	$effect(() => {
		if (session.user === null && !showLogin) {
			loginTimer = setTimeout(() => { showLogin = true }, 300)
		} else if (session.user) {
			showLogin = false
			if (loginTimer) { clearTimeout(loginTimer); loginTimer = null }
		}
		return () => { if (loginTimer) clearTimeout(loginTimer) }
	})
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>EOS</title>
</svelte:head>

{#if session.user===undefined || (session.user===null && !showLogin)}
	<Titlebar>Loading...</Titlebar>
{:else if 1 || session.user===null}
	<Titlebar/>
	<div class="flex items-center justify-center min-h-[calc(100vh-3rem)]">
		<div class="bg-white border border-gray-200 rounded-md shadow-lg px-10 py-8 max-w-sm w-full text-center space-y-4">
			<div class="mx-auto w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
				<svg class="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
				</svg>
			</div>
			<h2 class="text-lg font-semibold text-gray-800">Sign in</h2>
			<p class="text-sm text-gray-500">Use an authorized email address to continue.</p>
			<button
				class="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors"
				onclick={() => session.login('google')}
			>
				<svg class="w-4 h-4" viewBox="0 0 24 24">
					<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
					<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
					<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
					<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
				</svg>
				Sign in with Google
			</button>
		</div>
	</div>
{:else}
{@render children()}
{/if}

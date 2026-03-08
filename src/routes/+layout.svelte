<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.ico';
	import { setContext } from 'svelte';
	import { Session, Firestore, Titlebar, Spinner } from '$lib';
	// import { MetalButton } from '$lib';
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
{:else if 0 || session.user===null}
	<Titlebar/>
	<div class="fixed inset-0 top-7 bg-linear-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
		<!-- Subtle sheen overlay -->
		<div class="absolute inset-0 opacity-20 bg-linear-to-t from-transparent to-green/80"></div>

		<div class="relative max-w-4xl w-full">
			<div class="rounded-3xl border border-gray-700 shadow-2xl overflow-hidden bg-gray-900/50 backdrop-blur">
				<div class="grid grid-cols-2 gap-0">
					<!-- Left column: Sign in -->
					<div class="flex flex-col justify-center px-12 py-16 space-y-8">
						<div class="text-center">
							<h2 class="text-3xl font-bold text-white mb-2">Get started with EOS</h2>
							<p class="text-sm text-gray-400">Sign in to access your dashboard and manage projects.</p>
						</div>

						<div class="space-y-3">
							<button
								class="w-full flex items-center justify-center gap-3 rounded-xl bg-white hover:bg-gray-100 px-4 py-3 text-sm font-medium text-gray-900 shadow-sm transition-all duration-200"
								onclick={() => session.login('google')}
							>
								<svg class="w-5 h-5" viewBox="0 0 24 24">
									<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
									<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
									<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
									<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
								</svg>
								Continue with Google
							</button>
						</div>

						<div class="text-xs text-gray-500 text-center">
							By continuing, you agree to our <button type="button" class="text-blue-400 hover:text-blue-300 hover:underline font-medium">Privacy Policy</button> and <button type="button" class="text-blue-400 hover:text-blue-300 hover:underline font-medium">Terms of Use</button>
						</div>
					</div>

					<!-- Right column: Feature messaging  📦  -->
					<div class="flex flex-col justify-center items-center px-12 py-16 bg-linear-to-br from-gray-800/50 to-gray-900/80 border-l border-gray-700 space-y-8">
						<div class="space-y-4 text-center">
							<div class="text-5xl">

								<!-- <MetalButton variant="gold" icon="grid" onclick={(e) => {}}></MetalButton> -->
								<!-- <MetalButton variant="cyan" icon="plus">Power</MetalButton> -->
								<!-- <MetalButton variant="yellow">Launch System</MetalButton> -->
								<!-- <MetalButton variant="red" icon="grid" onclick={e => console.log(e)} /> -->

							</div>
							<h3 class="text-xl font-semibold text-white">Manage Your Projects</h3>
							<p class="text-sm text-gray-400">Organize tasks, track progress, and collaborate with your team seamlessly.</p>
						</div>

						<!-- <div class="w-full h-32 rounded-2xl bg-linear-to-br from-blue-500/20 to-purple-600/20 border border-gray-700/50 flex items-center justify-center">
							<div class="text-3xl opacity-50 text-slate-100">→</div>
						</div> -->

						<p class="text-xs text-gray-500">Fast, intuitive, and built for teams</p>
					</div>
				</div>
			</div>
		</div>
	</div>
{:else}
{@render children()}
{/if}

<script lang="ts">
  import './layout.css';
  import favicon from '$lib/assets/favicon.ico';
	import { Toaster } from '$lib/components/ui/sonner';
  import { setContext } from 'svelte';
  import { Session, Firestore, Titlebar, Spinner, MetalButton } from '$lib';
  import LoginScreen from './LoginScreen.svelte';
  let { children } = $props();

  class App { locale = $state('ja') }
  let settings = new App();
  let session = new Session()
  let db = new Firestore();
  setContext('settings', settings)
  setContext('session', session)
  setContext('db', db)

  // Email auth state
  let authMode = $state<'signin' | 'register'>('signin')
  let email = $state('')
  let password = $state('')
  let authSuccess = $state<string | null>(null)
  let authError = $state<string | null>(null)
  let authLoading = $state(false)

  async function handleEmailAuth() {
    if (!email || !password) {
      authError = 'Please enter both email and password'
      return
    }
    authSuccess = null
    authLoading = true
    authError = null
    try {
      if (authMode === 'signin') {
        await session.loginWithEmail(email, password)
        email = ''
        password = ''
      } else {
        await session.registerWithEmail(email, password)
        // After successful registration, switch to signin and show message
        email = ''
        password = ''
        authMode = 'signin'
        authSuccess = 'Account created successfully! Please sign in.'
      }
    } catch (error: any) {
      authError = (error.message || 'Authentication failed').replace(/^Firebase:\s*/i, '')
    } finally {
      authLoading = false
    }
  }

  // Delay showing login card to avoid flicker on refresh for authenticated users
  let showLogin = $state(false)
  let loginTimer: ReturnType<typeof setTimeout> | null = null
  $effect(() => {
    if (session.user === null && !showLogin) {
      loginTimer = setTimeout(() => { showLogin = true }, 400)
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

<Toaster />

{#if session.user===undefined || (session.user===null && !showLogin)}

  <Titlebar>Loading...</Titlebar>

{:else if 0 || session.user===null}

	<Titlebar/>
	<LoginScreen />

{:else}

  {@render children()}

{/if}

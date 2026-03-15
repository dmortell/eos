<script lang="ts">
	import { MetalButton, type Session } from "$lib";
	import { getContext } from "svelte";

  let session = getContext('session') as Session;

  // Email auth state
  let authMode = $state<'signin' | 'register'>('signin')
  let authSuccess = $state<string | null>(null)
  let authError = $state<string | null>(null)
  let authLoading = $state(false)
  let email = $state('')
  let password = $state('')

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
        authSuccess = 'Account created, please sign in.'
      }
    } catch (error: any) {
      authError = (error.message || 'Authentication failed').replace(/^Firebase:\s*/i, '')
    } finally {
      authLoading = false
    }
  }
</script>


	<!-- Login / Register Screen -->
  <div class="fixed inset-0 top-7 bg-linear-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
    <!-- Subtle sheen overlay -->
    <div class="absolute inset-0 opacity-20 bg-linear-to-t from-transparent to-green/80"></div>

    <div class="relative max-w-4xl w-full">
      <div class="rounded-3xl border border-gray-700 shadow-2xl overflow-hidden bg-gray-900/50 backdrop-blur">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-0">
          <!-- Left column: Sign in -->
          <div class="flex flex-col justify-center px-6 md:px-12 py-8 md:py-16 space-y-6">
            <div class="text-center">
              <h2 class="text-3xl font-sans tracking-wider font-semibold text-slate-100 mb-2">Get started with EOS</h2>
              <p class="text-sm text-gray-400">Sign in to access your dashboard and manage projects.</p>
            </div>

            <!-- Tab switcher -->
            <div class="flex gap-2 p-1 rounded-lg bg-gray-800/50 border border-gray-700">

              <button onclick={() => { authMode = 'signin'; authError = null; authSuccess = null }}
                class="flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 {authMode === 'signin' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}"
              >Sign In</button>

              <button onclick={() => { authMode = 'register'; authError = null; authSuccess = null }}
                class="flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 {authMode === 'register' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}"
              >Register</button>

            </div>

            <!-- Email/Password Form -->
            <form class="space-y-3" onsubmit={(e) => { e.preventDefault(); handleEmailAuth() }}>
              <div>
                <input bind:value={email} autocomplete="email" type="email" placeholder="Email address" disabled={authLoading}
                  class="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                />
              </div>
              <div>
							{#if authMode === 'signin'}
                <input bind:value={password} autocomplete="current-password" type="password" placeholder="Password" disabled={authLoading}
                  class="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
                />
								{:else}
									<input bind:value={password} autocomplete="new-password" type="password" placeholder="Password (min 6 characters)" disabled={authLoading}
									class="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
								/>
								{/if}
              </div>

              {#if authSuccess}
                <div class="px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs">
                  {authSuccess}
                </div>
              {/if}

              {#if authError}
                <div class="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                  {authError}
                </div>
              {/if}

              <button
                type="submit"
                disabled={authLoading}
                class="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed px-4 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200"
              >
                {#if authLoading}
                  <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                {/if}
                {authMode === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <!-- Divider -->
            <div class="relative">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-gray-700"></div>
              </div>
              <div class="relative flex justify-center text-xs">
                <span class="px-2 bg-gray-900/50 text-gray-500">Or continue with</span>
              </div>
            </div>

            <!-- OAuth buttons -->
            <div class="space-y-2">
              <button onclick={() => session.login('google')} class="w-full flex items-center justify-center gap-3 rounded-xl bg-white hover:bg-gray-100 px-4 py-3 text-sm font-medium text-gray-900 shadow-sm transition-all duration-200" >
                <svg class="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
            </div>

            <div class="text-xs text-gray-500 text-center">
              <!-- By continuing, you agree to our <button type="button" class="text-blue-400 hover:text-blue-300 hover:underline font-medium">Privacy Policy</button> and <button type="button" class="text-blue-400 hover:text-blue-300 hover:underline font-medium">Terms of Use</button> -->
               Access is restricted to specific domains.
            </div>
          </div>

          <!-- Right column: Feature messaging  📦  -->
          <div class="hidden md:flex flex-col justify-center items-center px-12 py-16 bg-linear-to-br from-gray-800/50 to-gray-900/80 border-l border-gray-700 space-y-8">
            <div class="space-y-4 text-center">
              <MetalButton variant="cyan" icon="expand" iconSize={22} onclick={(e) => {}}></MetalButton>
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

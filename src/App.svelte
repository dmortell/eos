<script>
  import { session } from "$js/stores";
  import Main from "$pages/Main.svelte";
  import Login from "$lib/Login.svelte";
	import Loading from '$lib/Loading.svelte'
	// <!-- <View main class="safe-areas" url="/" masterDetailBreakpoint={800} /> -->
</script>

{#if $session.user}
  <Main />
{:else if $session.loaded}
  <Login />
{:else}
	<Loading/>
{/if}

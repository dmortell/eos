<script>
import {session} from '$js/stores'
import Timesheets from "./pages/Timesheets.svelte"
import Login from '$lib/Login.svelte'
// icons https://www.npmjs.com/package/@mdi/js
// find them here https://materialdesignicons.com/

// function setTags({detail} ) {
//     tag = detail.tag
//     tab = "tag"
//   }
//   <Tags tags={$misc.tags} on:select={setTags} />

</script>

{#if $session.user}
	<Timesheets/>
<!-- <View main class="safe-areas" url="/" masterDetailBreakpoint={800} /> -->
{:else if $session.loaded}
	<Login/>
{:else}
	Loading...
<!-- <Page>
	<Navbar title="Timesheets" />
	<Block>Loading...</Block>
</Page> -->
{/if}

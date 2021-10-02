<script>
	import {getEventsAction} from '$js/utils';
	import {fade} from 'svelte/transition';
	export let open = false;
	export let modal = false; 		// bool: set false to allow clicking anywhere to close the dialog
  const events = getEventsAction();

// 	Cancel button
// Close button
// Escape key
// Click outside the window
//Modals and mobile devices usually don’t play well together.  device keyboard
// https://uxplanet.org/best-practices-for-modals-overlays-dialog-windows-c00c66cddd8c
</script>

{#if open}
<div class="container" transition:fade={{ duration: 200 }}>
    <div class="background" on:click={e => open=modal}/>
			<div class:modal={1} use:events {...$$restProps}>
				<form on:submit|preventDefault>
					<slot name='header'></slot>
					<slot></slot>
					<slot name='footer'></slot>
				</form>
			</div>
	</div>
	{/if}

<style>
.container{ position:fixed; top:0px; left:0px; width:100vw; height:100vh; z-index:10000; }
.background{ position:fixed; top:0px; left: 0px; width:100vw; height:100vh; background-color:black; opacity: 0.5; }
.modal{ position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
	background-color: white;
	min-width:400px;
	border-radius: 8px;
	/* overflow: hidden; */
	/* background-color:#e7e7e7;  */
 }
</style>

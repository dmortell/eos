<script>
	import {onMount} from 'svelte'
	onMount(() => {
		const el  = document.getElementById("app-loading")?.getElementsByClassName('title')[0]
		if (el) el.innerHTML = ('Please wait...');
		return ()=>{ }
	})

	// todo try https://ihatetomatoes.net/create-custom-preloading-screen/
</script>
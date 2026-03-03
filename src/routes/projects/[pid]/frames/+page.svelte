<script>
	import { page } from '$app/state';
    import Frames from './Frames.svelte';
	// TODO get project id (pid) from url and load frame data for the project
	let pid = "111-222"
	let loading = $state(true)

	$effect(()=>{
		const path = `frames/${pid}`
		let unsub = db.subscribeMany(path, data=>{frames = data; loading = false})
		return () => { unsub() }
	})
</script>

<Frames {frames}/>
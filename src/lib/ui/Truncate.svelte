<script>
	// Use this for file paths and UUIDs where the start and end of the text are useful
	// from https://x.com/wesbos/status/2020911590753628443
	// for alternative, see: https://codepen.io/Momciloo/pen/jErQyKK
	// or https://codepen.io/NicholasByDesign/pen/OPXaxXe?editors=0100
	// Worth noting that direction: rtl with text-overflow: ellipsis can also truncate from the start
	let {text1, text2} = $props()
</script>

<div class="truncate-text">
	<span>{text1}</span><span>{text2}</span>
</div>

<style>
	.truncate-text {
		max-width:100%;
		white-space: nowrap;
		overflow: hidden;
		display: flex;
		span {
			overflow: hidden;
			flex: 0 1 auto;
		}
	}
	span:nth-child(1){
		flex-shrink: 1;
		text-overflow: ellipsis;
	}
	span:nth-child(2){
		flex: 1;
		min-width: fit-content;
	}

	/*
	.container {
		max-width: 500px;
		resize:horizontal;
		overflow: hidden;
	}
	*/
</style>
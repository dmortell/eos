<script context="module">
	let oneVisible = false;
</script>

<script>
	// https://svelte-mui.vercel.app/side-panel
	// https://raw.githubusercontent.com/vikignt/svelte-mui/master/src/Sidepanel.svelte
	import { tick, onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { current_component } from 'svelte/internal';
	import { getEventsAction, enableScroll, trapTabKey } from '$js/utils';

	export let right = false;
	export let visible = false;
	export let disableScroll = false;

	const events = getEventsAction(current_component);
	const swipeArea = 20;
	const swipeMin = 50;
	let touchStart = { x: null, y: null };
	let mounted = false;
	let elm;

	$: if (visible) {
		oneVisible = true;
		mounted && disableScroll && enableScroll(false);
	} else {
		mounted && enableScroll(true);
		hide();
	}

	onMount(async () => { await tick(); mounted = true; });

	function hide() { visible = false; setTimeout(() => { oneVisible = false; }, 20); }
	function show() { visible = true; }
	function transitionEnd(e) { if (visible && e.propertyName === 'visibility') elm.focus(); }
	function onTouchStart(e) {
		touchStart.x = e.changedTouches[0].clientX;
		touchStart.y = e.changedTouches[0].clientY;
	}

	function onTouchEnd(e) {
		const dx = e.changedTouches[0].clientX - touchStart.x;
		const dy = e.changedTouches[0].clientY - touchStart.y;
		const absDx = Math.abs(dx);
		const absDy = Math.abs(dy);

		if (absDx > swipeMin && absDy < swipeMin << 1) {
			if (visible) {
				if ((dx > 0 && right) || (dx < 0 && !right)) hide();
			} else {
				if (oneVisible) return;
				if (dx > 0 && touchStart.x <= swipeArea) {
					if (!right) show();
				} else if (touchStart.x >= window.innerWidth - swipeArea) {
					if (right) show();
				}
			}
		}
	}

	function onKeydown(e) {
		const esc = 'Escape';
		if (!visible) return;
		if (e.keyCode === 27 || e.key === esc || e.code === esc) hide();
		if (visible) trapTabKey(e, elm);
	}
</script>

<svelte:window on:keydown={onKeydown} />
<svelte:body   on:touchstart={onTouchStart} on:touchend={onTouchEnd} />

{#if visible}
	<div class="overlay" transition:fade={{ duration: 300 }} on:click={hide} />
{/if}
<aside class="side-panel" class:left={!right} class:right class:visible tabindex="-1"
	bind:this={elm}
	on:transitionend={transitionEnd}
	use:events
>
	<slot />
</aside>

<style>
	.side-panel {
		background: #fbfbfb;
		background: var(--bg-color, #fbfbfb);
		position: fixed;
		visibility: hidden;
		top: 0; width: 256px; height: 100%; z-index: 40;
		box-shadow: 0 0 20px rgba(0, 0, 0, 0.4);
		overflow-x: hidden; overflow-y: auto;
		transform-style: preserve-3d;
		will-change: transform, visibility;
		transition-duration: 0.2s;
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
		transition-property: transform, visibility;
	}
	.side-panel:focus { outline: none; }
	.side-panel::-moz-focus-inner { border: 0; }
	.side-panel:-moz-focusring { outline: none; }
	.left { left: 0; transform: translateX(-256px); }
	.right { left: auto; right: 0; transform: translateX(256px); }
	.visible { visibility: visible; transform: translateX(0); }
	.overlay {
		background-color: rgba(0, 0, 0, 0.5);
		cursor: pointer;
		position: fixed;
		left: 0;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 30;
	}
</style>
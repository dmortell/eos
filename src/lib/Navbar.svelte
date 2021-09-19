<script>
	// import { authState } from 'rxfire/auth'
	import { fade, fly } from 'svelte/transition'
	import { onMount } from 'svelte'
	// import { tuiClassToggle } from 'utils'
	import { writable } from 'svelte/store'
	import ClickOutside from 'svelte-click-outside'
	// import EDMDropDown from './EDMDropDown.svelte'
	// import UserDropDown from './UserDropDown.svelte'
	let user = writable(true)
	let openDesktopNav = false
	let openMobileNav = false
	let toggleDesktopProfile
	const closeDesktopNav = () => { openDesktopNav = false }
	const toggleDesktopNav = () => { openDesktopNav = !openDesktopNav }
	const toggleMobileNav = () => { openMobileNav = !openMobileNav }
	const tuiClassToggle = (flag, open, closed) => flag ? open : closed;

	onMount( () => {
		// user = authState( firebase.auth() )
	})
</script>

<div class="navbar">
	<div class="navbar-bg"></div>
	<div class="navbar-inner">
		<div class="left"></div>
		<div class="title"></div>
		<div class="right"><slot name="right"></slot></div>
		<slot></slot>
	</div>
</div>


<style>
	.navbar {
		--f7-navbar-large-collapse-progress: 0;
		position: relative;
		backface-visibility: hidden;
		box-sizing: border-box;
		margin: 0;
		width:100%;
		height: calc(var(--f7-navbar-height) + var(--f7-safe-area-top));
		color: var(--f7-navbar-text-color, var(--f7-bars-text-color));
		font-size: var(--f7-navbar-font-size);
	}

	.navbar-bg {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
    background: var(--f7-navbar-bg-color);
    background-image: var(--f7-navbar-bg-image, var(--f7-bars-bg-image));
    /* background-image: linear-gradient(to bottom, rgba(0, 0, 0, .25) 0%, rgba(0, 0, 0, .08) 40%, rgba(0, 0, 0, .04) 50%, rgba(0, 0, 0, 0) 90%, rgba(0, 0, 0, 0) 100%); */
    background-color: var(--f7-navbar-bg-color, var(--f7-bars-bg-color));
    transition-property: transform;
}
.navbar-bg:before {
    content: "";
    position: absolute;
    right: 0;
    width: 100%;
    top: 100%;
    bottom: auto;
    height: 8px;
    pointer-events: none;
    background: var(--f7-navbar-shadow-image);
    background: linear-gradient(to bottom, rgba(0, 0, 0, .25) 0%, rgba(0, 0, 0, .08) 40%, rgba(0, 0, 0, .04) 50%, rgba(0, 0, 0, 0) 90%, rgba(0, 0, 0, 0) 100%);
}
.navbar-bg:after {
    z-index: 1;
}
.navbar-bg:after {
    content: "";
    position: absolute;
    background-color: var(--f7-navbar-border-color, var(--f7-bars-border-color));
    display: block;
    z-index: 15;
    top: auto;
    right: auto;
    bottom: 0;
    left: 0;
    height: 1px;
    width: 100%;
    transform-origin: 50% 100%;
    transform: scaleY(calc(1 / var(--f7-device-pixel-ratio)));
}
.navbar-bg:after, .navbar-bg:before {
    backface-visibility: hidden;
}

.navbar-inner {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    padding: var(--f7-safe-area-top) calc(var(--f7-navbar-inner-padding-right) + var(--f7-safe-area-right)) 0 calc(var(--f7-navbar-inner-padding-left) + var(--f7-safe-area-left));
    transform: translate(0);
    z-index: 10;
}

.navbar .left, .navbar .right {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-start;
    align-items: center;
}
.navbar .title, .navbar .left, .navbar .right {
    position: relative;
    z-index: 10;
}
.navbar .title {
    position: relative;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 10;
    font-weight: var(--f7-navbar-title-font-weight);
    display: inline-block;
    line-height: var(--f7-navbar-title-line-height);
    text-align: var(--f7-navbar-title-text-align);
    font-size: var(--f7-navbar-title-font-size);
    margin-left: var(--f7-navbar-title-margin-left);
    margin-right: var(--f7-navbar-title-margin-left);
}
.md .navbar .right {
    margin-left: auto;
}
</style>
<script>
	export let style = '';
	export let name = 'Avatar';
	export let initials = '';
	export let src;
	export let bgColor = 'lightGrey';
	export let textColor = 'white';
	export let size = '42px';
	export let borderRadius = '50%';
	export let square = false;
	export let randomBgColor = true;

	$: background = randomBgColor ? getRandomColor(name) : bgColor;
	$: abbr = initials || getInitials(name);
	$: abbrLength = abbr.length;
	let imageFail = false;
	let imageLoading = true;

	function getInitials(name){
		return name.split(" ").map((n)=>n[0]).join(".");
	}

	function getRandomColor(name) {
		const colors = ['#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5',
		'#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50',
		'#FFEB3B', '#FFC107', '#FF5722', '#795548'];
		var i = Math.floor(Math.random()*colors.length);
		var hash = 0, chr;
		if (name.length) for (i = 0; i < name.length; i++) {
			chr   = name.charCodeAt(i);
			hash  = ((hash << 5) - hash) + chr;
			hash |= 0; // Convert to 32bit integer
		}
		i = Math.abs(hash) % colors.length
		return colors[i];
	}
</script>


<div aria-label={name} class="wrapper"
	style="--borderRadius:{square ? 0 : borderRadius}; --size:{size}; --bgColor:{background};
	--src:{src}; --textColor:{textColor}; --abbrLength:{abbrLength}; {style}"
>
	{#if src && !imageFail}
		<div class={imageLoading ? 'imageLoading' : ''}>
			<img alt={name} class="innerImage" {src} on:error={() => imageFail=true} on:load={() => imageLoading=false} />
		</div>
	{:else}
		<div class="innerInitials" title={name}>{abbr}</div>
	{/if}
</div>

<style>
	.wrapper { position: relative; width: var(--size); height: var(--size); }
	.innerImage, .innerInitials, .imageLoading {
	  display: block;
	  width: 100%;
	  height: 100%;
	  border-radius: var(--borderRadius);
	}
	.innerInitials {
	  line-height: var(--size);
	  background-color: var(--bgColor);
	  color: var(--textColor);
	  text-align: center;
	  font-size: calc(var(--size) / (var(--abbrLength) + 0.5));
	}
	.imageLoading { background-color: var(--bgColor); }
	.imageLoading::before {
	  content: '';
	  display: block;
	  height: 100%;
	  width: 100%;
	  background: linear-gradient(90deg, transparent, #ffffff38, transparent);
	  position: absolute;
	  top: 0;
	  left: 0;
	  animation: skeleton-animation 1.2s linear infinite;
	}
	@keyframes skeleton-animation {
	  0% {
		transform: translateX(-100%);
	  }
	  100% {
		transform: translateX(100%);
	  }
	}
  </style>
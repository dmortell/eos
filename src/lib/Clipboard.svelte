<script>
	import { onMount, tick, createEventDispatcher } from "svelte";
	export let text;
	const dispatch = createEventDispatcher();
	// let textarea;

	// async function copy() {
	//   textarea.select();
	//   document.execCommand("Copy");
	//   await tick();
	//   textarea.blur();
	//   dispatch("copy");
	// }

	const copytext = () => {		// https://github.com/henriquecaraujo/svelte-copy-to-clipboard/blob/master/src/CopyToClipboard.svelte
		const txt = typeof text === 'function' ? text() : text
		navigator.clipboard.writeText(txt).then(
			() => dispatch("copy", txt),
			(e) => dispatch("fail")
		);
	};
  </script>

<slot {copytext} />
<svg on:click={copytext}
		 title="Copy to clipboard"
		 class="octicon octicon-clippy"
		 viewBox="0 0 14 16"
		 version="1.1"
		 width="14"
		 height="16"
		 aria-hidden="true"
>
	<path fill-rule="evenodd"
				d="M2 13h4v1H2v-1zm5-6H2v1h5V7zm2 3V8l-3 3 3 3v-2h5v-2H9zM4.5 9H2v1h2.5V9zM2 12h2.5v-1H2v1zm9 1h1v2c-.02.28-.11.52-.3.7-.19.18-.42.28-.7.3H1c-.55 0-1-.45-1-1V4c0-.55.45-1 1-1h3c0-1.11.89-2 2-2 1.11 0 2 .89 2 2h3c.55 0 1 .45 1 1v5h-1V6H1v9h10v-2zM2 5h8c0-.55-.45-1-1-1H8c-.55 0-1-.45-1-1s-.45-1-1-1-1 .45-1 1-.45 1-1 1H3c-.55 0-1 .45-1 1z"></path>
</svg>

<!-- <textarea bind:this={textarea} value={text} /> -->

<!-- <Clipboard text={exampleText} on:copy={e=>alert('Copied to clipboard')} on:fail={e=>e} let:copytext>
	<button on:click={copytext}>An element to trigger the copy</button>
</Clipboard> -->

  <style>
	svg {
		cursor: pointer;
		display:inline;
	}
	/* textarea {
	  left: 0;
	  bottom: 0;
	  margin: 0;
	  padding: 0;
	  opacity: 0;
	  width: 1px;
	  height: 1px;
	  border: none;
	  display: block;
	  position: absolute;
	} */
  </style>

<script lang="ts">
  import { nextId } from "$lib/extras";
	let { value=$bindable(), ref=$bindable(), id=nextId(), children, data = [],
		maxSuggestions = 5, onSelect,
		...props
	} = $props()
	let isFocused = $state(false);
  let filteredSuggestions = $state<string[]>([]);
  let selectedIndex = $state(-1);
  let backspaceUsed = $state(false);
  const isCombobox = $derived(Array.isArray(data) && data.length > 0);

	function updateSuggestions() {
    if (!isCombobox || !isFocused) return filteredSuggestions = [];
		const searchTerm = (value || "").toLowerCase();
    selectedIndex = -1;
    if (searchTerm === "" && !backspaceUsed) {
      filteredSuggestions = [];
    } else if (searchTerm) {
      filteredSuggestions = data.filter((item: string) => item.toLowerCase().includes(searchTerm)).slice(0, maxSuggestions);
    } else if (backspaceUsed) {
      filteredSuggestions = [...data].slice(0, maxSuggestions);
    }
  }

  $effect(() => { if (isCombobox) updateSuggestions(); });

  function handleInput() {
    if (value.length) backspaceUsed = false;
    updateSuggestions();
  }
  function handleFocus() { isFocused = true; updateSuggestions(); }
  function handleBlur() {
    setTimeout(() => { isFocused = false; backspaceUsed = false; filteredSuggestions = []; }, 200);
  }
  function handleKeydown(event: KeyboardEvent) {
    if (!isCombobox) return;
    if (event.key === "Backspace" || event.key === "Delete") {
      if ((value || "").length <= 1) backspaceUsed = true;
    }
    if (!filteredSuggestions.length) return;
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); selectedIndex = (selectedIndex + 1) % filteredSuggestions.length; break;
      case "ArrowUp": event.preventDefault(); selectedIndex = selectedIndex <= 0 ? filteredSuggestions.length - 1 : selectedIndex - 1; break;
			case "Escape": event.preventDefault(); filteredSuggestions = []; break;
      case "Enter":
        if (selectedIndex >= 0) { event.preventDefault(); selectItem(filteredSuggestions[selectedIndex]); }
        break;
    }
  }
  function selectItem(item: string) {
    value = item;
    if (onSelect) onSelect(item);
    filteredSuggestions = [];
    selectedIndex = -1;
  }
</script>

<div class="relative z-0">
	<input {id} placeholder=" " bind:value bind:this={ref} {...props}
		oninput={handleInput} onfocus={handleFocus} onblur={handleBlur} onkeydown={handleKeydown}
		class="block w-full text-sm text-gray-900 bg-transparent appearance-none
		border-0 border-b border-gray-400
		dark:text-white focus:border-gray-900 focus:outline-hidden focus:ring-0 peer
		"/>
	<label
	class="absolute text-sm text-gray-400 origin-left
	duration-300 scale-75
	-translate-y-9 peer-focus:-translate-y-9 peer-placeholder-shown:-translate-y-5
	">{@render children?.()}</label>
</div>

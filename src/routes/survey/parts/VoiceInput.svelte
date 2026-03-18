<script lang="ts">
	import { Icon } from '$lib'

	let {
		value = $bindable(''),
		label = null as string | null,
		placeholder = '',
		multiline = false,
	} = $props()

	let listening = $state(false)
	let supported = $state(false)
	let recognition: any = null
	let textareaEl: HTMLTextAreaElement | undefined = $state()

	$effect(() => {
		supported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
		return () => stopListening()
	})

	// Auto-resize textarea to fit content
	$effect(() => {
		if (textareaEl && value !== undefined) {
			textareaEl.style.height = 'auto'
			textareaEl.style.height = textareaEl.scrollHeight + 'px'
		}
	})

	function startListening() {
		const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
		if (!SpeechRecognition) return
		recognition = new SpeechRecognition()
		recognition.lang = 'ja'
		recognition.continuous = true
		recognition.interimResults = false
		recognition.onresult = (e: any) => {
			const transcript = Array.from(e.results as SpeechRecognitionResultList)
				.map((r: any) => r[0].transcript)
				.join('')
			if (transcript) {
				value = value ? value + ' ' + transcript : transcript
			}
		}
		recognition.onerror = () => { listening = false }
		recognition.onend = () => { listening = false }
		recognition.start()
		listening = true
	}

	function stopListening() {
		recognition?.stop()
		recognition = null
		listening = false
	}

	function toggleVoice() {
		if (listening) stopListening()
		else startListening()
	}
</script>

<div class="space-y-1">
	{#if label}
		<span class="block text-sm font-medium text-gray-500">{label}</span>
	{/if}
	<div class="flex items-start gap-2">
		{#if multiline}
			<textarea bind:this={textareaEl} bind:value {placeholder} rows="1"
				class="min-w-0 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-base leading-snug focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
			></textarea>
		{:else}
			<input bind:value type="text" {placeholder}
				class="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-base leading-snug focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
			/>
		{/if}
		{#if supported}
			<button type="button" onclick={toggleVoice} title={listening ? 'Stop voice input' : 'Voice input'}
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors {listening ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500 active:bg-gray-200'}"
			>
				{#if listening}
					<span class="relative flex items-center justify-center">
						<span class="absolute inline-flex h-6 w-6 animate-ping rounded-full bg-red-400 opacity-50"></span>
						<Icon name="mic" size={20} />
					</span>
				{:else}
					<Icon name="mic" size={20} />
				{/if}
			</button>
		{/if}
	</div>
</div>

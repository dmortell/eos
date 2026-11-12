<script lang="ts">
	// Barcode walk list: paste a column of labels (outlets, in walking order), scan a MAC address for each
	// with the phone camera, copy the column back into the spreadsheet. Nothing is saved to the project —
	// the list lives in this browser (localStorage) until it is cleared.
	import { onMount } from 'svelte'
	import { Button, Titlebar } from '$lib'
	import { nextEmpty, parseLabels, parseMac, valueColumn, type ScanItem } from './scan'

	const KEY = 'eos-scan-v1'

	let items = $state<ScanItem[]>([])
	let idx = $state(0)
	let pasted = $state('')
	let loaded = $state(false)

	let video = $state<HTMLVideoElement | null>(null)
	let running = $state(false)
	let message = $state('')
	let flash = $state(false)
	let copied = $state(false)
	let confirmClear = $state(false)

	let current = $derived(items[idx])
	let done = $derived(items.filter(i => i.value).length)

	type Detector = { detect(src: HTMLVideoElement | ImageBitmap): Promise<{ rawValue: string }[]> }
	let detector: Detector | null = null
	let stream: MediaStream | null = null
	let audio: AudioContext | null = null
	let pending = ''   // a MAC seen once; taken when the next frame reads it again

	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
			if (Array.isArray(saved?.items)) { items = saved.items; idx = Math.min(saved.idx ?? 0, Math.max(0, items.length - 1)) }
		} catch { /* nothing saved */ }
		loaded = true
		return stop
	})

	$effect(() => {
		const data = JSON.stringify({ items, idx })
		if (loaded) { try { localStorage.setItem(KEY, data) } catch { /* private mode */ } }
	})

	async function getDetector(): Promise<Detector> {
		if (!detector) {
			const { BarcodeDetector } = await import('barcode-detector/ponyfill')
			detector = new BarcodeDetector({ formats: ['code_128', 'code_39', 'qr_code', 'data_matrix'] })
		}
		return detector
	}

	function loadList() {
		const labels = parseLabels(pasted)
		if (!labels.length) return
		items = labels.map(label => ({ label, value: '' }))
		idx = 0
		pasted = ''
		message = ''
	}

	async function start() {
		message = ''
		try {
			audio ??= new AudioContext()
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
				audio: false,
			})
			const det = await getDetector()
			if (!video) return
			video.srcObject = stream
			await video.play()
			running = true
			loop(det)
		} catch (e) {
			stop()
			message = `Camera not available: ${e instanceof Error ? e.message : e}`
		}
	}

	function stop() {
		running = false
		pending = ''
		stream?.getTracks().forEach(t => t.stop())
		stream = null
		if (video) video.srcObject = null
	}

	async function loop(det: Detector) {
		while (running) {
			if (video && video.readyState >= 2) {
				try { take((await det.detect(video)).map(r => r.rawValue), true) } catch { /* a frame that would not decode */ }
			}
			await new Promise(r => setTimeout(r, 120))
		}
	}

	/** Every barcode read in one frame / photo. A label can carry several (part no., serial…): only a MAC
	 *  that is not in the list yet is taken, so the phone just scanned is never entered twice. */
	function take(raws: string[], twice: boolean) {
		const macs = raws.map(parseMac).filter((m): m is string => !!m)
		const fresh = macs.find(m => !items.some(i => i.value === m))
		if (!fresh) {
			pending = ''
			const at = macs.length ? items.find(i => i.value === macs[0]) : null
			if (at) message = `${macs[0]} is already on ${at.label}`
			else if (!twice) message = raws.length ? 'No MAC address among the barcodes read' : 'No barcode found'
			return
		}
		if (twice && pending !== fresh) { pending = fresh; return }
		pending = ''
		if (!current) { message = 'Load a list first'; return }
		// A filled row is only ever current when it was picked on purpose (Back, or a tap): the scan redoes it.
		const label = current.label, was = current.value
		items[idx].value = fresh
		message = `${label} = ${fresh}${was ? ` (was ${was})` : ''}`
		const next = nextEmpty(items, idx + 1)
		if (next >= 0) idx = next
		else { message += ' — list complete'; stop() }
		beep()
		flash = true
		setTimeout(() => (flash = false), 350)
	}

	function beep() {
		if (!audio) return
		const osc = audio.createOscillator(), gain = audio.createGain()
		osc.frequency.value = 1320
		gain.gain.value = 0.2
		osc.connect(gain).connect(audio.destination)
		osc.start()
		osc.stop(audio.currentTime + 0.12)
	}

	async function fromPhoto(e: Event) {
		const input = e.currentTarget as HTMLInputElement
		const file = input.files?.[0]
		input.value = ''
		if (!file) return
		try {
			const bitmap = await createImageBitmap(file)
			take((await (await getDetector()).detect(bitmap)).map(r => r.rawValue), false)
			bitmap.close()
		} catch (e) {
			message = `Could not read the photo: ${e instanceof Error ? e.message : e}`
		}
	}

	function skip() {
		const next = nextEmpty(items, idx + 1)
		if (next >= 0) idx = next
		message = ''
	}

	function back() {
		if (idx > 0) idx--
		pending = ''
		message = current?.value ? `${current.label} — scan to redo it, or Clear` : ''
	}

	function clearCurrent() {
		if (current) items[idx].value = ''
		message = ''
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(valueColumn(items))
			copied = true
			setTimeout(() => (copied = false), 2000)
		} catch {
			message = 'Copy was blocked by the browser'
		}
	}

	function clearList() {
		if (!confirmClear) { confirmClear = true; setTimeout(() => (confirmClear = false), 3000); return }
		stop()
		items = []
		idx = 0
		message = ''
		confirmClear = false
	}
</script>

<svelte:head><title>Scan · EOS</title></svelte:head>

<Titlebar>Scan</Titlebar>

<div class="mx-auto flex max-w-xl flex-col gap-3 p-3 text-sm">
	{#if !items.length}
		<p>Paste the labels to scan for, one per line, in walking order (copy the outlet column from the spreadsheet).</p>
		<textarea class="h-56 w-full rounded border p-2 font-mono" placeholder={'348\n201\n302\n…'} bind:value={pasted}></textarea>
		<div><Button variant="primary" onclick={loadList} disabled={!parseLabels(pasted).length}>Load {parseLabels(pasted).length || ''} labels</Button></div>
	{:else}
		<!-- Camera, the row being scanned and its buttons stay in view while the list scrolls under them -->
		<div class="sticky top-0 z-10 -mx-3 flex flex-col gap-2 border-b bg-background px-3 py-2">
		<div class="relative overflow-hidden rounded bg-black {running ? '' : 'hidden'}">
			<!-- svelte-ignore a11y_media_has_caption -->
			<video bind:this={video} class="max-h-[40vh] w-full object-cover" playsinline muted></video>
			{#if flash}<div class="absolute inset-0 bg-green-400/50"></div>{/if}
		</div>

		<div class="flex items-center justify-between gap-2">
			<div>
				<div class="text-xs text-gray-500">Next · {done} / {items.length} done</div>
				<div class="text-3xl font-semibold">{current?.label ?? '—'}</div>
			</div>
			<div class="flex flex-wrap justify-end gap-2">
				{#if running}
					<Button variant="outline" onclick={stop}>Stop camera</Button>
				{:else}
					<Button variant="primary" icon="scan" onclick={start}>Scan</Button>
				{/if}
				<Button variant="outline" onclick={back} disabled={idx === 0}>Previous</Button>
				<Button variant="outline" onclick={skip}>Skip</Button>
				{#if current?.value}<Button variant="outline" onclick={clearCurrent}>Clear</Button>{/if}
			</div>
		</div>

		<div class="min-h-5 font-mono text-xs {flash ? 'text-green-700' : 'text-gray-700'}" aria-live="polite">{message}</div>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<Button variant="outline" icon="copy" onclick={copy}>{copied ? 'Copied' : 'Copy MAC column'}</Button>
			<label class="inline-flex cursor-pointer items-center rounded border px-2 py-1 hover:bg-gray-100">
				From photo
				<input type="file" accept="image/*" class="hidden" onchange={fromPhoto} />
			</label>
			<span class="flex-1"></span>
			<Button variant={confirmClear ? 'danger' : 'outline'} onclick={clearList}>{confirmClear ? 'Tap again to clear' : 'Clear list'}</Button>
		</div>

		<ol class="divide-y rounded border">
			{#each items as item, i (i)}
				<li>
					<button class="flex w-full items-center gap-3 px-2 py-1.5 text-left {i === idx ? 'bg-blue-100' : ''}" onclick={() => { idx = i; pending = ''; message = item.value ? `${item.label} — scan to redo it, or Clear` : '' }}>
						<span class="w-8 text-right text-xs text-gray-400">{i + 1}</span>
						<span class="w-20 font-semibold">{item.label}</span>
						<span class="font-mono">{item.value}</span>
					</button>
				</li>
			{/each}
		</ol>
	{/if}
</div>

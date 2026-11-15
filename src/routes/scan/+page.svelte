<script lang="ts">
	// Barcode walk list: paste a column of labels (outlets, in walking order), scan a MAC address for each
	// with the phone camera, copy the column back into the spreadsheet. Nothing is saved to the project —
	// the list lives in this browser (localStorage) until it is cleared.
	import { onMount } from 'svelte'
	import { Button, Icon, Titlebar } from '$lib'
	import { macsInOrder, nextEmpty, parseLabels, toCsv, valueColumn, type Read, type ScanItem } from './scan'
	import { allPhotos, clearPhotos, deletePhoto, getPhoto, putPhoto, toJpeg } from './photos'
	import { zip } from './zip'

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
	let reading = $state(false)
	let viewing = $state<{ url: string; label: string; value: string } | null>(null)

	let current = $derived(items[idx])
	let done = $derived(items.filter(i => i.value).length)

	/** Labels carry a WLAN MAC under the wired one: a frame must show both, so a lone WLAN MAC is never taken.
	 *  Turns itself on the first time a frame shows two MACs; untick it for labels with a single MAC. */
	let wlanLabels = $state(false)

	type Detector = { detect(src: HTMLVideoElement | ImageBitmap): Promise<Read[]> }
	let detector: Detector | null = null
	let stream: MediaStream | null = null
	let audio: AudioContext | null = null
	let pending = ''   // a MAC seen once; taken when the next frame reads it again
	let lastTaken = '' // the MAC just entered: still in view, so "already on …" is not shown for it

	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
			if (Array.isArray(saved?.items)) { items = saved.items; idx = Math.min(saved.idx ?? 0, Math.max(0, items.length - 1)) }
			wlanLabels = !!saved?.wlanLabels
		} catch { /* nothing saved */ }
		loaded = true
		return stop
	})

	$effect(() => {
		const data = JSON.stringify({ items, idx, wlanLabels })
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
		clearPhotos().catch(() => {})
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
				try {
					const row = take(await det.detect(video), true)
					if (row >= 0) savePhoto(row, video)
				} catch { /* a frame that would not decode */ }
			}
			await new Promise(r => setTimeout(r, 120))
		}
	}

	/** Every barcode read in one frame / photo. A label can carry several (part no., serial, WLAN MAC…):
	 *  the upper MAC on the label is the wired one, and a label already in the list is ignored whole — so
	 *  the phone just scanned is never entered twice, nor its WLAN MAC taken for the next row.
	 *  `twice`: the live camera needs the same MAC in two frames running; a photo or Read now does not.
	 *  Returns the row the MAC went to, or -1. */
	function take(reads: readonly Read[], twice: boolean): number {
		const macs = macsInOrder(reads)
		if (!macs.length) {
			pending = ''
			if (!twice) message = reads.length ? 'No MAC address among the barcodes read' : 'No barcode found'
			return -1
		}
		const known = macs.find(m => items.some((it, i) => i !== idx && it.value === m))
		if (known) {
			pending = ''
			if (known !== lastTaken || !twice) message = `${known} is already on ${items.find(i => i.value === known)?.label}`
			return -1
		}
		if (macs.length > 1) wlanLabels = true
		if (wlanLabels && macs.length < 2) {
			pending = ''
			message = 'Only one MAC read — get MAC and WLAN MAC both in view (or untick "WLAN MAC labels")'
			return -1
		}
		const mac = macs[0]
		if (mac === current?.value) { pending = ''; return -1 }
		if (twice && pending !== mac) { pending = mac; return -1 }
		pending = ''
		if (!current) { message = 'Load a list first'; return -1 }
		// A filled row is only ever current when it was picked on purpose (Back, or a tap): the scan redoes it.
		const row = idx, label = current.label, was = current.value
		items[row].value = mac
		lastTaken = mac
		message = `${label} = ${mac}${was ? ` (was ${was})` : ''}`
		const next = nextEmpty(items, idx + 1)
		if (next >= 0) idx = next
		else { message += ' — list complete'; stop() }
		beep()
		flash = true
		setTimeout(() => (flash = false), 350)
		return row
	}

	/** Keep the frame a MAC was read from with its row, for checking later (serial numbers…). */
	async function savePhoto(row: number, src: HTMLVideoElement | ImageBitmap) {
		try {
			const blob = await toJpeg(src)
			if (!blob) return
			await putPhoto(row, blob)
			if (items[row]) items[row].photo = true
		} catch (e) {
			message += ` (photo not saved: ${e instanceof Error ? e.message : e})`
		}
	}

	/** Read the frame in view now, without waiting for a second frame to agree. */
	async function readNow() {
		if (!video || !running || reading) return
		reading = true
		try {
			const frame = await createImageBitmap(video)
			const row = take(await (await getDetector()).detect(frame), false)
			if (row >= 0) await savePhoto(row, frame)
			frame.close()
		} catch (e) {
			message = `Could not read the frame: ${e instanceof Error ? e.message : e}`
		} finally {
			reading = false
		}
	}

	async function showPhoto(row: number) {
		const blob = await getPhoto(row).catch(() => undefined)
		if (!blob) { message = `No photo kept for ${items[row]?.label}`; return }
		viewing = { url: URL.createObjectURL(blob), label: items[row].label, value: items[row].value }
	}

	function closePhoto() {
		if (viewing) URL.revokeObjectURL(viewing.url)
		viewing = null
	}

	async function downloadPhotos() {
		try {
			const photos = (await allPhotos()).filter(p => items[p.row]).sort((a, b) => a.row - b.row)
			if (!photos.length) { message = 'No photos kept yet'; return }
			const safe = (s: string) => s.replace(/[^\w.-]+/g, '_')
			const entries = await Promise.all(photos.map(async p => ({
				name: `${String(p.row + 1).padStart(3, '0')}-${safe(items[p.row].label)}${items[p.row].value ? '-' + items[p.row].value : ''}.jpg`,
				data: new Uint8Array(await p.blob.arrayBuffer()),
			})))
			download(new Blob([zip(entries)], { type: 'application/zip' }), `scan-photos-${new Date().toISOString().slice(0, 10)}.zip`)
		} catch (e) {
			message = `Could not make the zip: ${e instanceof Error ? e.message : e}`
		}
	}

	function download(blob: Blob, name: string) {
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = name
		a.click()
		setTimeout(() => URL.revokeObjectURL(url), 1000)
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
			const row = take(await (await getDetector()).detect(bitmap), false)
			if (row >= 0) await savePhoto(row, bitmap)
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
		if (!current) return
		items[idx].value = ''
		items[idx].photo = false
		deletePhoto(idx).catch(() => {})
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

	function exportCsv() {
		download(new Blob([toCsv(items)], { type: 'text/csv' }), `scan-${new Date().toISOString().slice(0, 10)}.csv`)
	}

	function clearList() {
		if (!confirmClear) { confirmClear = true; setTimeout(() => (confirmClear = false), 3000); return }
		stop()
		clearPhotos().catch(() => {})
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
					<Button variant="primary" icon="camera" onclick={readNow} disabled={reading}>{reading ? 'Reading…' : 'Read now'}</Button>
					<Button variant="outline" onclick={stop}>Stop camera</Button>
				{:else}
					<Button variant="primary" icon="scan" onclick={start}>Scan</Button>
				{/if}
				<Button variant="outline" onclick={back} disabled={idx === 0}>Previous</Button>
				<Button variant="outline" onclick={skip}>Skip</Button>
				{#if current?.value}<Button variant="outline" onclick={clearCurrent}>Clear</Button>{/if}
				<Button variant="outline" icon="copy" onclick={copy}>{copied ? 'Copied' : 'Copy MACs'}</Button>
			</div>
		</div>

		<div class="min-h-5 font-mono text-xs {flash ? 'text-green-700' : 'text-gray-700'}" aria-live="polite">{message}</div>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<Button variant="outline" icon="download" onclick={exportCsv}>Export CSV</Button>
			<Button variant="outline" icon="image" onclick={downloadPhotos}>Download photos</Button>
			<label class="inline-flex cursor-pointer items-center rounded border px-2 py-1 hover:bg-gray-100">
				From photo
				<input type="file" accept="image/*" class="hidden" onchange={fromPhoto} />
			</label>
			<label class="inline-flex items-center gap-1" title="Labels show MAC and WLAN MAC: take the upper one, and only when both are in view">
				<input type="checkbox" bind:checked={wlanLabels} /> WLAN MAC labels
			</label>
			<span class="flex-1"></span>
			<Button variant={confirmClear ? 'danger' : 'outline'} onclick={clearList}>{confirmClear ? 'Tap again to clear' : 'Clear list'}</Button>
		</div>

		<ol class="divide-y rounded border">
			{#each items as item, i (i)}
				<li class="flex items-center {i === idx ? 'bg-blue-100' : ''}">
					<button class="flex flex-1 items-center gap-3 px-2 py-1.5 text-left" onclick={() => { idx = i; pending = ''; message = item.value ? `${item.label} — scan to redo it, or Clear` : '' }}>
						<span class="w-8 text-right text-xs text-gray-400">{i + 1}</span>
						<span class="w-20 font-semibold">{item.label}</span>
						<span class="font-mono">{item.value}</span>
					</button>
					{#if item.photo}
						<button class="px-3 py-1.5 text-gray-500 hover:text-gray-900" title="Photo" aria-label="Photo of {item.label}" onclick={() => showPhoto(i)}>
							<Icon name="image" />
						</button>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</div>

{#if viewing}
	<!-- The kept photo, full width; tap anywhere to close -->
	<button class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-black/90 p-2 text-white" onclick={closePhoto} aria-label="Close photo">
		<span class="font-mono text-sm">{viewing.label} · {viewing.value}</span>
		<img src={viewing.url} alt="Label of {viewing.label}" class="max-h-[90vh] max-w-full object-contain" />
	</button>
{/if}

<script lang="ts">
	// The PROJECT's title-block template (domain/titleBlock.ts), edited from a sheet's Properties: sections, border,
	// layout, logo text + images, the drawing office's lines, then the fields in order — relabel, full / half width,
	// drag to reorder, remove, add an auto-filled field or a custom one with fixed text. Ported from Pages'
	// TitleBlockEditor.svelte (Dave: keep the Pages model); every change calls `onchange` with the whole template
	// (saved on the project's settings; every sheet re-renders from it).
	import { Icon, DragReorder } from '$lib'
	import { toast } from 'svelte-sonner'
	import type { Firestore } from 'firebase/firestore'
	import { storeFile, type FileStorage } from '../app/projectFiles'
	import LogoPicker from './LogoPicker.svelte'
	import { TB_AUTO, DEFAULT_TITLE_BLOCK, LOGO_LABEL, withLogoFields, isFixedField, type TitleBlockTemplate, type TbField, type TbAutoKey, type TbCompany, type TbSection, type TbLogo, type TbLayout } from '../domain/titleBlock'

	// `files` = the project's Uploads: logos are picked from its images, and new ones are added to it
	let { template, onchange, files }: { template: TitleBlockTemplate | undefined; onchange: (t: TitleBlockTemplate) => void; files?: { db: Firestore; pid: string; storage?: FileStorage } } = $props()
	const showId = $props.id()
	let picking = $state<'company' | 'client' | null>(null)
	const t = $derived(template?.fields?.length ? template : DEFAULT_TITLE_BLOCK)
	// the field list WITH the logos as fields (Dave: logos placed and ordered like fields); an edit saves it that way
	const fields = $derived(withLogoFields(t))
	const set = (patch: Partial<TitleBlockTemplate>) => onchange({ ...t, logo: t.logo ?? '', fields: fields.map((f) => ({ ...f })), ...patch })
	const setCompany = (patch: Partial<TbCompany>) => set({ company: { ...t.company, ...patch } })
	const SECTIONS: [TbSection, string][] = [['logo', 'Logo'], ['company', 'Company'], ['fields', 'Fields'], ['revisions', 'Revisions']]
	const shows = (s: TbSection) => !t.hidden?.includes(s)
	const toggle = (s: TbSection) => set({ hidden: shows(s) ? [...(t.hidden ?? []), s] : (t.hidden ?? []).filter((x) => x !== s) })
	const setField = (i: number, patch: Partial<TbField>) => set({ fields: fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
	// fields reorder by dragging their ⋮⋮ grip ($lib DragReorder; ids = the row index, `f<i>`)
	const idx = (id: string) => Number(id.slice(1))
	const dr = new DragReorder((id, targetId, after) => {
		const fs = [...fields], [f] = fs.splice(idx(id), 1)
		let to = idx(targetId); if (idx(id) < to) to--   // the target shifted up when the dragged one left
		fs.splice(after ? to + 1 : to, 0, f); set({ fields: fs })
	}, idx)
	/** An ordinary field goes; the block's own items (logos, logo text, company) are always listed — they're cleared. */
	const remove = (i: number) => set({ fields: fields.filter((_, j) => j !== i) })
	function add(key: string) {
		if (!key) return
		const f: TbField = key === 'custom' ? { key: 'custom', label: 'Note', value: '' } : { key: key as TbAutoKey, label: TB_AUTO[key as TbAutoKey], ...(key === 'site' ? { wide: true } : {}) }
		set({ fields: [...fields, f] })
	}
	// A logo image goes to the project's FILE STORAGE (UploadThing or Firebase Storage, Settings › Files) and the
	// template keeps only its URL (+ UploadThing's key). A raster is downscaled first (≤ 1200 × 480 px); an SVG goes as it is. If the upload fails (offline), a small
	// inline data URL is kept so it still works — "Move to storage" uploads it later.
	const LOGO_MAX = 150_000
	const setLogo = (k: 'company' | 'client', lg: TbLogo | undefined) => set({ logos: { ...t.logos, [k]: lg ?? { src: '' } } })
	let uploading = $state<'company' | 'client' | null>(null)
	// to the project's file storage (Settings › Files) and listed in its Uploads, so it can be picked again
	async function upload(k: 'company' | 'client', file: File, h: number, fallback: string) {
		uploading = k
		try {
			if (!files) throw new Error('no project files')
			const f = await storeFile(files.db, files.pid, file, { storage: files.storage, route: 'imageUploader' })
			setLogo(k, { src: f.url, ...(f.key ? { key: f.key } : {}), h })
		} catch (e) {
			if (fallback) setLogo(k, { src: fallback, h })
			toast.error(`Logo upload failed${fallback ? ' — kept inside the project for now (Move to storage later)' : ''}: ${e instanceof Error ? e.message : String(e)}`)
		} finally { uploading = null }
	}
	/** An image scaled to fit w × h px, as a PNG blob. */
	const scaled = (img: HTMLImageElement, w: number, h: number) => new Promise<Blob | null>((res) => {
		const s = Math.min(1, w / img.naturalWidth, h / img.naturalHeight), c = document.createElement('canvas')
		c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s))
		c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); c.toBlob(res, 'image/png')
	})
	function logoDataUrl(img: HTMLImageElement): string {
		let s = Math.min(1, 600 / img.naturalWidth, 240 / img.naturalHeight), out = ''
		for (let i = 0; i < 6; i++, s *= 0.7) {
			const c = document.createElement('canvas')
			c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s))
			c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
			for (const [type, q] of [['image/png', 1], ['image/webp', 0.85], ['image/webp', 0.7]] as const) { out = c.toDataURL(type, q); if (out.length <= LOGO_MAX) return out }
		}
		return out
	}
	function pickLogo(k: 'company' | 'client', e: Event) {
		const input = e.currentTarget as HTMLInputElement, f = input.files?.[0]; input.value = ''; if (f) uploadLogo(k, f)
	}
	function uploadLogo(k: 'company' | 'client', f: File) {
		const img = new Image(), url = URL.createObjectURL(f), h = t.logos?.[k]?.h ?? 10
		img.onload = async () => {
			URL.revokeObjectURL(url)
			const fallback = logoDataUrl(img)
			if (f.type === 'image/svg+xml') return upload(k, f, h, fallback)   // vector: as it is
			const b = await scaled(img, 1200, 480)
			upload(k, b ? new File([b], f.name.replace(/\.\w+$/, '') + '.png', { type: 'image/png' }) : f, h, fallback)
		}
		img.src = url
	}
	/** A logo still stored inline (a data URL) → file storage. */
	async function moveToStorage(k: 'company' | 'client', lg: TbLogo) {
		const b = await (await fetch(lg.src)).blob(), ext = b.type.split('/')[1]?.replace('svg+xml', 'svg') || 'png'
		upload(k, new File([b], `${k}-logo.${ext}`, { type: b.type }), lg.h ?? 10, lg.src)
	}
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value
	const blurOnEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }
</script>

<div class="prop-sec">Title block · project template</div>
<div class="prop"><span id={showId}>Show</span>
	<div class="chips" role="group" aria-labelledby={showId}>
		{#each SECTIONS as [s, label] (s)}<button class:on={shows(s)} title="{shows(s) ? 'Hide' : 'Show'} the {label.toLowerCase()} on every sheet" onclick={() => toggle(s)}>{label}</button>{/each}
		<button class:on={t.border} title="Print a hairline border along the paper margin (off = a screen-only guide)" onclick={() => set({ border: !t.border })}>Border</button>
	</div>
</div>
<label class="prop"><span>Layout</span>
	<select value={t.layout ?? 'vertical'} onchange={(e) => set({ layout: val(e) as TbLayout })}>
		<option value="vertical">Strip down the right</option><option value="horizontal">Band along the bottom</option><option value="compact">Compact box, bottom right</option>
	</select></label>
{#snippet logoControls(k: 'company' | 'client', label: string)}
	{@const lg = t.logos?.[k]}
	<span class="logo-row">
		{#if lg?.src}<img src={lg.src} alt={label} /><input type="number" min="3" max="60" value={lg.h ?? 10} title="Height on paper (mm)" aria-label="{label}: height on paper (mm)" onchange={(e) => setLogo(k, { ...lg, h: Math.max(3, Math.min(60, +val(e))) })} /><em>mm</em>
			{#if files}<button class="logo-up" title="Another image (Uploads)" onclick={() => (picking = k)}>Change…</button>{/if}
			{#if uploading === k}<em>uploading…</em>
			{:else if lg.src.startsWith('data:')}<button class="logo-up" title="This logo is stored inside the project document — upload it to file storage" onclick={() => moveToStorage(k, lg)}>Move to storage</button>{/if}
		{:else if uploading === k}<em>uploading…</em>
		{:else if files}<button class="logo-up" title="Pick one of the project's images (Uploads), or upload a new one" onclick={() => (picking = k)}>Choose…</button>
		{:else}<label class="logo-up">Choose image…<input type="file" accept="image/*" onchange={(e) => pickLogo(k, e)} /></label>{/if}
	</span>
{/snippet}
{#if picking && files}
	{@const k = picking}
	<LogoPicker db={files.db} pid={files.pid} title={k === 'company' ? 'Our logo' : 'Client logo'} onclose={() => (picking = null)}
		onpick={(f) => setLogo(k, { src: f.url, ...(f.key ? { key: f.key } : {}), h: t.logos?.[k]?.h ?? 10 })} onupload={(f) => uploadLogo(k, f)} />
{/if}
{#each fields as f, i (i)}
	{@const r = dr.row(`f${i}`)}
	<!-- the row is the drop target; only the grip starts a drag (so the inputs stay selectable) -->
	<div class="tbf" class:drag-before={dr.isBefore(`f${i}`)} class:drag-after={dr.isAfter(`f${i}`)} class:dragging={dr.dragId === `f${i}`}
		ondragover={r.ondragover} ondragleave={r.ondragleave} ondrop={r.ondrop} role="listitem">
		<span class="grip" draggable="true" ondragstart={r.ondragstart} ondragend={r.ondragend} title="Drag to reorder" role="button" tabindex="-1">⋮⋮</span>
		{#if f.key === 'logo' && f.logo}
			<!-- a logo field: its image (the label isn't printed) -->
			<span class="lbl logo-lbl" title="A logo image — drag to place it among the fields">{LOGO_LABEL[f.logo]}</span>
			{@render logoControls(f.logo, LOGO_LABEL[f.logo])}
		{:else if f.key === 'logoText'}
			<span class="lbl logo-lbl" title="The logo text — drag to place it">Logo text</span>
			<input class="txt" value={t.logo ?? ''} placeholder="(none)" aria-label="Logo text" onchange={(e) => set({ logo: val(e) })} onkeydown={blurOnEnter} />
		{:else if f.key === 'company'}
			<!-- the drawing office's block: name (bold), address, contact — one line each; drag to place it -->
			<span class="lbl logo-lbl" title="Your company's block — drag to place it">Company</span>
			<span class="co">
				<input value={t.company?.name ?? ''} placeholder="Name" aria-label="Company name" onchange={(e) => setCompany({ name: val(e) })} onkeydown={blurOnEnter} />
				<input value={t.company?.address ?? ''} placeholder="Address" aria-label="Company address" onchange={(e) => setCompany({ address: val(e) })} onkeydown={blurOnEnter} />
				<input value={t.company?.contact ?? ''} placeholder="Tel / email" aria-label="Company tel / email" onchange={(e) => setCompany({ contact: val(e) })} onkeydown={blurOnEnter} />
			</span>
		{:else if f.key === 'custom'}
			<input class="lbl" value={f.label} title="Label (custom text)" aria-label="Custom field label" onchange={(e) => setField(i, { label: val(e) })} onkeydown={blurOnEnter} />
			<input class="txt" value={f.value ?? ''} placeholder="text" aria-label="{f.label || 'Custom field'}: text" onchange={(e) => setField(i, { value: val(e) })} onkeydown={blurOnEnter} />
		{:else if f.key === 'site'}
			<!-- the site: its label, and the address it prints (the same on every sheet) -->
			<input class="lbl" value={f.label} title="Label" aria-label="Site field label" onchange={(e) => setField(i, { label: val(e) })} onkeydown={blurOnEnter} />
			<input class="txt" value={t.site ?? ''} placeholder="Site address" aria-label="Site address" onchange={(e) => set({ site: val(e) || undefined })} onkeydown={blurOnEnter} />
		{:else if f.key !== 'logo'}
			{@const auto = TB_AUTO[f.key]}
			<input class="lbl" value={f.label} title="Label — filled with the sheet's {auto.toLowerCase()}" aria-label="Label of the {auto.toLowerCase()} field" onchange={(e) => setField(i, { label: val(e) })} onkeydown={blurOnEnter} />
			<em title="Filled automatically">{auto}</em>
		{/if}
		{#if isFixedField(f)}
			<!-- the block's own items are always listed: cleared (or their section switched off), not removed; the logo
			     text and company block are always full width, a logo can be half (two side by side) -->
			{#if f.key === 'logo'}<button class:on={f.wide} title={f.wide ? 'Full width (click for half)' : 'Half width (click for full)'} onclick={() => setField(i, { wide: !f.wide })}>{f.wide ? '▭' : '◫'}</button>{:else}<span></span>{/if}
			{#if f.key === 'logo' && f.logo && t.logos?.[f.logo]?.src}<button title="Clear this logo image" onclick={() => setLogo(f.logo!, undefined)}><Icon name="x" size={11} /></button>{:else}<span></span>{/if}
		{:else}
			<button class:on={f.wide} title={f.wide ? 'Full width (click for half)' : 'Half width (click for full)'} onclick={() => setField(i, { wide: !f.wide })}>{f.wide ? '▭' : '◫'}</button>
			<button title="Remove" aria-label="Remove the {f.label || 'custom'} field" onclick={() => remove(i)}><Icon name="x" size={11} /></button>
		{/if}
	</div>
{/each}
<label class="prop"><span>Add</span>
	<select value="" onchange={(e) => { add(val(e)); (e.currentTarget as HTMLSelectElement).value = '' }}>
		<option value="">Add a field…</option>
		{#each Object.entries(TB_AUTO) as [k, l] (k)}<option value={k}>{l} (auto)</option>{/each}
		<option value="custom">Custom text</option>
	</select>
</label>
<div class="hint">Shared by every sheet in this project. Auto fields fill from the project and each sheet.</div>

<style>
	/* cad's light theme in place of Pages' variables */
	.tbf { display: flex; align-items: center; gap: 3px; padding: 0; line-height: 1.2; }
	.tbf .co { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
	.tbf .co input { width: 100%; }
	.tbf.drag-before { box-shadow: inset 0 2px 0 #2563eb; }
	.tbf.drag-after { box-shadow: inset 0 -2px 0 #2563eb; }
	.tbf.dragging { opacity: 0.45; }
	.grip { flex: none; width: 12px; color: var(--cad-faint); cursor: grab; font-size: 10px; letter-spacing: -2px; user-select: none; text-align: center; }
	.grip:hover { color: var(--cad-text); }
	.tbf input { background: var(--cad-input); color: var(--cad-text); border: 1px solid var(--cad-line); border-radius: 3px; padding: 0 4px; height: 18px; font-size: 11px; min-width: 0; }
	.tbf input:focus { outline: none; border-color: #2563eb; }
	.tbf .lbl { width: 64px; flex: none; }
	.tbf .txt { flex: 1; }
	.tbf em { flex: 1; min-width: 0; font-style: normal; font-size: 10px; color: var(--cad-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.tbf button { flex: none; width: 16px; height: 16px; display: grid; place-items: center; padding: 0; border: 1px solid transparent; border-radius: 3px; background: none; color: var(--cad-muted); cursor: pointer; font-size: 11px; }
	.tbf button:hover { border-color: var(--cad-line); color: var(--cad-text); }
	.tbf button.on { color: #2563eb; }
	.prop { display: grid; grid-template-columns: 6.5rem 1fr; align-items: center; gap: 4px; padding: 0; }
	.prop span { color: var(--cad-muted); font-size: 11px; }
	.prop select { background: var(--cad-input); color: var(--cad-text); border: 1px solid var(--cad-line); border-radius: 4px; padding: 1px 4px; font-size: 11px; min-width: 0; }
	.logo-row { display: flex; align-items: center; gap: 4px; min-width: 0; }
	.logo-row img { height: 22px; max-width: 90px; object-fit: contain; background: #fff; border-radius: 2px; }
	.logo-row input { width: 44px; }
	.logo-row em { font-style: normal; font-size: 10px; color: var(--cad-faint); }
	.logo-row button { background: none; border: none; color: var(--cad-muted); cursor: pointer; display: grid; place-items: center; }
	.logo-up { font-size: 10px; color: #2563eb; cursor: pointer; }
	.tbf .logo-row { flex: 1; }
	.tbf .logo-row button.logo-up { width: auto; padding: 0 3px; color: #2563eb; }
	.tbf .logo-lbl { font-size: 11px; color: var(--cad-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.logo-up input { display: none; }
	.chips { display: flex; flex-wrap: wrap; gap: 3px; }
	.chips button { padding: 0 6px; font-size: 10px; border: 1px solid var(--cad-line); border-radius: 9px; background: none; color: var(--cad-faint); cursor: pointer; }
	.chips button.on { color: var(--cad-link); border-color: #93c5fd; background: var(--cad-sel); }
	.prop-sec { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--cad-muted); padding: 10px 0 4px; }
	.hint { font-size: 10px; color: var(--cad-faint); padding: 4px 0 8px; line-height: 1.4; }
</style>

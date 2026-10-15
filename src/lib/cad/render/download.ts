// Save a generated file in the browser.
export function download(data: BlobPart, filename: string, type: string): void {
	const url = URL.createObjectURL(new Blob([data], { type }))
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A safe file name from free text ("Test Project 1F" → "Test_Project_1F"). */
export const fileSafe = (s: string) => s.replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^_+|_+$/g, '') || 'export'

/** What an export is, for the project's file-name pattern (Dave 2026-10-15: "Edit file names on export"): `revision` = its
 *  own revision where it has one (a sheet's, a revision PDF's, the BOM's typed one); `version` = the release number
 *  ("03") — a release's own, else the page fills in the project's latest. */
export interface FileParts { what: string; scope?: string; revision?: string; version?: string }

/** The tokens a pattern can use (Settings › Files › Export file names). */
export const FILE_TOKENS = ['{project}', '{what}', '{scope}', '{revision}', '{version}', '{date}'] as const

const today = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}` }

/** A file name from the pattern: "{project} {what} {scope} {date}" → "Test_Project_Patching_L1.20_20261015.xlsx". An
 *  empty token takes the separator before it with it. Null = no pattern, keep the export's own name. */
export function patternName(pattern: string | undefined, project: string, parts: FileParts, ext: string, date = today()): string | null {
	if (!pattern?.trim()) return null
	const v: Record<string, string> = { project, what: parts.what, scope: parts.scope ?? '', revision: parts.revision ?? '', version: parts.version ?? '', date }
	const base = pattern.replace(/([ _.-]*)\{(project|what|scope|revision|version|date)\}/g, (_, sep: string, k: string) => (v[k] ? sep + v[k] : ''))
	return `${fileSafe(base)}.${ext}`
}

/** How the app names a file before it is saved: the pattern, then the user's edit (null = cancelled). Set by the
 *  open cad page (CadShell); unset (tests, other pages) = the suggested name as it is. */
type Namer = (suggested: string, parts: FileParts | undefined, ext: string) => Promise<string | null>
let namer: Namer | null = null
export function setFileNamer(f: Namer | null): void { namer = f }

/** Save a file under a name the user can change first (and the project's pattern fills). Returns the name saved, or
 *  null when they cancelled. */
export async function saveFile(data: BlobPart, suggested: string, type: string, parts?: FileParts): Promise<string | null> {
	const ext = suggested.match(/\.([a-z0-9]+)$/i)?.[1] ?? ''
	const name = namer ? await namer(suggested, parts, ext) : suggested
	if (!name) return null
	download(data, ext && !name.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? `${name}.${ext}` : name, type)
	return name
}

/** The name a file would be saved under, without asking: the project's pattern, else the suggested name (the open cad
 *  page sets how; Ctrl+P names its PDF tab with it, Dave 2026-10-15). */
type Patterner = (suggested: string, parts: FileParts | undefined, ext: string) => string
let patterner: Patterner | null = null
export function setFilePatterner(f: Patterner | null): void { patterner = f }
export function fileName(suggested: string, parts?: FileParts): string {
	const ext = suggested.match(/\.([a-z0-9]+)$/i)?.[1] ?? ''
	return patterner ? patterner(suggested, parts, ext) : suggested
}

/** A generated PDF in a browser tab opened beforehand (`win`, opened on the click itself so no pop-up blocker stops it;
 *  Dave 2026-10-15): a slim bar — its name, Download (under exactly that name: the viewer's own download names a blob
 *  by a random id), Print, Email / share… (the system share sheet: Outlook, Mail …, where the browser has one) — over
 *  the browser's viewer. The tab's title is the name. */
export function showPdfTab(win: Window, blob: Blob, name: string): void {
	const file = `${name}.pdf`, url = URL.createObjectURL(blob)
	const d = win.document
	d.head.replaceChildren()
	const style = d.createElement('style')
	style.textContent = 'body{margin:0;display:flex;flex-direction:column;height:100vh;font:13px system-ui,sans-serif;background:#f4f4f5}' +
		'.bar{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid #d4d4d8;background:#fff}' +
		'.n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;color:#27272a}' +
		'button{padding:4px 12px;border:1px solid #d4d4d8;border-radius:5px;background:#fff;cursor:pointer;font:inherit}button:hover{background:#f4f4f5}' +
		'button.go{background:#2563eb;border-color:#2563eb;color:#fff}button.go:hover{background:#1d4ed8}' +
		'.msg{color:#71717a;font-size:12px}iframe{flex:1;border:0;width:100%}'
	d.head.appendChild(style)
	d.title = name   // after the head was emptied (that took the title with it)
	d.body.replaceChildren()
	const bar = d.createElement('div'), label = d.createElement('span'), msg = d.createElement('span')
	bar.className = 'bar'; label.className = 'n'; label.textContent = file; msg.className = 'msg'
	const button = (text: string, title: string, run: () => void, go = false) => {
		const b = d.createElement('button'); b.textContent = text; b.title = title; if (go) b.className = 'go'; b.onclick = run; return b
	}
	const frame = d.createElement('iframe')
	frame.src = url; frame.title = name
	const pdfFile = new File([blob], file, { type: 'application/pdf' })
	const nav = win.navigator as Navigator
	const canShare = typeof nav.canShare === 'function' && nav.canShare({ files: [pdfFile] })
	bar.append(label, msg,
		button('Download', `Save as ${file}`, () => { const a = d.createElement('a'); a.href = url; a.download = file; a.click() }, true),
		button('Print', 'Print it (or the viewer’s own print button)', () => { try { frame.contentWindow?.print() } catch { msg.textContent = 'Use the viewer’s print button' } }),
		...(canShare ? [button('Email / share…', 'Send it with Outlook, Mail, Teams … (the system share sheet)', () => { nav.share({ files: [pdfFile], title: name }).catch(() => { /* cancelled */ }) })] : []))
	d.body.append(bar, frame)
}

/** The /cad-print/ service worker of 2026-10-15 is gone (a viewer's Download skipped it and saved an HTML 404): drop it
 *  and its cache where a browser still has them. */
export function dropOldPrintWorker(): void {
	try {
		void navigator.serviceWorker?.getRegistrations().then((rs) => { for (const r of rs) if (r.scope.endsWith('/cad-print/')) void r.unregister() })
		void caches?.delete('cad-print')
	} catch { /* not available */ }
}

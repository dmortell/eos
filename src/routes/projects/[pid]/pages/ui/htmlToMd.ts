// Pasted HTML (Word, Google Docs, Excel, a web page) → the NOTE markdown subset (ui/noteLayout.ts): headings (h1–h3,
// Word's Title / Heading styles), bold (b / strong / font-weight ≥ 600 — not Google Docs' outer
// `<b style="font-weight:normal">`), bullet + numbered lists (ul / ol, Word's MsoListParagraph with its hidden
// marker), tables (first row = the header), paragraphs. Fonts / colours / italics have no markdown here and are
// dropped. Takes a parsed Document (DOMParser in the browser).

const clean = (s: string) => s.replace(/ /g, ' ').replace(/[ \t\r\n]+/g, ' ')

function isBoldEl(el: Element): boolean {
	const t = el.tagName.toLowerCase(), fw = (el as HTMLElement).style?.fontWeight
	if (fw === 'normal' || fw === '400') return false
	return t === 'b' || t === 'strong' || /^(bold|[6-9]00)$/.test(fw ?? '')
}
/** Inline text of a node, **bold** runs marked; Word's hidden list markers (mso-list:Ignore) skipped. */
function inline(n: Node): string {
	if (n.nodeType === 3) return clean(n.textContent ?? '')
	if (n.nodeType !== 1) return ''
	const el = n as HTMLElement
	if (/mso-list:\s*ignore/i.test(el.getAttribute('style') ?? '') || el.tagName === 'STYLE' || el.tagName === 'SCRIPT') return ''
	if (el.tagName === 'BR') return '\n'
	const inner = [...el.childNodes].map(inline).join('')
	return isBoldEl(el) && inner.trim() ? `**${inner.trim()}**` : inner
}
/** Word marks a list paragraph's bullet / number in a hidden span: its text says which. */
function wordListMarker(el: Element): string | null {
	const m = [...el.querySelectorAll('span')].find((s) => /mso-list:\s*ignore/i.test(s.getAttribute('style') ?? ''))
	if (!m) return null
	const t = clean(m.textContent ?? '').trim()
	return /^\d+[.)]$/.test(t) ? t.replace(')', '.') : '-'
}

export function htmlToMarkdown(doc: Document): string {
	const out: string[] = []
	const push = (s: string) => { const t = s.replace(/[ ]+\n/g, '\n').trim(); if (t) out.push(t) }
	const walk = (n: Element) => {
		for (const c of [...n.children]) {
			const tag = c.tagName.toLowerCase(), cls = c.getAttribute('class') ?? ''
			if (/^h[1-6]$/.test(tag)) { push('#'.repeat(Math.min(3, +tag[1])) + ' ' + inline(c).replace(/\*\*/g, '').trim()); continue }
			if (tag === 'p' && /MsoTitle/i.test(cls)) { push('# ' + inline(c).replace(/\*\*/g, '').trim()); continue }
			if (tag === 'ul' || tag === 'ol') {
				let k = 1
				for (const li of [...c.children].filter((x) => x.tagName === 'LI')) push((tag === 'ol' ? `${k++}.` : '-') + ' ' + inline(li).trim())
				out.push(''); continue
			}
			if (tag === 'table') {
				const rows = [...c.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('td, th')].map((td) => inline(td).replace(/\|/g, '/').replace(/\n/g, ' ').trim()))
				if (rows.length) {
					const n2 = Math.max(...rows.map((r) => r.length)), row = (r: string[]) => '| ' + Array.from({ length: n2 }, (_, i) => r[i] ?? '').join(' | ') + ' |'
					push([row(rows[0]), '|' + ' --- |'.repeat(n2), ...rows.slice(1).map(row)].join('\n')); out.push('')
				}
				continue
			}
			if (tag === 'p' || tag === 'li') {
				const mk = /MsoList/i.test(cls) ? wordListMarker(c) : null
				push((mk ? mk + ' ' : '') + inline(c).trim())
				continue
			}
			if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'body' || tag === 'span' || tag === 'b' || tag === 'font' || tag === 'center') {
				// a wrapper (Google Docs wraps everything in <b style="font-weight:normal">): its blocks, else its text
				if ([...c.children].some((x) => /^(p|div|h[1-6]|ul|ol|table)$/i.test(x.tagName))) walk(c); else push(inline(c))
				continue
			}
			push(inline(c))
		}
	}
	walk(doc.body)
	return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

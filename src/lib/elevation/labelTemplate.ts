/**
 * Excel-style label templates (labels v2, elevations-plan §11 L1).
 *
 * A template is a string of tokens, literals and conditional groups:
 *
 *   Token  Output                                   Repetition
 *   F      floor number                             zero-pad width (FF → "01")
 *   Z      zone letter                              (repeat = no effect)
 *   N      location number                          zero-pad width (NNN → "001")
 *   S      server room letter                       (repeat = no effect)
 *   P      port number (numeric)                    zero-pad width (PP → "04")
 *   A      port as letters (A…Z, AA…)               (repeat = no effect)
 *   R      room number ('' when unset)              (repeat = no effect)
 *   H      "H" when high-level, '' otherwise        (repeat = no effect)
 *
 *   "text" quoted literal (escapes token letters), [ … ] conditional group:
 *   rendered only when every token inside produced non-empty output — so
 *   `[-H]` appends "-H" for high-level ports only and `[.R]` includes the room
 *   only when one is set. Any other character is a literal.
 *
 * Example: `"L"FF.Z[.R].NNN-SPP[-H]` → `L01.A.023-B07-H`
 */

export interface LabelTemplateData {
	floor: number
	zone: string
	locationNumber: number
	serverRoom: string
	/** 1-based port index within the location. */
	port: number
	roomNumber?: string
	isHighLevel?: boolean
}

const TOKEN_LETTERS = new Set(['F', 'Z', 'N', 'S', 'P', 'A', 'R', 'H'])

type Segment =
	| { kind: 'literal'; text: string }
	| { kind: 'token'; letter: string; width: number }
	| { kind: 'group'; segments: Segment[] }

/** 1 → A, 26 → Z, 27 → AA … */
export function portAlpha(n: number): string {
	let s = ''
	for (let v = Math.max(1, n); v > 0; v = Math.floor((v - 1) / 26)) {
		s = String.fromCharCode(65 + ((v - 1) % 26)) + s
	}
	return s
}

export function parseTemplate(tpl: string): { segments: Segment[]; issues: string[] } {
	const issues: string[] = []
	const root: Segment[] = []
	let target = root
	let group: Segment[] | null = null
	let i = 0
	while (i < tpl.length) {
		const c = tpl[i]
		if (c === '"') {
			const end = tpl.indexOf('"', i + 1)
			if (end === -1) { issues.push('Unclosed quote'); target.push({ kind: 'literal', text: tpl.slice(i + 1) }); break }
			target.push({ kind: 'literal', text: tpl.slice(i + 1, end) })
			i = end + 1
		} else if (c === '[') {
			if (group) { issues.push('Nested [ ] groups are not supported'); i++; continue }
			group = []
			target = group
			i++
		} else if (c === ']') {
			if (!group) { issues.push('Unmatched ]'); i++; continue }
			root.push({ kind: 'group', segments: group })
			group = null
			target = root
			i++
		} else if (TOKEN_LETTERS.has(c)) {
			let width = 1
			while (tpl[i + width] === c) width++
			target.push({ kind: 'token', letter: c, width })
			i += width
		} else {
			target.push({ kind: 'literal', text: c })
			i++
		}
	}
	if (group) { issues.push('Unclosed [ group'); root.push({ kind: 'group', segments: group }) }
	if (!segmentsHaveToken(root)) issues.push('No tokens — every label would be identical')
	return { segments: root, issues }
}

function segmentsHaveToken(segs: Segment[]): boolean {
	return segs.some(s => s.kind === 'token' || (s.kind === 'group' && segmentsHaveToken(s.segments)))
}

function renderToken(letter: string, width: number, d: LabelTemplateData): string {
	switch (letter) {
		case 'F': return String(d.floor).padStart(width, '0')
		case 'Z': return d.zone
		case 'N': return String(d.locationNumber).padStart(width, '0')
		case 'S': return d.serverRoom
		case 'P': return String(d.port).padStart(width, '0')
		case 'A': return portAlpha(d.port)
		case 'R': return d.roomNumber ?? ''
		case 'H': return d.isHighLevel ? 'H' : ''
		default: return ''
	}
}

function renderSegments(segs: Segment[], d: LabelTemplateData): string {
	let out = ''
	for (const s of segs) {
		if (s.kind === 'literal') out += s.text
		else if (s.kind === 'token') out += renderToken(s.letter, s.width, d)
		else {
			// Group: drop entirely if any token inside is empty
			const tokens = s.segments.filter(x => x.kind === 'token') as Extract<Segment, { kind: 'token' }>[]
			if (tokens.length && tokens.some(t => renderToken(t.letter, t.width, d) === '')) continue
			out += renderSegments(s.segments, d)
		}
	}
	return out
}

export function renderLabel(tpl: string, d: LabelTemplateData): string {
	return renderSegments(parseTemplate(tpl).segments, d)
}

/** Sanity-check a template; empty array = usable. */
export function templateIssues(tpl: string): string[] {
	return parseTemplate(tpl).issues
}

const EXAMPLE: LabelTemplateData = { floor: 1, zone: 'A', locationNumber: 23, serverRoom: 'B', port: 4, roomNumber: '1201', isHighLevel: false }

/** Preview strings for pickers: normal + high-level variants. Pass overrides
 *  (e.g. the ACTIVE floor/zone) so the preview matches what will be created. */
export function templateExample(tpl: string, overrides: Partial<LabelTemplateData> = {}): { normal: string; highLevel: string } {
	const d = { ...EXAMPLE, ...overrides }
	return { normal: renderLabel(tpl, d), highLevel: renderLabel(tpl, { ...d, isHighLevel: true }) }
}

/** The floor part of a template for a project floorFormat ('L01' | '01F' | '01'). */
function floorPart(floorFormat: string): string {
	if (floorFormat === '01F') return 'FF"F"'
	if (floorFormat === '01') return 'FF'
	return '"L"FF'
}

/**
 * Template producing byte-identical labels to the legacy separator options
 * (engine.buildLabel) — used so existing docs keep their labels when the
 * template path takes over.
 */
export function templateForLegacyFormat(
	fmt: { separator: 'legacy' | 'period' | 'hyphen'; includeZone: boolean; includeRoom: boolean },
	floorFormat: string = 'L01',
): string {
	const sep = fmt.separator === 'hyphen' ? '-' : '.'
	let t = floorPart(floorFormat)
	if (fmt.includeZone) t += `${sep}Z`
	if (fmt.includeRoom) t += `[${sep}R]`
	t += `${sep}NNN`
	t += fmt.separator === 'legacy' ? '-SPP' : `${sep}SPP`
	t += fmt.separator === 'legacy' ? '[-H]' : `[${sep}H]`
	return t
}

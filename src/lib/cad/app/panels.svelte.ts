// The side and bottom panels (Dave: hide / show and resize them): sizes in px and which are shown, per user in this
// browser (all projects). The drawing takes whatever is left.
const KEY = 'cad-panels'
type Side = 'left' | 'right' | 'bottom'

export class Panels {
	size = $state<Record<Side, number>>({ left: 208, right: 272, bottom: 224 })
	shown = $state<Record<Side, boolean>>({ left: true, right: true, bottom: true })
	/** Split view: the left pane's share of the width (0.15–0.85; Dave: drag the bar between them). */
	split = $state(0.5)

	constructor() {
		try {
			const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { size?: Partial<Record<Side, number>>; shown?: Partial<Record<Side, boolean>>; split?: number }
			Object.assign(this.size, s.size)
			Object.assign(this.shown, s.shown)
			if (typeof s.split === 'number') this.split = Math.min(0.85, Math.max(0.15, s.split))
		} catch { /* nothing saved, or storage blocked: the defaults */ }
	}
	save = (): void => {
		try { localStorage.setItem(KEY, JSON.stringify({ size: this.size, shown: this.shown, split: this.split })) } catch { /* storage blocked */ }
	}
	toggle(side: Side): void { this.shown[side] = !this.shown[side]; this.save() }

	get columns(): string { return `${this.shown.left ? this.size.left : 0}px minmax(0, 1fr) ${this.shown.right ? this.size.right : 0}px` }
	get rows(): string { return `2.25rem minmax(0, 1fr) ${this.shown.bottom ? this.size.bottom : 0}px` }
}

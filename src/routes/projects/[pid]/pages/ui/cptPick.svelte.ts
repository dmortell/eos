// F6 "Place…" connection points: Properties arms it for a box; each click on the plan then adds a point there (as
// u / v ratios of the box, 3dview/connect.ts uvAt) until Esc / the button again / another selection.
export const cptPick = $state<{ obj: string | null }>({ obj: null })

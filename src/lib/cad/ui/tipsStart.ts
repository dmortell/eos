// Tips at start (User 2026-10-15): the Tips window opens by itself once a day, on the next tip, until "Show at start"
// is unticked. Per browser (localStorage); every read / write survives blocked storage.
const ON = 'cad-tips-start', DAY = 'cad-tips-day', AT = 'cad-tips-i'
const get = (k: string): string | null => { try { return localStorage.getItem(k) } catch { return null } }
const put = (k: string, v: string): void => { try { localStorage.setItem(k, v) } catch { /* storage blocked */ } }

export const tipsAtStart = (): boolean => get(ON) !== '0'
export const setTipsAtStart = (on: boolean): void => put(ON, on ? '1' : '0')
export const tipIndex = (): number => Math.max(0, Number(get(AT)) || 0)
export const setTipIndex = (i: number): void => put(AT, String(i))

/** True the first time it's asked on a new day (while tips are on); that day then starts on the next tip. */
export function tipsDue(today = new Date().toISOString().slice(0, 10)): boolean {
	if (!tipsAtStart() || get(DAY) === today) return false
	const first = get(DAY) == null
	put(DAY, today)
	if (!first) setTipIndex(tipIndex() + 1)
	return true
}

const FILTER_KEY = 'sentiero.filters'

const DEFAULT = {
  q: '',
  diff: [],
  duration: 'all',
  sort: 'nr',
  mine: false
}

let state = load()

function load () {
  const fromQuery = fromUrl()
  if (fromQuery) return fromQuery
  try {
    const raw = sessionStorage.getItem(FILTER_KEY)
    if (raw) return Object.assign({}, DEFAULT, JSON.parse(raw))
  } catch (e) {}
  return Object.assign({}, DEFAULT)
}

function fromUrl () {
  try {
    const u = new URL(window.location.href)
    const sp = u.searchParams
    if (![...sp.keys()].length) return null
    const out = Object.assign({}, DEFAULT)
    if (sp.has('q')) out.q = sp.get('q') || ''
    if (sp.has('diff')) out.diff = sp.get('diff').split(',').map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 5)
    if (sp.has('duration')) out.duration = sp.get('duration')
    if (sp.has('sort')) out.sort = sp.get('sort')
    if (sp.has('mine')) out.mine = sp.get('mine') === '1'
    return out
  } catch (e) { return null }
}

function persist () {
  try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(state)) } catch (e) {}
  const sp = new URLSearchParams()
  if (state.q) sp.set('q', state.q)
  if (state.diff.length) sp.set('diff', state.diff.join(','))
  if (state.duration !== 'all') sp.set('duration', state.duration)
  if (state.sort !== 'nr') sp.set('sort', state.sort)
  if (state.mine) sp.set('mine', '1')
  const url = window.location.pathname + (sp.toString() ? '?' + sp.toString() : '')
  history.replaceState(null, '', url)
}

export function getFilters () { return Object.assign({}, state) }

export function setFilters (patch) {
  state = Object.assign({}, state, patch)
  persist()
}

export function resetFilters () {
  state = Object.assign({}, DEFAULT)
  persist()
}

function durationMinutes (time) {
  return ((time && time[0]) || 0) * 60 + ((time && time[1]) || 0)
}

function matchesDuration (mins, bucket) {
  if (bucket === 'short') return mins < 120
  if (bucket === 'mid') return mins >= 120 && mins < 240
  if (bucket === 'long') return mins >= 240 && mins < 480
  if (bucket === 'xlong') return mins >= 480
  return true
}

export function applyFilters (hikes, sessionUser) {
  const q = state.q.trim().toLowerCase()
  let out = hikes.slice()
  if (q) {
    out = out.filter(h => {
      const blob = [h.name, h.start, h.end, h.description, String(h.nr)].filter(Boolean).join(' ').toLowerCase()
      return blob.indexOf(q) !== -1
    })
  }
  if (state.diff.length) out = out.filter(h => state.diff.indexOf(h.difficulty) !== -1)
  if (state.duration !== 'all') out = out.filter(h => matchesDuration(durationMinutes(h.time), state.duration))
  if (state.mine && sessionUser) out = out.filter(h => h.createdBy && h.createdBy.username === sessionUser)

  const cmp = {
    nr: (a, b) => a.nr - b.nr,
    name: (a, b) => (a.name || '').localeCompare(b.name || ''),
    distance: (a, b) => a.distance - b.distance,
    duration: (a, b) => durationMinutes(a.time) - durationMinutes(b.time),
    difficulty: (a, b) => a.difficulty - b.difficulty
  }[state.sort] || ((a, b) => a.nr - b.nr)
  out.sort(cmp)
  return out
}

export function isActive () {
  return state.q !== '' || state.diff.length > 0 || state.duration !== 'all' || state.sort !== 'nr' || state.mine
}

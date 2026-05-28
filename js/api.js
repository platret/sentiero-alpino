export const BASE_URL = 'https://it-university.ch/hike'
export const API = BASE_URL + '/resources/hike'
export const IMG_BASE = BASE_URL + '/img/'

const session = { user: null, role: 'GUEST', basic: null }

export function getSession () {
  return { user: session.user, role: session.role }
}

export function isGuest () { return session.role === 'GUEST' }
export function isReader () { return session.role === 'READER' || session.role === 'ADMIN' }
export function isAdmin () { return session.role === 'ADMIN' }

function authHeader () {
  return session.basic ? { Authorization: 'Basic ' + session.basic } : {}
}

function mapStatus (status) {
  if (status === 401) return 'Nicht eingeloggt oder falsche Zugangsdaten (401).'
  if (status === 403) return 'Keine Berechtigung (403).'
  if (status === 404) return 'Nicht gefunden (404).'
  if (status === 400) return 'Ungültige Daten (400).'
  return 'Fehler ' + status
}

async function readBody (res) {
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    try { return await res.json() } catch (e) { return null }
  }
  try { return await res.text() } catch (e) { return null }
}

async function request (path, opts = {}) {
  const headers = Object.assign({}, opts.headers || {}, authHeader())
  let res
  try {
    res = await fetch(API + path, Object.assign({}, opts, { headers }))
  } catch (e) {
    const err = new Error('API nicht erreichbar.')
    err.status = 0
    err.network = true
    throw err
  }
  const body = await readBody(res)
  if (!res.ok) {
    const err = new Error(mapStatus(res.status))
    err.status = res.status
    err.body = body
    throw err
  }
  return { status: res.status, body }
}

export async function login (user, pass) {
  const basic = btoa(user + ':' + pass)
  let res
  try {
    res = await fetch(API + '/login', { headers: { Authorization: 'Basic ' + basic } })
  } catch (e) {
    const err = new Error('API nicht erreichbar.'); err.status = 0; err.network = true; throw err
  }
  if (res.status === 401) { const err = new Error(mapStatus(401)); err.status = 401; throw err }
  if (!res.ok) { const err = new Error(mapStatus(res.status)); err.status = res.status; throw err }
  const role = (await res.text()).trim()
  session.user = user
  session.role = role
  session.basic = basic
  return role
}

export function logout () {
  session.user = null
  session.role = 'GUEST'
  session.basic = null
}

export async function reset () {
  return request('/reset')
}

export async function getAllHikes () {
  const r = await request('/all')
  return r.body || []
}

export async function getHike (nr) {
  const r = await request('/' + encodeURIComponent(nr))
  return r.body
}

export async function getComments (nr) {
  const r = await request('/' + encodeURIComponent(nr) + '/comment')
  return r.body || []
}

export async function createHike (hike) {
  if (!isAdmin()) { const e = new Error(mapStatus(403)); e.status = 403; throw e }
  const r = await request('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(hike)
  })
  return r.body
}

export async function updateHike (hike) {
  if (!isAdmin()) { const e = new Error(mapStatus(403)); e.status = 403; throw e }
  const r = await request('', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(hike)
  })
  return r.body
}

export async function deleteHike (nr) {
  if (!isAdmin()) { const e = new Error(mapStatus(403)); e.status = 403; throw e }
  return request('?nr=' + encodeURIComponent(nr), { method: 'DELETE' })
}

export async function addComment (comment) {
  if (!isReader()) { const e = new Error(mapStatus(401)); e.status = 401; throw e }
  const r = await request('/comment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(comment)
  })
  return r.body
}

export async function deleteComment (nr) {
  if (!isAdmin()) { const e = new Error(mapStatus(403)); e.status = 403; throw e }
  return request('/comment?nr=' + encodeURIComponent(nr), { method: 'DELETE' })
}

export async function uploadImage (file) {
  if (!isAdmin()) { const e = new Error(mapStatus(403)); e.status = 403; throw e }
  const fd = new FormData()
  fd.append('file', file, file.name)
  let res
  try {
    res = await fetch(API + '/image', { method: 'POST', headers: authHeader(), body: fd })
  } catch (e) {
    const err = new Error('API nicht erreichbar.'); err.status = 0; err.network = true; throw err
  }
  const body = await readBody(res)
  if (!res.ok) { const err = new Error(mapStatus(res.status)); err.status = res.status; err.body = body; throw err }
  return { status: res.status, body }
}

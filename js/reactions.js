const KEY = 'sentiero.reactions'
const ANON_KEY = 'sentiero.anonId'
export const EMOJIS = ['👍', '❤️', '🥾', '🏔️']

function load () {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch (e) { return {} }
}

function save (data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)) } catch (e) {}
}

function anonId () {
  try {
    let id = localStorage.getItem(ANON_KEY)
    if (!id) {
      id = 'anon-' + Math.random().toString(36).slice(2, 10)
      localStorage.setItem(ANON_KEY, id)
    }
    return id
  } catch (e) { return 'anon' }
}

export function userToken (sessionUser) {
  return sessionUser ? 'u:' + sessionUser : anonId()
}

export function getReactions (commentNr) {
  const all = load()
  const row = all[commentNr] || {}
  const out = {}
  for (const e of EMOJIS) out[e] = row[e] ? row[e].length : 0
  return out
}

export function hasReacted (commentNr, emoji, token) {
  const all = load()
  const row = all[commentNr] || {}
  return Array.isArray(row[emoji]) && row[emoji].indexOf(token) !== -1
}

export function toggleReaction (commentNr, emoji, token) {
  const all = load()
  const row = all[commentNr] || {}
  const arr = Array.isArray(row[emoji]) ? row[emoji] : []
  const i = arr.indexOf(token)
  if (i === -1) arr.push(token)
  else arr.splice(i, 1)
  row[emoji] = arr
  all[commentNr] = row
  save(all)
  return arr.length
}

export function dropComment (commentNr) {
  const all = load()
  delete all[commentNr]
  save(all)
}

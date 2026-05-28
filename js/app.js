import {
  IMG_BASE, getSession, isAdmin, isReader, login, logout,
  getAllHikes, getHike, getComments, createHike, updateHike,
  deleteHike, addComment, deleteComment, uploadImage
} from './api.js'
import { validateHike, validateComment, validateLogin, speed } from './validation.js'

const $ = sel => document.querySelector(sel)
const state = { hikes: [], comments: [], openHike: null, editingNr: null, pendingImage: null }

function fmtTime (t) {
  if (!t) return '–'
  const h = t[0] || 0; const m = t[1] || 0
  return h + ' Std ' + String(m).padStart(2, '0') + ' Min'
}

function stars (n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}

function el (tag, props, ...children) {
  const node = document.createElement(tag)
  if (props) {
    for (const k in props) {
      if (k === 'class') node.className = props[k]
      else if (k === 'text') node.textContent = props[k]
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), props[k])
      else if (k === 'html') node.innerHTML = props[k]
      else node.setAttribute(k, props[k])
    }
  }
  for (const c of children) {
    if (c == null) continue
    if (typeof c === 'string') node.appendChild(document.createTextNode(c))
    else node.appendChild(c)
  }
  return node
}

function toast (title, kind, sub) {
  const root = $('#toast')
  const t = el('div', { class: 't ' + (kind || 'info') })
  t.appendChild(document.createTextNode(title))
  if (sub) {
    const s = document.createElement('small')
    s.textContent = sub
    t.appendChild(s)
  }
  root.appendChild(t)
  setTimeout(() => t.remove(), 4200)
}

function showError (err, fallbackTitle) {
  const status = err && err.status
  const msg = (err && err.message) || 'Unbekannter Fehler'
  toast(fallbackTitle || 'Fehler', 'err', status ? msg + ' (' + status + ')' : msg)
}

function openModal (id) { $('#' + id).classList.add('show') }
function closeModal (id) { $('#' + id).classList.remove('show') }

function renderSession () {
  const s = getSession()
  const root = $('#session')
  root.innerHTML = ''
  if (s.role === 'GUEST') {
    const b = el('span', { class: 'badge b-guest', text: 'Gast' })
    const btn = el('button', { class: 'btn btn-ghost btn-sm', text: 'Anmelden', onclick: () => openModal('loginModal') })
    root.appendChild(b); root.appendChild(btn)
  } else {
    const cls = s.role === 'ADMIN' ? 'b-admin' : 'b-reader'
    const b = el('span', { class: 'badge ' + cls, text: s.user + ' · ' + s.role })
    const btn = el('button', { class: 'btn btn-ghost btn-sm', text: 'Abmelden', onclick: doLogout })
    root.appendChild(b); root.appendChild(btn)
  }
  $('#newBtn').style.display = isAdmin() ? 'inline-flex' : 'none'
}

function renderList () {
  const grid = $('#hikeGrid')
  $('#count').textContent = state.hikes.length + ' Wanderungen'
  grid.innerHTML = ''
  if (!state.hikes.length) {
    grid.appendChild(el('div', { class: 'empty', text: 'Keine Wanderungen vorhanden.' }))
    return
  }
  for (const h of state.hikes) {
    const card = el('article', { class: 'card' })
    if (h.imageElevation) {
      const thumb = el('div', { class: 'thumb' })
      const img = el('img', { alt: 'Höhenprofil ' + h.name, loading: 'lazy', src: IMG_BASE + encodeURIComponent(h.imageElevation) })
      img.onerror = () => { thumb.classList.add('thumb-missing'); img.remove() }
      thumb.appendChild(img)
      card.appendChild(thumb)
    }
    const top = el('div', { class: 'top' })
    top.appendChild(el('h3', { text: h.name }))
    const route = el('div', { class: 'route' })
    route.appendChild(el('b', { text: h.start }))
    route.appendChild(document.createTextNode(' → '))
    route.appendChild(el('b', { text: h.end }))
    top.appendChild(route)
    card.appendChild(top)

    const meta = el('div', { class: 'meta' })
    const diffChip = el('span', { class: 'chip diff' })
    diffChip.appendChild(el('span', { class: 'lab', text: 'Schwierigkeit' }))
    diffChip.appendChild(document.createTextNode(' '))
    for (let i = 1; i <= 5; i++) diffChip.appendChild(el('span', { class: 'pip' + (i <= h.difficulty ? ' on' : '') }))
    meta.appendChild(diffChip)
    const distChip = el('span', { class: 'chip' })
    distChip.appendChild(el('span', { class: 'lab', text: 'Distanz' }))
    distChip.appendChild(document.createTextNode(' ' + h.distance + ' km'))
    meta.appendChild(distChip)
    const durChip = el('span', { class: 'chip' })
    durChip.appendChild(el('span', { class: 'lab', text: 'Dauer' }))
    durChip.appendChild(document.createTextNode(' ' + fmtTime(h.time)))
    meta.appendChild(durChip)
    card.appendChild(meta)

    const by = el('div', { class: 'by', text: 'Nr ' + h.nr + ' · erstellt von ' + ((h.createdBy && h.createdBy.username) || '–') })
    card.appendChild(by)

    const foot = el('div', { class: 'foot' })
    foot.appendChild(el('button', { class: 'btn btn-pri btn-sm', text: 'Details', onclick: () => openDetail(h.nr) }))
    if (isAdmin()) {
      foot.appendChild(el('button', { class: 'btn btn-ln btn-sm', text: 'Bearbeiten', onclick: () => openHikeForm(h.nr) }))
      foot.appendChild(el('button', { class: 'btn btn-del btn-sm', text: 'Löschen', onclick: () => onDeleteHike(h.nr) }))
    }
    card.appendChild(foot)
    grid.appendChild(card)
  }
}

async function openDetail (nr) {
  state.openHike = nr
  let h
  try { h = await getHike(nr) } catch (e) { showError(e, 'Wanderung nicht geladen'); return }
  const d = $('#detailView')
  d.innerHTML = ''
  const back = el('button', { class: 'back', text: '← Zurück zur Liste', onclick: closeDetail })
  d.appendChild(back)
  const dgrid = el('div', { class: 'dgrid' })
  const elev = el('div', { class: 'elev' })
  const img = el('img', { alt: 'Höhenprofil' })
  img.src = h.imageElevation ? IMG_BASE + encodeURIComponent(h.imageElevation) : ''
  img.onerror = () => { img.alt = 'Höhenprofil nicht verfügbar'; img.style.display = 'none' }
  elev.appendChild(img)
  elev.appendChild(el('div', { class: 'cap', text: 'Höhenprofil · ' + (h.imageElevation || '–') }))
  dgrid.appendChild(elev)

  const dinfo = el('div', { class: 'dinfo' })
  dinfo.appendChild(el('h2', { text: h.name }))
  dinfo.appendChild(el('div', { class: 'sub', text: h.start + ' → ' + h.end }))
  const facts = el('div', { class: 'facts' })
  facts.appendChild(factBox('Schwierigkeit', h.difficulty + ' / 5'))
  facts.appendChild(factBox('Distanz', h.distance + ' km'))
  facts.appendChild(factBox('Dauer', fmtTime(h.time)))
  facts.appendChild(factBox('Ø Tempo', speed(h.distance, h.time[0], h.time[1]).toFixed(2) + ' km/h'))
  dinfo.appendChild(facts)
  if (h.description) dinfo.appendChild(el('div', { class: 'desc', text: h.description }))
  else dinfo.appendChild(el('div', { class: 'hint', text: 'Keine Beschreibung erfasst.' }))
  dgrid.appendChild(dinfo)
  d.appendChild(dgrid)

  const comments = el('div', { class: 'comments' })
  comments.appendChild(el('h3', { text: 'Kommentare' }))
  d.appendChild(comments)

  $('#listView').style.display = 'none'
  d.classList.add('show')
  window.scrollTo(0, 0)

  if (!isReader()) {
    comments.appendChild(el('div', { class: 'empty', text: 'Bitte anmelden (Reader oder Admin), um Kommentare zu sehen und zu erfassen.' }))
    return
  }
  try {
    const list = await getComments(nr)
    renderCommentsInto(comments, nr, list)
  } catch (e) {
    showError(e, 'Kommentare nicht geladen')
  }
}

function factBox (l, v) {
  const f = el('div', { class: 'fact' })
  f.appendChild(el('div', { class: 'l', text: l }))
  f.appendChild(el('div', { class: 'v', text: v }))
  return f
}

function renderCommentsInto (root, hikeNr, list) {
  if (!list.length) root.appendChild(el('div', { class: 'empty', text: 'Noch keine Kommentare zu dieser Wanderung.' }))
  else {
    for (const c of list) {
      const cmt = el('div', { class: 'cmt' })
      const ch = el('div', { class: 'ch' })
      ch.appendChild(el('h4', { text: c.title }))
      ch.appendChild(el('span', { class: 'stars', text: stars(c.rating) }))
      cmt.appendChild(ch)
      cmt.appendChild(el('p', { text: c.text }))
      const ch2 = el('div', { class: 'ch' })
      const who = c.createdBy ? (c.createdBy.username + ' · ' + c.createdBy.userRole) : '–'
      ch2.appendChild(el('span', { class: 'cby', text: who }))
      if (isAdmin()) ch2.appendChild(el('button', { class: 'btn btn-del btn-sm', text: 'Löschen', onclick: () => onDeleteComment(c.nr) }))
      cmt.appendChild(ch2)
      root.appendChild(cmt)
    }
  }
  const form = el('div', { class: 'cmt', style: 'border-style:dashed' })
  form.appendChild(el('h4', { text: 'Kommentar erfassen', style: 'margin-bottom:10px' }))
  const fT = field('Titel (min. 10 Zeichen)', 'input', 'c_title')
  const fX = field('Text (min. 20 Zeichen)', 'textarea', 'c_text')
  const fR = field('Bewertung (1–5)', 'select', 'c_rating', ['', '1', '2', '3', '4', '5'])
  fR.style.maxWidth = '160px'
  form.appendChild(fT); form.appendChild(fX); form.appendChild(fR)
  const submit = el('button', { class: 'btn btn-pri btn-sm', text: 'Absenden', onclick: () => onAddComment(hikeNr) })
  form.appendChild(submit)
  root.appendChild(form)
}

function field (label, kind, id, options) {
  const f = el('div', { class: 'field' })
  f.appendChild(el('label', { text: label }))
  let input
  if (kind === 'textarea') input = document.createElement('textarea')
  else if (kind === 'select') {
    input = document.createElement('select')
    for (const o of options) {
      const op = document.createElement('option')
      op.value = o; op.textContent = o || '…'
      input.appendChild(op)
    }
  } else input = document.createElement('input')
  input.id = id
  f.appendChild(input)
  const err = el('div', { class: 'err' })
  f.appendChild(err)
  return f
}

function closeDetail () {
  state.openHike = null
  $('#detailView').classList.remove('show')
  $('#listView').style.display = 'block'
}

function setFieldError (input, msg) {
  const f = input.closest('.field')
  if (!f) return
  const e = f.querySelector('.err')
  if (msg) {
    f.classList.add('bad')
    if (e) { e.textContent = msg; e.classList.add('show') }
  } else {
    f.classList.remove('bad')
    if (e) e.classList.remove('show')
  }
}

function clearFormErrors (formSelector) {
  document.querySelectorAll(formSelector + ' .field').forEach(f => {
    f.classList.remove('bad')
    const e = f.querySelector('.err')
    if (e) e.classList.remove('show')
  })
}

async function onAddComment (hikeNr) {
  if (!isReader()) { toast('Bitte anmelden', 'err', 'Reader oder Admin nötig (401)'); return }
  const title = $('#c_title').value.trim()
  const text = $('#c_text').value.trim()
  const rating = parseInt($('#c_rating').value, 10)
  const errors = validateComment({ title, text, rating })
  setFieldError($('#c_title'), errors.title)
  setFieldError($('#c_text'), errors.text)
  setFieldError($('#c_rating'), errors.rating)
  if (Object.keys(errors).length) { toast('Validierung fehlgeschlagen', 'err', 'Bitte markierte Felder prüfen'); return }
  const hike = state.hikes.find(x => x.nr === hikeNr)
  if (!hike) { toast('Wanderung nicht gefunden', 'err', '404'); return }
  const payload = {
    nr: 0,
    title,
    text,
    rating,
    created: new Date().toISOString().slice(0, 19),
    createdBy: { username: getSession().user, userRole: getSession().role },
    hike: stripHike(hike)
  }
  try {
    await addComment(payload)
    toast('Kommentar erfasst', 'ok', 'POST 200')
    openDetail(hikeNr)
  } catch (e) {
    showError(e, 'Kommentar nicht erfasst')
  }
}

function stripHike (h) {
  return {
    nr: h.nr, name: h.name, description: h.description || '', difficulty: h.difficulty,
    distance: h.distance, time: h.time, imageElevation: h.imageElevation,
    created: h.created, start: h.start, end: h.end,
    createdBy: h.createdBy ? { username: h.createdBy.username, userRole: h.createdBy.userRole } : null
  }
}

async function onDeleteComment (nr) {
  if (!isAdmin()) { toast('Keine Berechtigung', 'err', '403'); return }
  if (!confirm('Kommentar wirklich löschen?')) return
  try {
    await deleteComment(nr)
    toast('Kommentar gelöscht', 'ok', 'DELETE 200')
    if (state.openHike) openDetail(state.openHike)
  } catch (e) {
    showError(e, 'Kommentar nicht gelöscht')
  }
}

async function onDeleteHike (nr) {
  if (!isAdmin()) { toast('Keine Berechtigung', 'err', '403'); return }
  const h = state.hikes.find(x => x.nr === nr)
  if (!h) return
  if (!confirm('Wanderung „' + h.name + '" wirklich löschen?')) return
  try {
    await deleteHike(nr)
    toast('Wanderung gelöscht', 'ok', 'DELETE 200 · ' + h.name)
    if (state.openHike === nr) closeDetail()
    await loadAndRender()
  } catch (e) {
    showError(e, 'Löschen fehlgeschlagen')
  }
}

function openHikeForm (nr) {
  if (!isAdmin()) { toast('Keine Berechtigung', 'err', 'Nur Admin (403)'); return }
  state.editingNr = nr || null
  state.pendingImage = null
  $('#hmTitle').textContent = nr ? 'Wanderung bearbeiten' : 'Neue Wanderung'
  clearFormErrors('#hikeForm')
  const f = state.hikes.find(x => x.nr === nr)
  $('#f_nr').value = f ? f.nr : ''
  $('#f_nr').disabled = !!f
  $('#f_name').value = f ? f.name : ''
  $('#f_desc').value = f ? (f.description || '') : ''
  $('#f_diff').value = f ? f.difficulty : ''
  $('#f_dist').value = f ? f.distance : ''
  $('#f_h').value = f ? f.time[0] : ''
  $('#f_m').value = f ? f.time[1] : ''
  $('#f_start').value = f ? f.start : ''
  $('#f_end').value = f ? f.end : ''
  $('#f_img').value = ''
  openModal('hikeModal')
}

async function saveHike () {
  if (!isAdmin()) { toast('Keine Berechtigung', 'err', '403'); return }
  const editing = state.hikes.find(x => x.nr === state.editingNr)
  const nr = parseInt($('#f_nr').value, 10)
  const name = $('#f_name').value.trim()
  const desc = $('#f_desc').value.trim()
  const diff = parseInt($('#f_diff').value, 10)
  const dist = parseFloat($('#f_dist').value)
  const h = parseInt($('#f_h').value, 10)
  const m = parseInt($('#f_m').value, 10)
  const start = $('#f_start').value.trim()
  const end = $('#f_end').value.trim()
  const file = $('#f_img').files[0]
  const imageName = file ? file.name : (editing ? editing.imageElevation : '')

  const data = {
    nr: isNaN(nr) ? null : nr,
    name,
    description: desc,
    difficulty: isNaN(diff) ? null : diff,
    distance: isNaN(dist) ? null : dist,
    time: [isNaN(h) ? null : h, isNaN(m) ? null : m],
    imageElevation: imageName,
    created: editing ? editing.created : new Date().toISOString().slice(0, 19),
    start,
    end,
    createdBy: { username: getSession().user, userRole: getSession().role }
  }

  const errors = validateHike(data)
  clearFormErrors('#hikeForm')
  if (errors.nr) setFieldError($('#f_nr'), errors.nr)
  if (errors.name) setFieldError($('#f_name'), errors.name)
  if (errors.description) setFieldError($('#f_desc'), errors.description)
  if (errors.difficulty) setFieldError($('#f_diff'), errors.difficulty)
  if (errors.distance) setFieldError($('#f_dist'), errors.distance)
  if (errors.time) setFieldError($('#f_h'), errors.time)
  if (errors.start) setFieldError($('#f_start'), errors.start)
  if (errors.end) setFieldError($('#f_end'), errors.end)
  if (errors.imageElevation) setFieldError($('#f_img'), errors.imageElevation)
  if (Object.keys(errors).length) { toast('Validierung fehlgeschlagen', 'err', 'Bitte markierte Felder prüfen (400)'); return }

  if (!editing && state.hikes.some(x => x.nr === nr)) {
    setFieldError($('#f_nr'), 'Nr bereits vergeben.')
    toast('Nr bereits vergeben', 'err', '400 Bad Request')
    return
  }

  if (file) {
    try {
      await uploadImage(file)
      toast('Bild hochgeladen', 'ok', file.name)
    } catch (e) {
      showError(e, 'Bild-Upload fehlgeschlagen')
      return
    }
  }

  try {
    if (editing) {
      await updateHike(data)
      toast('Wanderung aktualisiert', 'ok', 'PUT 200 · ' + name)
    } else {
      await createHike(data)
      toast('Wanderung erstellt', 'ok', 'POST 200 · ' + name)
    }
    closeModal('hikeModal')
    await loadAndRender()
    if (state.openHike) openDetail(state.openHike)
  } catch (e) {
    showError(e, 'Speichern fehlgeschlagen')
  }
}

async function doLogin () {
  const u = $('#lgUser').value.trim()
  const p = $('#lgPass').value
  const errs = validateLogin(u, p)
  if (Object.keys(errs).length) {
    $('#lgErr').textContent = errs.user || errs.pass
    $('#lgErr').classList.add('show')
    return
  }
  try {
    const role = await login(u, p)
    $('#lgErr').classList.remove('show')
    $('#lgUser').value = ''
    $('#lgPass').value = ''
    closeModal('loginModal')
    renderSession()
    await loadAndRender()
    if (state.openHike) openDetail(state.openHike)
    toast('Angemeldet als ' + u, 'ok', role + ' · 200 OK')
  } catch (e) {
    $('#lgErr').textContent = e.message
    $('#lgErr').classList.add('show')
  }
}

function doLogout () {
  logout()
  renderSession()
  toast('Abgemeldet', 'info')
  if (state.openHike) openDetail(state.openHike)
  renderList()
}

async function loadAndRender () {
  try {
    state.hikes = await getAllHikes()
  } catch (e) {
    state.hikes = []
    showError(e, 'Wanderungen nicht geladen')
  }
  renderList()
}

function wireEvents () {
  $('#lgSubmit').addEventListener('click', doLogin)
  $('#lgCancel').addEventListener('click', () => closeModal('loginModal'))
  $('#hmSubmit').addEventListener('click', saveHike)
  $('#hmCancel').addEventListener('click', () => closeModal('hikeModal'))
  $('#newBtn').addEventListener('click', () => openHikeForm())
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal('loginModal'); closeModal('hikeModal') }
  })
}

wireEvents()
renderSession()
loadAndRender()

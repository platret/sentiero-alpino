import {
  IMG_BASE, getSession, isAdmin, isReader, login, logout,
  getAllHikes, getHike, getComments, createHike, updateHike,
  deleteHike, addComment, deleteComment, uploadImage
} from './api.js'
import { validateHike, validateComment, validateLogin, speed } from './validation.js'
import { t, getLang, setLang, listLangs, applyDomTranslations } from './i18n.js'
import { getTheme, toggleTheme, applyTheme } from './theme.js'
import { getFilters, setFilters, resetFilters, applyFilters, isActive } from './filters.js'
import { EMOJIS, getReactions, hasReacted, toggleReaction, userToken, dropComment } from './reactions.js'

const $ = sel => document.querySelector(sel)
const state = { hikes: [], comments: [], openHike: null, editingNr: null, commentSort: 'new', loading: true }

function fmtTime (time) {
  if (!time) return '–'
  const h = time[0] || 0; const m = time[1] || 0
  return h + ' h ' + String(m).padStart(2, '0') + ' min'
}

function stars (n) { return '★'.repeat(n) + '☆'.repeat(5 - n) }

function el (tag, props, ...children) {
  const node = document.createElement(tag)
  if (props) {
    for (const k in props) {
      if (k === 'class') node.className = props[k]
      else if (k === 'text') node.textContent = props[k]
      else if (k === 'html') node.innerHTML = props[k]
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), props[k])
      else if (k === 'dataset') { for (const d in props[k]) node.dataset[d] = props[k][d] }
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

function peaks (level) {
  const wrap = el('span', { class: 'peaks', 'aria-label': t('chip.difficulty') + ' ' + level + '/5' })
  for (let i = 1; i <= 5; i++) wrap.appendChild(el('span', { class: 'pk l' + i + (i <= level ? ' on' : '') }))
  return wrap
}

function showModal (id) {
  const node = document.getElementById(id)
  if (!node) return
  window.bootstrap.Modal.getOrCreateInstance(node).show()
}

function hideModal (id) {
  const node = document.getElementById(id)
  if (!node) return
  const inst = window.bootstrap.Modal.getInstance(node)
  if (inst) inst.hide()
}

function toast (title, kind, sub) {
  const root = $('#toast')
  const tt = el('div', { class: 't ' + (kind || 'info'), role: 'status' })
  tt.appendChild(document.createTextNode(title))
  if (sub) {
    const s = document.createElement('small')
    s.textContent = sub
    tt.appendChild(s)
  }
  root.appendChild(tt)
  setTimeout(() => tt.remove(), 4200)
}

function showError (err, fallbackKey) {
  const status = err && err.status
  const msg = (err && err.message) || 'Error'
  toast(t(fallbackKey || 'toast.notFound'), 'err', status ? msg + ' (' + status + ')' : msg)
}

function renderSession () {
  const s = getSession()
  const root = $('#session')
  root.innerHTML = ''

  if (s.role === 'GUEST') {
    root.appendChild(el('span', { class: 'badge b-guest', text: t('nav.guest') }))
    root.appendChild(el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: t('nav.login'), onclick: () => showModal('loginModal') }))
  } else {
    const cls = s.role === 'ADMIN' ? 'b-admin' : 'b-reader'
    root.appendChild(el('span', { class: 'badge ' + cls, text: s.user + ' · ' + s.role }))
    root.appendChild(el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: t('nav.logout'), onclick: doLogout }))
  }

  const langPick = el('div', { class: 'langpick', role: 'group', 'aria-label': t('lang.toggle') })
  for (const lg of listLangs()) {
    const b = el('button', { type: 'button', text: lg.toUpperCase(), onclick: () => setLang(lg) })
    if (getLang() === lg) b.setAttribute('aria-pressed', 'true')
    langPick.appendChild(b)
  }
  root.appendChild(langPick)

  const themeBtn = el('button', {
    class: 'btn-icon', type: 'button',
    'aria-label': t('theme.toggle'), title: t('theme.toggle'),
    text: getTheme() === 'dark' ? '☀' : '☾',
    onclick: () => { toggleTheme(); renderSession() }
  })
  root.appendChild(themeBtn)

  $('#newBtn').style.display = isAdmin() ? 'inline-flex' : 'none'
}

function renderFilterBar () {
  const root = $('#filterBar')
  root.innerHTML = ''
  const f = getFilters()

  const row1 = el('div', { class: 'filter-row' })
  const search = el('div', { class: 'search fr-grow' })
  const input = el('input', { type: 'search', class: 'form-control', placeholder: t('filter.search'), value: f.q, 'aria-label': t('filter.search') })
  let debounce
  input.addEventListener('input', e => {
    clearTimeout(debounce)
    debounce = setTimeout(() => { setFilters({ q: e.target.value }); renderList() }, 140)
  })
  search.appendChild(input)
  row1.appendChild(search)

  const sortWrap = el('div', { class: 'd-flex align-items-center gap-2' })
  sortWrap.appendChild(el('span', { class: 'filter-label', text: t('filter.sort') }))
  const sortSel = el('select', { class: 'fselect' })
  for (const [v, k] of [['nr', 'filter.sort.nr'], ['name', 'filter.sort.name'], ['distance', 'filter.sort.distance'], ['duration', 'filter.sort.duration'], ['difficulty', 'filter.sort.difficulty']]) {
    const op = el('option', { value: v, text: t(k) })
    if (f.sort === v) op.selected = true
    sortSel.appendChild(op)
  }
  sortSel.addEventListener('change', e => { setFilters({ sort: e.target.value }); renderList() })
  sortWrap.appendChild(sortSel)
  row1.appendChild(sortWrap)
  root.appendChild(row1)

  const row2 = el('div', { class: 'filter-row' })
  row2.appendChild(el('span', { class: 'filter-label', text: t('filter.diffLabel') }))
  const diffChips = el('div', { class: 'chips' })
  for (let i = 1; i <= 5; i++) {
    const on = f.diff.indexOf(i) !== -1
    const btn = el('button', {
      class: 'chip-btn', type: 'button',
      onclick: () => {
        const cur = getFilters().diff.slice()
        const idx = cur.indexOf(i)
        if (idx === -1) cur.push(i); else cur.splice(idx, 1)
        setFilters({ diff: cur.sort() })
        renderFilterBar(); renderList()
      }
    })
    btn.appendChild(peaks(i))
    btn.appendChild(document.createTextNode(' ' + i))
    if (on) btn.setAttribute('aria-pressed', 'true')
    diffChips.appendChild(btn)
  }
  row2.appendChild(diffChips)

  row2.appendChild(el('span', { class: 'filter-label ms-2', text: t('filter.duration') }))
  const durSel = el('select', { class: 'fselect' })
  for (const [v, k] of [['all', 'filter.dur.all'], ['short', 'filter.dur.short'], ['mid', 'filter.dur.mid'], ['long', 'filter.dur.long'], ['xlong', 'filter.dur.xlong']]) {
    const op = el('option', { value: v, text: t(k) })
    if (f.duration === v) op.selected = true
    durSel.appendChild(op)
  }
  durSel.addEventListener('change', e => { setFilters({ duration: e.target.value }); renderList() })
  row2.appendChild(durSel)

  if (getSession().user) {
    const lbl = el('label', { class: 'toggle' })
    const cb = el('input', { type: 'checkbox' })
    if (f.mine) cb.checked = true
    cb.addEventListener('change', () => { setFilters({ mine: cb.checked }); renderList() })
    lbl.appendChild(cb)
    lbl.appendChild(el('span', { class: 'sw' }))
    lbl.appendChild(document.createTextNode(' ' + t('filter.mine')))
    row2.appendChild(lbl)
  }

  row2.appendChild(el('span', { class: 'hits', id: 'hits' }))

  if (isActive()) {
    row2.appendChild(el('button', { class: 'reset-btn', type: 'button', text: t('filter.reset'), onclick: () => { resetFilters(); renderFilterBar(); renderList() } }))
  }
  root.appendChild(row2)
}

function renderSkeleton () {
  const grid = $('#hikeGrid')
  grid.className = 'skel-grid'
  grid.innerHTML = ''
  for (let i = 0; i < 6; i++) {
    const sk = el('div', { class: 'skel' })
    sk.appendChild(el('div', { class: 'sk-img' }))
    const body = el('div', { class: 'sk-body' })
    body.appendChild(el('div', { class: 'sk-line h22 w70' }))
    body.appendChild(el('div', { class: 'sk-line w50' }))
    body.appendChild(el('div', { class: 'sk-line w30' }))
    sk.appendChild(body)
    grid.appendChild(sk)
  }
  $('#count').textContent = ''
}

function renderList () {
  const grid = $('#hikeGrid')
  grid.className = 'grid'
  const filtered = applyFilters(state.hikes, getSession().user)
  $('#count').textContent = filtered.length + ' ' + t('count.suffix')
  const hits = $('#hits')
  if (hits) hits.textContent = t('filter.hits', { shown: filtered.length, total: state.hikes.length })

  grid.innerHTML = ''
  if (!state.hikes.length) {
    grid.appendChild(el('div', { class: 'empty', text: t('list.empty.noHikes') }))
    return
  }
  if (!filtered.length) {
    const empty = el('div', { class: 'empty' })
    empty.appendChild(document.createTextNode(t('list.empty.noResults')))
    empty.appendChild(el('br'))
    empty.appendChild(el('button', { class: 'btn btn-ln btn-sm', type: 'button', text: t('filter.reset'), onclick: () => { resetFilters(); renderFilterBar(); renderList() } }))
    grid.appendChild(empty)
    return
  }
  for (const h of filtered) grid.appendChild(renderCard(h))
}

function renderCard (h) {
  const card = el('article', { class: 'card' })
  const thumb = el('div', { class: 'thumb', dataset: { empty: t('card.noImage') } })
  if (h.imageElevation) {
    const img = el('img', { alt: t('detail.elev') + ' ' + h.name, loading: 'lazy', src: IMG_BASE + encodeURIComponent(h.imageElevation) })
    img.onerror = () => { thumb.classList.add('thumb-missing'); img.remove() }
    thumb.appendChild(img)
  } else thumb.classList.add('thumb-missing')
  card.appendChild(thumb)

  const top = el('div', { class: 'top' })
  top.appendChild(el('h3', { text: h.name }))
  const route = el('div', { class: 'route' })
  route.appendChild(el('b', { text: h.start }))
  route.appendChild(document.createTextNode(' → '))
  route.appendChild(el('b', { text: h.end }))
  top.appendChild(route)
  card.appendChild(top)

  const meta = el('div', { class: 'meta' })
  const diffChip = el('span', { class: 'chip' })
  diffChip.appendChild(el('span', { class: 'lab', text: t('chip.difficulty') }))
  diffChip.appendChild(document.createTextNode(' '))
  diffChip.appendChild(peaks(h.difficulty))
  meta.appendChild(diffChip)
  const distChip = el('span', { class: 'chip' })
  distChip.appendChild(el('span', { class: 'lab', text: t('chip.distance') }))
  distChip.appendChild(document.createTextNode(' ' + h.distance + ' km'))
  meta.appendChild(distChip)
  const durChip = el('span', { class: 'chip' })
  durChip.appendChild(el('span', { class: 'lab', text: t('chip.duration') }))
  durChip.appendChild(document.createTextNode(' ' + fmtTime(h.time)))
  meta.appendChild(durChip)
  card.appendChild(meta)

  card.appendChild(el('div', { class: 'by', text: t('card.createdBy', { nr: h.nr, user: (h.createdBy && h.createdBy.username) || '–' }) }))

  const foot = el('div', { class: 'foot' })
  foot.appendChild(el('button', { class: 'btn btn-pri btn-sm', type: 'button', text: t('card.details'), onclick: () => openDetail(h.nr) }))
  if (isAdmin()) {
    foot.appendChild(el('button', { class: 'btn btn-ln btn-sm', type: 'button', text: t('card.edit'), onclick: () => openHikeForm(h.nr) }))
    foot.appendChild(el('button', { class: 'btn btn-del btn-sm', type: 'button', text: t('card.delete'), onclick: () => onDeleteHike(h.nr) }))
  }
  card.appendChild(foot)
  return card
}

async function openDetail (nr) {
  state.openHike = nr
  let h
  try { h = await getHike(nr) } catch (e) { showError(e, 'toast.notFound'); return }
  const d = $('#detailView')
  d.innerHTML = ''
  d.appendChild(el('button', { class: 'back', type: 'button', text: t('detail.back'), onclick: closeDetail }))

  const dgrid = el('div', { class: 'dgrid' })
  const elev = el('div', { class: 'elev' })
  const img = el('img', { alt: t('detail.elev') })
  img.src = h.imageElevation ? IMG_BASE + encodeURIComponent(h.imageElevation) : ''
  img.onerror = () => { img.alt = t('card.noImage'); img.style.display = 'none' }
  elev.appendChild(img)
  elev.appendChild(el('div', { class: 'cap', text: t('detail.elev') + ' · ' + (h.imageElevation || '–') }))
  dgrid.appendChild(elev)

  const dinfo = el('div', { class: 'dinfo' })
  dinfo.appendChild(el('h2', { text: h.name }))
  dinfo.appendChild(el('div', { class: 'sub', text: h.start + ' → ' + h.end }))
  const facts = el('div', { class: 'facts' })
  facts.appendChild(factBox(t('chip.difficulty'), h.difficulty + ' / 5'))
  facts.appendChild(factBox(t('chip.distance'), h.distance + ' km'))
  facts.appendChild(factBox(t('chip.duration'), fmtTime(h.time)))
  facts.appendChild(factBox(t('detail.speed'), speed(h.distance, h.time[0], h.time[1]).toFixed(2) + ' km/h'))
  dinfo.appendChild(facts)
  if (h.description) dinfo.appendChild(el('div', { class: 'desc', text: h.description }))
  else dinfo.appendChild(el('div', { class: 'form-text', text: t('detail.noDesc') }))
  dgrid.appendChild(dinfo)
  d.appendChild(dgrid)

  const comments = el('div', { class: 'comments' })
  const head = el('div', { class: 'comments-head' })
  head.appendChild(el('h3', { text: t('comments.title') }))
  comments.appendChild(head)
  d.appendChild(comments)

  $('#listView').style.display = 'none'
  d.classList.add('show')
  window.scrollTo(0, 0)

  if (!isReader()) {
    comments.appendChild(el('div', { class: 'empty', text: t('comments.guestHint') }))
    return
  }
  try {
    const list = await getComments(nr)
    state.comments = list
    renderCommentsInto(comments, head, nr, list)
  } catch (e) { showError(e, 'toast.notFound') }
}

function factBox (l, v) {
  const f = el('div', { class: 'fact' })
  f.appendChild(el('div', { class: 'l', text: l }))
  f.appendChild(el('div', { class: 'v', text: v }))
  return f
}

function sortedComments (list) {
  const arr = list.slice()
  const cmp = {
    new: (a, b) => (b.created || '').localeCompare(a.created || ''),
    old: (a, b) => (a.created || '').localeCompare(b.created || ''),
    ratingHigh: (a, b) => b.rating - a.rating,
    ratingLow: (a, b) => a.rating - b.rating
  }[state.commentSort]
  if (cmp) arr.sort(cmp)
  return arr
}

function renderCommentsInto (root, head, hikeNr, list) {
  while (head.children.length > 1) head.removeChild(head.lastChild)
  const wrap = el('div', { class: 'd-flex gap-2 align-items-center' })
  wrap.appendChild(el('span', { class: 'filter-label', text: t('comments.sortLabel') }))
  const sortSel = el('select', { class: 'fselect' })
  for (const [v, k] of [['new', 'comments.sort.new'], ['old', 'comments.sort.old'], ['ratingHigh', 'comments.sort.ratingHigh'], ['ratingLow', 'comments.sort.ratingLow']]) {
    const op = el('option', { value: v, text: t(k) })
    if (state.commentSort === v) op.selected = true
    sortSel.appendChild(op)
  }
  sortSel.addEventListener('change', e => { state.commentSort = e.target.value; rerenderComments(root, head, hikeNr, list) })
  wrap.appendChild(sortSel)
  head.appendChild(wrap)

  rerenderComments(root, head, hikeNr, list)
}

function rerenderComments (root, head, hikeNr, list) {
  while (root.children.length > 1) root.removeChild(root.lastChild)
  const sorted = sortedComments(list)
  if (!sorted.length) root.appendChild(el('div', { class: 'empty', text: t('comments.empty') }))
  else for (const c of sorted) root.appendChild(renderCommentCard(c))
  if (isAdmin()) {
    root.appendChild(el('div', { class: 'empty', text: t('comments.adminNotice') }))
  } else if (isReader()) {
    root.appendChild(renderCommentForm(hikeNr))
  }
}

function renderCommentCard (c) {
  const cmt = el('div', { class: 'cmt' })
  const ch = el('div', { class: 'ch' })
  ch.appendChild(el('h4', { text: c.title }))
  ch.appendChild(el('span', { class: 'stars', text: stars(c.rating) }))
  cmt.appendChild(ch)
  cmt.appendChild(el('p', { text: c.text }))
  const ch2 = el('div', { class: 'ch' })
  const who = c.createdBy ? (c.createdBy.username + ' · ' + c.createdBy.userRole) : '–'
  ch2.appendChild(el('span', { class: 'cby', text: who }))
  if (isAdmin()) ch2.appendChild(el('button', { class: 'btn btn-del btn-sm', type: 'button', text: t('card.delete'), onclick: () => onDeleteComment(c.nr) }))
  cmt.appendChild(ch2)

  const rxRow = el('div', { class: 'reactions', 'aria-label': t('reactions.label') })
  const tok = userToken(getSession().user)
  const counts = getReactions(c.nr)
  for (const e of EMOJIS) {
    const btn = el('button', { class: 'rx', type: 'button', onclick: () => onReact(c.nr, e, btn) })
    if (hasReacted(c.nr, e, tok)) btn.setAttribute('aria-pressed', 'true')
    btn.appendChild(document.createTextNode(e))
    if (counts[e] > 0) btn.appendChild(el('span', { class: 'ct', text: counts[e] }))
    rxRow.appendChild(btn)
  }
  cmt.appendChild(rxRow)
  return cmt
}

function onReact (commentNr, emoji, btn) {
  const tok = userToken(getSession().user)
  toggleReaction(commentNr, emoji, tok)
  const pressed = hasReacted(commentNr, emoji, tok)
  if (pressed) btn.setAttribute('aria-pressed', 'true')
  else btn.removeAttribute('aria-pressed')
  const counts = getReactions(commentNr)
  btn.innerHTML = ''
  btn.appendChild(document.createTextNode(emoji))
  if (counts[emoji] > 0) btn.appendChild(el('span', { class: 'ct', text: counts[emoji] }))
}

function renderCommentForm (hikeNr) {
  const form = el('div', { class: 'cmt', style: 'border-style:dashed' })
  form.appendChild(el('h4', { text: t('comments.formTitle'), style: 'margin-bottom:10px' }))
  form.appendChild(bsField('c_title', 'input', t('comments.fieldTitle')))
  form.appendChild(bsField('c_text', 'textarea', t('comments.fieldText')))
  const fR = bsField('c_rating', 'select', t('comments.fieldRating'), ['', '1', '2', '3', '4', '5'])
  fR.style.maxWidth = '180px'
  form.appendChild(fR)
  form.appendChild(el('button', { class: 'btn btn-pri btn-sm mt-2', type: 'button', text: t('comments.submit'), onclick: () => onAddComment(hikeNr) }))
  return form
}

function bsField (id, kind, label, options) {
  const f = el('div', { class: 'mb-3' })
  f.appendChild(el('label', { class: 'form-label', for: id, text: label }))
  let input
  if (kind === 'textarea') { input = document.createElement('textarea'); input.className = 'form-control' }
  else if (kind === 'select') {
    input = document.createElement('select'); input.className = 'form-select'
    for (const o of options) {
      const op = document.createElement('option')
      op.value = o; op.textContent = o || '…'
      input.appendChild(op)
    }
  } else { input = document.createElement('input'); input.className = 'form-control' }
  input.id = id
  f.appendChild(input)
  f.appendChild(el('div', { class: 'invalid-feedback' }))
  return f
}

function closeDetail () {
  state.openHike = null
  $('#detailView').classList.remove('show')
  $('#listView').style.display = 'block'
}

function setFieldError (input, msg) {
  if (!input) return
  if (msg) {
    input.classList.add('is-invalid')
    const fb = input.parentElement.querySelector('.invalid-feedback')
    if (fb) fb.textContent = msg
  } else {
    input.classList.remove('is-invalid')
  }
}

function clearFormErrors (sel) {
  document.querySelectorAll(sel + ' .is-invalid').forEach(n => n.classList.remove('is-invalid'))
}

async function onAddComment (hikeNr) {
  if (!isReader()) { toast(t('toast.noPerm'), 'err', '401'); return }
  const title = $('#c_title').value.trim()
  const text = $('#c_text').value.trim()
  const rating = parseInt($('#c_rating').value, 10)
  const errors = validateComment({ title, text, rating })
  setFieldError($('#c_title'), errors.title)
  setFieldError($('#c_text'), errors.text)
  setFieldError($('#c_rating'), errors.rating)
  if (Object.keys(errors).length) { toast(t('toast.validation'), 'err', t('toast.validationSub')); return }
  const hike = state.hikes.find(x => x.nr === hikeNr)
  if (!hike) { toast(t('toast.notFound'), 'err', '404'); return }
  const payload = {
    nr: 0, title, text, rating,
    created: new Date().toISOString().slice(0, 19),
    createdBy: { username: getSession().user, userRole: getSession().role },
    hike: stripHike(hike)
  }
  try {
    await addComment(payload)
    toast(t('toast.commentAdded'), 'ok', 'POST 200')
    openDetail(hikeNr)
  } catch (e) { showError(e, 'toast.commentAdded') }
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
  if (!isAdmin()) { toast(t('toast.noPerm'), 'err', '403'); return }
  if (!confirm(t('confirm.delComment'))) return
  try {
    await deleteComment(nr)
    dropComment(nr)
    toast(t('toast.commentDeleted'), 'ok', 'DELETE 200')
    if (state.openHike) openDetail(state.openHike)
  } catch (e) { showError(e, 'toast.commentDeleted') }
}

async function onDeleteHike (nr) {
  if (!isAdmin()) { toast(t('toast.noPerm'), 'err', '403'); return }
  const h = state.hikes.find(x => x.nr === nr)
  if (!h) return
  if (!confirm(t('confirm.delHike', { name: h.name }))) return
  try {
    await deleteHike(nr)
    toast(t('toast.deleted'), 'ok', 'DELETE 200 · ' + h.name)
    if (state.openHike === nr) closeDetail()
    await loadAndRender()
  } catch (e) { showError(e, 'toast.deleted') }
}

function openHikeForm (nr) {
  if (!isAdmin()) { toast(t('toast.noPerm'), 'err', '403'); return }
  state.editingNr = nr || null
  $('#hmTitle').textContent = nr ? t('hikeForm.titleEdit') : t('hikeForm.titleNew')
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
  updateSpeedPill()
  showModal('hikeModal')
}

function updateSpeedPill () {
  const pill = $('#speedPill')
  if (!pill) return
  const dist = parseFloat($('#f_dist').value)
  const h = parseInt($('#f_h').value, 10)
  const m = parseInt($('#f_m').value, 10)
  if (isNaN(dist) || dist <= 0 || isNaN(h) || isNaN(m) || (h === 0 && m === 0)) {
    pill.style.display = 'none'
    return
  }
  const sp = speed(dist, h, m)
  const ok = sp >= 2 && sp <= 4
  pill.style.display = 'inline-block'
  pill.className = 'speed-pill mt-2 ' + (ok ? 'ok' : 'bad')
  pill.textContent = t(ok ? 'speedPill.ok' : 'speedPill.bad', { v: sp.toFixed(2) })
}

async function saveHike () {
  if (!isAdmin()) { toast(t('toast.noPerm'), 'err', '403'); return }
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
    nr: isNaN(nr) ? null : nr, name, description: desc,
    difficulty: isNaN(diff) ? null : diff,
    distance: isNaN(dist) ? null : dist,
    time: [isNaN(h) ? null : h, isNaN(m) ? null : m],
    imageElevation: imageName,
    created: editing ? editing.created : new Date().toISOString().slice(0, 19),
    start, end,
    createdBy: { username: getSession().user, userRole: getSession().role }
  }

  const errors = validateHike(data)
  clearFormErrors('#hikeForm')
  if (errors.nr) setFieldError($('#f_nr'), errors.nr)
  if (errors.name) setFieldError($('#f_name'), errors.name)
  if (errors.description) setFieldError($('#f_desc'), errors.description)
  if (errors.difficulty) setFieldError($('#f_diff'), errors.difficulty)
  if (errors.distance) setFieldError($('#f_dist'), errors.distance)
  if (errors.time) { setFieldError($('#f_h'), errors.time); setFieldError($('#f_m'), errors.time) }
  if (errors.start) setFieldError($('#f_start'), errors.start)
  if (errors.end) setFieldError($('#f_end'), errors.end)
  if (errors.imageElevation) setFieldError($('#f_img'), errors.imageElevation)
  if (Object.keys(errors).length) { toast(t('toast.validation'), 'err', t('toast.validationSub')); return }

  if (!editing && state.hikes.some(x => x.nr === nr)) {
    setFieldError($('#f_nr'), t('toast.dupNr'))
    toast(t('toast.dupNr'), 'err', '400')
    return
  }

  if (file) {
    try { await uploadImage(file); toast(t('toast.imgUploaded'), 'ok', file.name) }
    catch (e) { showError(e, 'toast.imgFailed'); return }
  }

  try {
    if (editing) { await updateHike(data); toast(t('toast.updated'), 'ok', 'PUT 200 · ' + name) }
    else { await createHike(data); toast(t('toast.created'), 'ok', 'POST 200 · ' + name) }
    hideModal('hikeModal')
    await loadAndRender()
    if (state.openHike) openDetail(state.openHike)
  } catch (e) { showError(e, 'toast.created') }
}

async function doLogin () {
  const u = $('#lgUser').value.trim()
  const p = $('#lgPass').value
  const errs = validateLogin(u, p)
  clearFormErrors('#loginModal')
  $('#lgErr').classList.add('d-none')
  if (Object.keys(errs).length) {
    if (errs.user) setFieldError($('#lgUser'), errs.user)
    if (errs.pass) setFieldError($('#lgPass'), errs.pass)
    return
  }
  try {
    const role = await login(u, p)
    $('#lgUser').value = ''
    $('#lgPass').value = ''
    hideModal('loginModal')
    renderSession()
    renderFilterBar()
    await loadAndRender()
    if (state.openHike) openDetail(state.openHike)
    toast(t('toast.loggedIn', { user: u }), 'ok', role + ' · 200 OK')
  } catch (e) {
    $('#lgErr').textContent = e.message
    $('#lgErr').classList.remove('d-none')
  }
}

function doLogout () {
  logout()
  renderSession()
  renderFilterBar()
  toast(t('toast.loggedOut'), 'info')
  if (state.openHike) openDetail(state.openHike)
  renderList()
}

async function loadAndRender (opts) {
  const fromButton = opts && opts.fromButton
  const btn = document.getElementById('reloadBtn')
  state.loading = true
  if (btn) btn.classList.add('spinning')
  if (!fromButton) renderSkeleton()
  try { state.hikes = await getAllHikes() } catch (e) { state.hikes = []; showError(e, 'toast.notFound') }
  state.loading = false
  if (btn) setTimeout(() => btn.classList.remove('spinning'), fromButton ? 350 : 0)
  renderList()
  dismissSplash()
}

function dismissSplash () {
  const s = document.getElementById('splash')
  if (!s || s.dataset.dismissed === '1') return
  s.dataset.dismissed = '1'
  const minTime = 1300
  const wait = Math.max(0, minTime - (Date.now() - (window.__splashStarted || Date.now())))
  setTimeout(() => {
    s.classList.add('gone')
    setTimeout(() => s.remove(), 600)
  }, wait)
}

function wireEvents () {
  $('#lgSubmit').addEventListener('click', doLogin)
  $('#hmSubmit').addEventListener('click', saveHike)
  $('#newBtn').addEventListener('click', () => openHikeForm())
  $('#reloadBtn').addEventListener('click', () => loadAndRender({ fromButton: true }))
  for (const id of ['f_dist', 'f_h', 'f_m']) document.getElementById(id).addEventListener('input', updateSpeedPill)
  document.addEventListener('lang:change', () => {
    applyDomTranslations()
    renderSession(); renderFilterBar(); renderList()
    if (state.openHike) openDetail(state.openHike)
  })
}

applyTheme()
applyDomTranslations()
wireEvents()
renderSession()
renderFilterBar()
setTimeout(dismissSplash, 4000)
loadAndRender()

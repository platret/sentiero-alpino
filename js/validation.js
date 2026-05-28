export function speed (distanceKm, h, m) {
  const hours = (h || 0) + (m || 0) / 60
  if (hours <= 0) return 0
  return distanceKm / hours
}

export function wordCount (s) {
  const t = (s || '').trim()
  if (!t) return 0
  return t.split(/\s+/).length
}

export function validateHike (data) {
  const errors = {}
  if (!Number.isInteger(data.nr) || data.nr < 1000) errors.nr = 'Nr muss ganzzahlig und &ge; 1000 sein.'
  if (!data.name || !data.name.trim()) errors.name = 'Name ist erforderlich.'
  else if (data.name.length > 100) errors.name = 'Name max. 100 Zeichen.'
  if (data.description && wordCount(data.description) < 5) errors.description = 'Falls erfasst, mindestens 5 Wörter.'
  if (!Number.isInteger(data.difficulty) || data.difficulty < 1 || data.difficulty > 5) errors.difficulty = 'Schwierigkeit 1–5.'
  if (!(typeof data.distance === 'number') || isNaN(data.distance) || data.distance <= 0) errors.distance = 'Distanz > 0 erforderlich.'
  const h = data.time && data.time[0]
  const m = data.time && data.time[1]
  if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(m) || m < 0 || m > 59) {
    errors.time = 'Dauer ungültig (0–23 Std, 0–59 Min).'
  } else {
    const sp = speed(data.distance, h, m)
    if (!(sp >= 2 && sp <= 4)) errors.time = 'Geschwindigkeit muss 2–4 km/h sein (aktuell ' + sp.toFixed(2) + ').'
  }
  if (!data.start || !data.start.trim()) errors.start = 'Start ist erforderlich.'
  if (!data.end || !data.end.trim()) errors.end = 'Ziel ist erforderlich.'
  if (!data.imageElevation || !data.imageElevation.trim()) errors.imageElevation = 'Bild ist erforderlich.'
  return errors
}

export function validateComment (data) {
  const errors = {}
  if (!data.title || data.title.length < 10) errors.title = 'Titel min. 10 Zeichen.'
  if (!data.text || data.text.length < 20) errors.text = 'Text min. 20 Zeichen.'
  if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) errors.rating = 'Bewertung 1–5.'
  return errors
}

export function validateLogin (user, pass) {
  const errors = {}
  if (!user || !user.trim()) errors.user = 'Benutzername ist Pflichtfeld.'
  if (!pass) errors.pass = 'Passwort ist Pflichtfeld.'
  return errors
}

const THEME_KEY = 'sentiero.theme'
let current = 'light'

try {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'dark' || saved === 'light') current = saved
  else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) current = 'dark'
} catch (e) {}

export function getTheme () { return current }

export function setTheme (theme) {
  current = theme === 'dark' ? 'dark' : 'light'
  document.documentElement.dataset.theme = current
  try { localStorage.setItem(THEME_KEY, current) } catch (e) {}
  document.dispatchEvent(new CustomEvent('theme:change', { detail: current }))
}

export function toggleTheme () { setTheme(current === 'dark' ? 'light' : 'dark') }

export function applyTheme () { document.documentElement.dataset.theme = current }

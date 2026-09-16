// Light or dark. The page follows the system until the visitor picks one with
// the toggle; the pick is remembered and applied before first paint by the
// inline script in index.html's head, so a returning visitor never sees a flash
// of the other theme. classic.html and 404.html carry the same logic inline,
// under the same storage key, so the choice holds across all three.

export const THEME_KEY = 'theme'

const system = window.matchMedia('(prefers-color-scheme: dark)')

const current = () => document.documentElement.dataset.theme ?? (system.matches ? 'dark' : 'light')

export function initThemeToggle(button) {
  if (!button) return
  const meta = document.querySelector('meta[name="theme-color"]')

  const render = () => {
    const theme = current()
    button.dataset.current = theme
    button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme')
    // The browser chrome on a phone matches the page.
    meta?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())
  }

  button.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem(THEME_KEY, next) } catch { /* private mode */ }
    render()
  })
  system.addEventListener('change', render)

  render()
  button.hidden = false
}

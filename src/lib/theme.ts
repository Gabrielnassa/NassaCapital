export type Theme = 'system' | 'light' | 'dark'
const KEY = 'carteira-tema'

export const storedTheme = (): Theme => {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** Aplica o tema no <html> e guarda a escolha neste aparelho, para abrir já na cor certa. */
export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111110' : '#F7F6F3')
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* sem armazenamento: segue só nesta sessão */
  }
}

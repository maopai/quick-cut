export const THEME_STORAGE_KEY = 'quick-cut-theme'

export function normalizeTheme(theme) {
  return theme === 'light' ? 'light' : 'dark'
}

export function getStoredTheme(storage = globalThis.localStorage) {
  try {
    return normalizeTheme(storage?.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'dark'
  }
}

export function storeTheme(theme, storage = globalThis.localStorage) {
  const normalized = normalizeTheme(theme)
  try {
    storage?.setItem(THEME_STORAGE_KEY, normalized)
  } catch {
    // Keep theme switching available when storage is blocked.
  }
  return normalized
}

export function applyDocumentTheme(theme, root = globalThis.document?.documentElement) {
  const normalized = normalizeTheme(theme)
  if (root) {
    root.dataset.theme = normalized
    root.style.colorScheme = normalized
  }
  return normalized
}

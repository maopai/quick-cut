const THEME_PALETTES = Object.freeze({
  dark: Object.freeze({
    background: '#090c10',
    foreground: '#edf1f6',
  }),
  light: Object.freeze({
    background: '#f5f7fa',
    foreground: '#18202a',
  }),
})

const fs = require('node:fs')
const path = require('node:path')

function normalizeTheme(theme) {
  return theme === 'light' ? 'light' : 'dark'
}

function getThemePalette(theme) {
  return THEME_PALETTES[normalizeTheme(theme)]
}

function getWindowChromeOptions(platform, theme = 'dark') {
  const palette = getThemePalette(theme)
  const options = {
    backgroundColor: palette.background,
    titleBarStyle: platform === 'darwin' ? 'hiddenInset' : 'default',
  }

  if (platform === 'win32') {
    options.autoHideMenuBar = true
    options.titleBarStyle = 'hidden'
    options.titleBarOverlay = {
      color: palette.background,
      symbolColor: palette.foreground,
    }
  }

  return options
}

function readThemePreference(filePath) {
  try {
    const preference = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return normalizeTheme(preference.theme)
  } catch {
    return 'dark'
  }
}

function writeThemePreference(filePath, theme) {
  const normalized = normalizeTheme(theme)
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, `${JSON.stringify({ theme: normalized }, null, 2)}\n`, 'utf8')
    return true
  } catch {
    return false
  }
}

module.exports = {
  getThemePalette,
  getWindowChromeOptions,
  normalizeTheme,
  readThemePreference,
  writeThemePreference,
}

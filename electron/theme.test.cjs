const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  getThemePalette,
  getWindowChromeOptions,
  normalizeTheme,
  readThemePreference,
  writeThemePreference,
} = require('./theme.cjs')

test('normalizes unsupported themes to dark', () => {
  assert.equal(normalizeTheme('light'), 'light')
  assert.equal(normalizeTheme('dark'), 'dark')
  assert.equal(normalizeTheme('system'), 'dark')
  assert.equal(normalizeTheme(undefined), 'dark')
})

test('configures a color-matched Windows title bar overlay', () => {
  assert.deepEqual(getWindowChromeOptions('win32', 'light'), {
    backgroundColor: '#f5f7fa',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f5f7fa',
      symbolColor: '#18202a',
    },
  })

  assert.deepEqual(getWindowChromeOptions('win32', 'dark').titleBarOverlay, {
    color: '#090c10',
    symbolColor: '#edf1f6',
  })
})

test('keeps the native macOS inset title bar', () => {
  assert.deepEqual(getWindowChromeOptions('darwin', 'dark'), {
    backgroundColor: '#090c10',
    titleBarStyle: 'hiddenInset',
  })
  assert.deepEqual(getThemePalette('light'), {
    background: '#f5f7fa',
    foreground: '#18202a',
  })
})

test('persists a normalized theme preference for the next launch', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'quick-cut-theme-'))
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const preferencePath = path.join(directory, 'theme.json')

  assert.equal(readThemePreference(preferencePath), 'dark')
  assert.equal(writeThemePreference(preferencePath, 'light'), true)
  assert.equal(readThemePreference(preferencePath), 'light')
  assert.equal(writeThemePreference(preferencePath, 'unexpected'), true)
  assert.equal(readThemePreference(preferencePath), 'dark')
})

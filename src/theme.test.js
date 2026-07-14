import test from 'node:test'
import assert from 'node:assert/strict'
import { applyDocumentTheme, getStoredTheme, storeTheme, THEME_STORAGE_KEY } from './theme.js'

test('reads a persisted light theme and defaults invalid values to dark', () => {
  assert.equal(getStoredTheme({ getItem: () => 'light' }), 'light')
  assert.equal(getStoredTheme({ getItem: () => 'system' }), 'dark')
  assert.equal(getStoredTheme({ getItem: () => { throw new Error('blocked') } }), 'dark')
})

test('stores only normalized theme values', () => {
  const values = new Map()
  const storage = { setItem: (key, value) => values.set(key, value) }
  assert.equal(storeTheme('light', storage), 'light')
  assert.equal(values.get(THEME_STORAGE_KEY), 'light')
  assert.equal(storeTheme('unexpected', storage), 'dark')
  assert.equal(values.get(THEME_STORAGE_KEY), 'dark')
})

test('applies theme data and color scheme to the document root', () => {
  const root = { dataset: {}, style: {} }
  assert.equal(applyDocumentTheme('light', root), 'light')
  assert.deepEqual(root, {
    dataset: { theme: 'light' },
    style: { colorScheme: 'light' },
  })
})

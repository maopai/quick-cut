const assert = require('node:assert/strict')
const test = require('node:test')
const { parseByteRange, videoMimeTypes } = require('./preview.cjs')

test('parses normal, open-ended and suffix byte ranges', () => {
  assert.deepEqual(parseByteRange('bytes=10-19', 100), { start: 10, end: 19 })
  assert.deepEqual(parseByteRange('bytes=90-', 100), { start: 90, end: 99 })
  assert.deepEqual(parseByteRange('bytes=-12', 100), { start: 88, end: 99 })
})

test('rejects unsatisfiable video byte ranges', () => {
  assert.equal(parseByteRange('bytes=100-120', 100), null)
  assert.equal(parseByteRange('not-a-range', 100), null)
})

test('provides media types for common preview containers', () => {
  assert.equal(videoMimeTypes['.mp4'], 'video/mp4')
  assert.equal(videoMimeTypes['.webm'], 'video/webm')
})

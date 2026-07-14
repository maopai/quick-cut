import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatTime, getTimeParts, normalizeTimePart, parseTime, replaceTimePart, segmentDuration, validateSegment } from './time.js'

describe('time helpers', () => {
  it('parses seconds, MM:SS and HH:MM:SS.mmm', () => {
    assert.equal(parseTime('12.5'), 12.5)
    assert.equal(parseTime('02:03.250'), 123.25)
    assert.equal(parseTime('01:02:03.500'), 3723.5)
  })

  it('rejects malformed time values', () => {
    assert.equal(Number.isNaN(parseTime('1::2')), true)
    assert.equal(Number.isNaN(parseTime('hello')), true)
  })

  it('formats time with millisecond precision', () => {
    assert.equal(formatTime(3723.5, true), '01:02:03.500')
    assert.equal(formatTime(62.1), '00:01:02')
  })

  it('normalizes individual hour, minute and second fields', () => {
    assert.equal(normalizeTimePart('1'), '01')
    assert.equal(normalizeTimePart('09'), '09')
    assert.equal(normalizeTimePart('60'), '59')
    assert.equal(normalizeTimePart('99'), '59')
    assert.equal(replaceTimePart('00:02:03', 1, '7'), '00:7:03')
    assert.equal(replaceTimePart('00:02:03', 0, '123'), '12:02:03')
    assert.deepEqual(getTimeParts('01:02:03'), ['01', '02', '03'])
  })

  it('validates segment bounds and duration', () => {
    assert.equal(validateSegment({ start: '00:00:01', end: '00:00:02' }, 10), null)
    assert.match(validateSegment({ start: '00:00:03', end: '00:00:02' }, 10), /晚于/)
    assert.match(validateSegment({ start: '00:00:03', end: '00:00:12' }, 10), /超出/)
    assert.match(validateSegment({ start: '3', end: '12' }, 10), /不完整/)
    assert.match(validateSegment({ start: '60:00:00', end: '00:00:12' }, 100), /小时必须/)
    assert.match(validateSegment({ start: '00:60:00', end: '00:00:12' }, 100), /分钟必须/)
    assert.match(validateSegment({ start: '00:00:01', end: '00:00:60' }, 100), /秒必须/)
    assert.equal(segmentDuration({ start: '1.25', end: '2.5' }), 1.25)
  })
})

export function parseTime(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  const text = String(value ?? '').trim()
  if (!text) return NaN
  const parts = text.split(':')
  if (parts.some((part) => part === '' || Number.isNaN(Number(part)))) return NaN
  if (parts.length === 1) return Number(parts[0])
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1])
  if (parts.length === 3) return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2])
  return NaN
}

export function formatTime(totalSeconds, milliseconds = false) {
  if (!Number.isFinite(totalSeconds)) return milliseconds ? '00:00:00.000' : '00:00:00'
  const safe = Math.max(0, totalSeconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = Math.floor(safe % 60)
  const millis = Math.round((safe - Math.floor(safe)) * 1000)
  const base = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
  return milliseconds ? `${base}.${String(millis).padStart(3, '0')}` : base
}

export function getTimeParts(value) {
  const parts = String(value ?? '').split(':')
  return parts.length === 3 ? parts : ['', '', '']
}

export function replaceTimePart(value, index, nextPart) {
  const parts = getTimeParts(value)
  parts[index] = String(nextPart ?? '').replace(/\D/g, '').slice(0, 2)
  return parts.join(':')
}

export function normalizeTimePart(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return String(Math.min(Number(digits), 59)).padStart(2, '0')
}

function validateTimeValue(value, label) {
  const parts = getTimeParts(value)
  if (parts.some((part) => !/^\d+$/.test(part))) return `${label}时间不完整，请填写时、分、秒`
  if (parts.some((part) => !/^\d{2}$/.test(part))) {
    return `${label}请使用两位数字，例如 01:05:09`
  }
  if (Number(parts[0]) > 59) return `${label}小时必须在 00–59 之间`
  if (Number(parts[1]) > 59) return `${label}分钟必须在 00–59 之间`
  if (Number(parts[2]) > 59) return `${label}秒必须在 00–59 之间`
  return null
}

export function validateSegment(segment, duration) {
  const startError = validateTimeValue(segment.start, '起点')
  if (startError) return startError
  const endError = validateTimeValue(segment.end, '终点')
  if (endError) return endError
  const start = parseTime(segment.start)
  const end = parseTime(segment.end)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '请输入有效时间，例如 00:01:25'
  if (start < 0) return '起点不能小于 0'
  if (end <= start) return '终点必须晚于起点'
  if (Number.isFinite(duration) && end > duration + 0.001) return '终点超出视频时长'
  return null
}

export function segmentDuration(segment) {
  const start = parseTime(segment.start)
  const end = parseTime(segment.end)
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0
}

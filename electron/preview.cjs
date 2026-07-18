const fs = require('node:fs')
const path = require('node:path')
const { Readable } = require('node:stream')

const videoMimeTypes = {
  '.avi': 'video/x-msvideo',
  '.m2ts': 'video/mp2t',
  '.m4v': 'video/x-m4v',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.mts': 'video/mp2t',
  '.webm': 'video/webm',
}

function parseByteRange(header, size) {
  const match = String(header || '').match(/^bytes=(\d*)-(\d*)$/)
  if (!match || size <= 0) return null
  let start = match[1] ? Number(match[1]) : null
  let end = match[2] ? Number(match[2]) : null

  if (start === null && end !== null) {
    start = Math.max(0, size - end)
    end = size - 1
  } else {
    start ??= 0
    end = Math.min(end ?? size - 1, size - 1)
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) return null
  return { start, end }
}

function servePreviewVideo(request, filePath) {
  const stat = fs.statSync(filePath)
  const rangeHeader = request.headers.get('range')
  const range = parseByteRange(rangeHeader, stat.size)
  const headers = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Type': videoMimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
  }

  if (rangeHeader && !range) {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${stat.size}` } })
  }

  if (range) {
    const stream = fs.createReadStream(filePath, range)
    return new Response(Readable.toWeb(stream), {
      status: 206,
      headers: {
        ...headers,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
      },
    })
  }

  return new Response(Readable.toWeb(fs.createReadStream(filePath)), {
    status: 200,
    headers: { ...headers, 'Content-Length': String(stat.size) },
  })
}

module.exports = { parseByteRange, servePreviewVideo, videoMimeTypes }

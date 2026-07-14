const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ffmpegStatic = require('ffmpeg-static')
const ffprobeStatic = require('@ffprobe-installer/ffprobe')

let activeExport = null
let cancelRequested = false
let encoderCapabilityCache = null

function unpacked(binaryPath) {
  return binaryPath.replace('app.asar', 'app.asar.unpacked')
}

const ffmpegPath = unpacked(ffmpegStatic)
const ffprobePath = unpacked(ffprobeStatic.path)

function run(binary, args, { collectStdout = true, onStdout } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true })
    const stdout = []
    const stderr = []

    child.stdout.on('data', (chunk) => {
      if (collectStdout) stdout.push(chunk)
      onStdout?.(chunk.toString())
    })
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout))
      } else {
        const details = Buffer.concat(stderr).toString().trim().split('\n').slice(-12).join('\n')
        const reason = signal ? `操作已终止（${signal}）` : `FFmpeg 退出码 ${code}`
        reject(new Error(details || reason))
      }
    })
  })
}

async function getMetadata(filePath) {
  const result = await run(ffprobePath, [
    '-v', 'error',
    '-show_format',
    '-show_streams',
    '-of', 'json',
    filePath,
  ])
  const data = JSON.parse(result.toString())
  const video = data.streams.find((stream) => stream.codec_type === 'video')
  const audio = data.streams.find((stream) => stream.codec_type === 'audio')
  if (!video) throw new Error('所选文件中没有可识别的视频轨道')

  const parseRate = (rate) => {
    if (!rate || rate === '0/0') return 0
    const [a, b] = rate.split('/').map(Number)
    return b ? a / b : a
  }

  return {
    path: filePath,
    name: path.basename(filePath),
    duration: Number(data.format.duration || video.duration || 0),
    size: Number(data.format.size || fs.statSync(filePath).size),
    format: data.format.format_long_name || data.format.format_name,
    extension: path.extname(filePath),
    video: {
      codec: video.codec_name,
      codecLong: video.codec_long_name,
      width: video.width,
      height: video.height,
      fps: parseRate(video.avg_frame_rate || video.r_frame_rate),
      bitRate: Number(video.bit_rate || data.format.bit_rate || 0),
      pixelFormat: video.pix_fmt,
    },
    audio: audio ? {
      codec: audio.codec_name,
      codecLong: audio.codec_long_name,
      sampleRate: Number(audio.sample_rate || 0),
      channels: audio.channels,
      bitRate: Number(audio.bit_rate || 0),
    } : null,
  }
}

function buildFrameExtractionArgs(filePath, seconds) {
  return [
    '-hide_banner', '-loglevel', 'error',
    '-ss', Math.max(0, Number(seconds)).toFixed(3),
    '-i', filePath,
    '-frames:v', '1',
    '-vf', "scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    'pipe:1',
  ]
}

async function extractFrame(filePath, seconds) {
  const result = await run(ffmpegPath, buildFrameExtractionArgs(filePath, seconds))
  return `data:image/jpeg;base64,${result.toString('base64')}`
}

const videoEncoders = {
  h264: 'libx264',
  hevc: 'libx265',
  vp9: 'libvpx-vp9',
  vp8: 'libvpx',
  av1: 'libaom-av1',
  mpeg4: 'mpeg4',
  prores: 'prores_ks',
  mjpeg: 'mjpeg',
  theora: 'libtheora',
}

const hardwareEncoderMaps = {
  apple: {
    h264: 'h264_videotoolbox',
    hevc: 'hevc_videotoolbox',
    prores: 'prores_videotoolbox',
  },
  nvidia: {
    h264: 'h264_nvenc',
    hevc: 'hevc_nvenc',
    av1: 'av1_nvenc',
  },
  amd: {
    h264: 'h264_amf',
    hevc: 'hevc_amf',
    av1: 'av1_amf',
  },
  intel: {
    h264: 'h264_qsv',
    hevc: 'hevc_qsv',
    av1: 'av1_qsv',
    vp9: 'vp9_qsv',
  },
}

const engineLabels = {
  apple: 'Apple VideoToolbox',
  nvidia: 'NVIDIA NVENC',
  amd: 'AMD AMF',
  intel: 'Intel Quick Sync',
  cpu: 'CPU 软件编码',
  copy: '原始码流复制',
}

const audioEncoders = {
  aac: 'aac',
  mp3: 'libmp3lame',
  opus: 'libopus',
  vorbis: 'libvorbis',
  flac: 'flac',
  alac: 'alac',
}

function encoderFor(codec, map) {
  if (!codec) return null
  if (map[codec]) return map[codec]
  if (codec.startsWith('pcm_')) return codec
  return codec
}

async function getEncoderCapabilities() {
  if (encoderCapabilityCache) return encoderCapabilityCache
  const output = await run(ffmpegPath, ['-hide_banner', '-encoders'])
  const encoders = output.toString().split(/\r?\n/).map((line) => {
    const match = line.trim().match(/^[A-Z\.]{6}\s+(\S+)/)
    return match?.[1]
  }).filter(Boolean)
  const supported = new Set(encoders)
  const vendors = Object.fromEntries(Object.entries(hardwareEncoderMaps).map(([vendor, map]) => [
    vendor,
    Object.fromEntries(Object.entries(map).map(([codec, encoder]) => [codec, supported.has(encoder)])),
  ]))
  encoderCapabilityCache = {
    platform: process.platform,
    arch: process.arch,
    vendors,
    encoders,
  }
  return encoderCapabilityCache
}

function getEncoderCandidates(codec, preference, capabilities) {
  const available = new Set(capabilities.encoders)
  const cpu = { vendor: 'cpu', encoder: encoderFor(codec, videoEncoders), label: engineLabels.cpu }
  const platformOrder = process.platform === 'darwin'
    ? ['apple']
    : ['nvidia', 'amd', 'intel']
  const order = preference && preference !== 'auto' && preference !== 'cpu'
    ? [preference]
    : preference === 'cpu' ? [] : platformOrder
  const candidates = order.map((vendor) => {
    const encoder = hardwareEncoderMaps[vendor]?.[codec]
    return encoder && available.has(encoder) ? { vendor, encoder, label: engineLabels[vendor] } : null
  }).filter(Boolean)
  return [...candidates, cpu]
}

function hardwarePixelFormat(pixelFormat, codec) {
  const tenBit = /10|p010/.test(pixelFormat || '')
  if (tenBit && ['hevc', 'av1', 'vp9'].includes(codec)) return 'p010le'
  return 'yuv420p'
}

const qualityValues = {
  high: { cpu: 18, nvidia: 18, amd: 18, intel: 18, apple: 85 },
  balanced: { cpu: 23, nvidia: 23, amd: 23, intel: 23, apple: 65 },
  compact: { cpu: 28, nvidia: 28, amd: 28, intel: 28, apple: 45 },
}

const resolutionLimits = {
  '2160p': [3840, 2160],
  '1080p': [1920, 1080],
  '720p': [1280, 720],
}

function appendQualityOptions(args, candidate, metadata, quality = {}) {
  const profile = quality.profile || 'source'
  if (profile === 'source' || profile === 'custom') {
    const customBitRate = Math.max(0.5, Math.min(200, Number(quality.customVideoBitrate) || 8)) * 1_000_000
    const bitRate = profile === 'custom' ? customBitRate : metadata.video.bitRate
    if (bitRate > 0) args.push('-b:v', String(Math.round(bitRate)))
    return
  }

  const value = qualityValues[profile]?.[candidate.vendor] ?? qualityValues.balanced[candidate.vendor]
  if (candidate.vendor === 'apple') {
    args.push('-q:v', String(value))
  } else if (candidate.vendor === 'nvidia') {
    args.push('-rc', 'vbr', '-cq', String(value), '-b:v', '0')
  } else if (candidate.vendor === 'amd') {
    args.push('-rc', 'cqp', '-qp_i', String(value), '-qp_p', String(value))
  } else if (candidate.vendor === 'intel') {
    args.push('-global_quality', String(value))
  } else if (['libx264', 'libx265', 'libvpx', 'libvpx-vp9', 'libaom-av1'].includes(candidate.encoder)) {
    args.push('-crf', String(value))
    if (['libvpx', 'libvpx-vp9', 'libaom-av1'].includes(candidate.encoder)) args.push('-b:v', '0')
  } else {
    args.push('-q:v', String(Math.max(2, Math.round(value / 4))))
  }
}

function buildVideoTransforms(quality = {}) {
  const transforms = []
  const dimensions = resolutionLimits[quality.resolution]
  if (dimensions) {
    const [width, height] = dimensions
    transforms.push(`scale=w='min(iw,${width})':h='min(ih,${height})':force_original_aspect_ratio=decrease:force_divisible_by=2`)
  }
  if (quality.fps && quality.fps !== 'source') transforms.push(`fps=${Number(quality.fps)}`)
  return transforms
}

function appendEncoderOptions(args, candidate, metadata, quality) {
  const { encoder, vendor } = candidate
  args.push('-c:v', encoder)
  if (vendor === 'cpu' && ['libx264', 'libx265'].includes(encoder)) args.push('-preset', 'medium')
  if (vendor === 'nvidia') args.push('-preset', 'p5')
  if (vendor === 'amd') args.push('-quality', 'balanced')
  if (vendor === 'intel') args.push('-preset', 'medium')
  if (vendor === 'apple') args.push('-realtime', 'false')
  appendQualityOptions(args, candidate, metadata, quality)
  const pixelFormat = vendor === 'cpu'
    ? metadata.video.pixelFormat
    : hardwarePixelFormat(metadata.video.pixelFormat, metadata.video.codec)
  if (pixelFormat) args.push('-pix_fmt', pixelFormat)
}

function buildExportArgs({ sourcePath, outputPath, segments, metadata, quality }, candidate) {
  const hasAudio = Boolean(metadata.audio)
  const filters = []
  const concatInputs = []

  segments.forEach((segment, index) => {
    const start = Number(segment.start).toFixed(3)
    const end = Number(segment.end).toFixed(3)
    filters.push(`[0:v:0]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${index}]`)
    concatInputs.push(`[v${index}]`)
    if (hasAudio) {
      filters.push(`[0:a:0]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`)
      concatInputs.push(`[a${index}]`)
    }
  })

  const videoTransforms = buildVideoTransforms(quality)
  const concatVideoOutput = videoTransforms.length ? '[vconcat]' : '[vout]'
  const outputs = hasAudio ? `${concatVideoOutput}[aout]` : concatVideoOutput
  filters.push(`${concatInputs.join('')}concat=n=${segments.length}:v=1:a=${hasAudio ? 1 : 0}${outputs}`)
  if (videoTransforms.length) filters.push(`[vconcat]${videoTransforms.join(',')}[vout]`)

  const selected = candidate || { vendor: 'cpu', encoder: encoderFor(metadata.video.codec, videoEncoders), label: engineLabels.cpu }
  const args = [
    '-hide_banner', '-y',
    '-i', sourcePath,
    '-filter_complex', filters.join(';'),
    '-map', '[vout]',
  ]
  if (hasAudio) args.push('-map', '[aout]')
  appendEncoderOptions(args, selected, metadata, quality)

  if (hasAudio) {
    args.push('-c:a', encoderFor(metadata.audio.codec, audioEncoders))
    const audioBitRate = quality?.audioBitrate && quality.audioBitrate !== 'source'
      ? Number(quality.audioBitrate) * 1_000
      : metadata.audio.bitRate
    if (audioBitRate > 0) args.push('-b:a', String(Math.round(audioBitRate)))
    if (metadata.audio.sampleRate > 0) args.push('-ar', String(metadata.audio.sampleRate))
  }

  if (['.mp4', '.mov', '.m4v'].includes(path.extname(outputPath).toLowerCase())) {
    args.push('-movflags', '+faststart')
  }

  args.push('-progress', 'pipe:1', '-nostats', outputPath)
  return args
}

function escapeConcatPath(filePath) {
  return filePath.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")
}

function createConcatFile(sourcePath, segments) {
  const concatPath = path.join(os.tmpdir(), `framecut-${crypto.randomUUID()}.ffconcat`)
  const lines = ['ffconcat version 1.0']
  if (Array.isArray(sourcePath)) {
    for (const filePath of sourcePath) lines.push(`file '${escapeConcatPath(filePath)}'`)
  } else {
    const escaped = escapeConcatPath(sourcePath)
    for (const segment of segments) {
      lines.push(`file '${escaped}'`)
      lines.push(`inpoint ${Number(segment.start).toFixed(3)}`)
      lines.push(`outpoint ${Number(segment.end).toFixed(3)}`)
    }
  }
  fs.writeFileSync(concatPath, `${lines.join('\n')}\n`, 'utf8')
  return concatPath
}

function buildFastSegmentArgs({ sourcePath }, segment, outputPath) {
  const args = [
    '-hide_banner', '-y',
    '-ss', Number(segment.start).toFixed(3),
    '-i', sourcePath,
    '-t', Number(segment.end - segment.start).toFixed(3),
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c', 'copy',
    '-avoid_negative_ts', 'make_zero',
  ]
  args.push('-progress', 'pipe:1', '-nostats', outputPath)
  return args
}

function buildFastExportArgs({ outputPath }, concatPath) {
  const args = [
    '-hide_banner', '-y',
    '-f', 'concat', '-safe', '0',
    '-i', concatPath,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-c', 'copy',
    '-avoid_negative_ts', 'make_zero',
  ]
  if (['.mp4', '.mov', '.m4v'].includes(path.extname(outputPath).toLowerCase())) {
    args.push('-movflags', '+faststart')
  }
  args.push('-progress', 'pipe:1', '-nostats', outputPath)
  return args
}

function runExportAttempt(args, totalDuration, onProgress, engine) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true })
    activeExport = child
    let stdoutBuffer = ''
    const stderr = []

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString()
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() || ''
      for (const line of lines) {
        const [key, value] = line.split('=')
        if (key === 'out_time_us') {
          const progress = Math.min(99.5, (Number(value) / 1_000_000 / totalDuration) * 100)
          onProgress?.({ progress, status: 'encoding', engine })
        }
      }
    })
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', (error) => {
      activeExport = null
      reject(error)
    })
    child.on('close', (code, signal) => {
      activeExport = null
      if (code === 0) return resolve()
      const details = Buffer.concat(stderr).toString().trim().split('\n').slice(-18).join('\n')
      const error = new Error(signal || cancelRequested ? '导出已取消' : details || `FFmpeg 退出码 ${code}`)
      error.cancelled = Boolean(signal || cancelRequested)
      reject(error)
    })
  })
}

async function exportVideo(payload, onProgress) {
  if (activeExport) throw new Error('已有导出任务正在运行')
  cancelRequested = false
  const totalDuration = payload.segments.reduce((sum, item) => sum + item.end - item.start, 0)
  if (payload.mode === 'fast') {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'framecut-fast-'))
    const extension = path.extname(payload.sourcePath) || '.mkv'
    const tempSegments = payload.segments.map((_, index) => path.join(tempDirectory, `segment-${String(index).padStart(4, '0')}${extension}`))
    let concatPath = null
    try {
      onProgress?.({ progress: 0, status: 'encoding', engine: engineLabels.copy })
      for (let index = 0; index < payload.segments.length; index += 1) {
        const segment = payload.segments[index]
        const segmentDuration = segment.end - segment.start
        await runExportAttempt(
          buildFastSegmentArgs(payload, segment, tempSegments[index]),
          segmentDuration,
          (event) => onProgress?.({ ...event, progress: ((index + event.progress / 100) / (payload.segments.length + 1)) * 100 }),
          engineLabels.copy,
        )
      }
      concatPath = createConcatFile(tempSegments)
      await runExportAttempt(
        buildFastExportArgs(payload, concatPath),
        totalDuration,
        (event) => onProgress?.({ ...event, progress: ((payload.segments.length + event.progress / 100) / (payload.segments.length + 1)) * 100 }),
        engineLabels.copy,
      )
      onProgress?.({ progress: 100, status: 'done', engine: engineLabels.copy })
      return { outputPath: payload.outputPath, engine: engineLabels.copy, mode: 'fast' }
    } catch (error) {
      try { fs.rmSync(payload.outputPath, { force: true }) } catch {}
      throw error
    } finally {
      if (concatPath) try { fs.rmSync(concatPath, { force: true }) } catch {}
      try { fs.rmSync(tempDirectory, { recursive: true, force: true }) } catch {}
    }
  }

  const capabilities = await getEncoderCapabilities()
  const candidates = getEncoderCandidates(metadataCodec(payload), payload.acceleration || 'auto', capabilities)
  let firstHardwareError = null
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    const fallback = index > 0
    onProgress?.({ progress: 0, status: fallback ? 'fallback' : 'encoding', engine: candidate.label })
    try {
      await runExportAttempt(buildExportArgs(payload, candidate), totalDuration, onProgress, candidate.label)
      onProgress?.({ progress: 100, status: 'done', engine: candidate.label })
      return { outputPath: payload.outputPath, engine: candidate.label, mode: 'accurate', fallback }
    } catch (error) {
      try { fs.rmSync(payload.outputPath, { force: true }) } catch {}
      if (error.cancelled) throw error
      if (candidate.vendor === 'cpu') throw error
      firstHardwareError ||= error
      if (index === candidates.length - 1) throw firstHardwareError
    }
  }
  throw firstHardwareError || new Error('没有可用的视频编码器')
}

function metadataCodec(payload) {
  return payload.metadata?.video?.codec
}

function cancelExport() {
  if (!activeExport) return false
  cancelRequested = true
  if (process.platform === 'win32') {
    activeExport.kill()
  } else {
    activeExport.kill('SIGTERM')
  }
  return true
}

module.exports = {
  getMetadata,
  extractFrame,
  buildFrameExtractionArgs,
  getEncoderCapabilities,
  getEncoderCandidates,
  exportVideo,
  cancelExport,
  buildExportArgs,
  buildFastExportArgs,
  buildFastSegmentArgs,
  createConcatFile,
  hardwareEncoderMaps,
  buildVideoTransforms,
  appendQualityOptions,
}

const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const {
  buildExportArgs,
  buildFrameExtractionArgs,
  buildFastExportArgs,
  createConcatFile,
  getEncoderCandidates,
  getDisplayAspectRatio,
} = require('./ffmpeg.cjs')

const metadata = {
  video: { codec: 'h264', bitRate: 2_000_000, pixelFormat: 'yuv420p' },
  audio: { codec: 'aac', bitRate: 128_000, sampleRate: 48_000 },
}

test('selects requested hardware encoder and keeps CPU fallback', () => {
  const candidates = getEncoderCandidates('h264', 'nvidia', { encoders: ['h264_nvenc'] })
  assert.deepEqual(candidates.map((item) => item.encoder), ['h264_nvenc', 'libx264'])
})

test('builds frame-accurate hardware encoding arguments', () => {
  const args = buildExportArgs({
    sourcePath: '/tmp/source.mp4',
    outputPath: '/tmp/output.mp4',
    segments: [{ start: 1, end: 3 }, { start: 5, end: 7 }],
    metadata,
  }, { vendor: 'nvidia', encoder: 'h264_nvenc', label: 'NVIDIA NVENC' })
  assert.equal(args[args.indexOf('-c:v') + 1], 'h264_nvenc')
  assert.equal(args[args.indexOf('-preset') + 1], 'p5')
  assert.match(args[args.indexOf('-filter_complex') + 1], /concat=n=2:v=1:a=1/)
})

test('maps quality, resolution, frame rate and audio options', () => {
  const args = buildExportArgs({
    sourcePath: '/tmp/source.mp4',
    outputPath: '/tmp/output.mp4',
    segments: [{ start: 1, end: 3 }],
    metadata,
    quality: { profile: 'high', resolution: '1080p', fps: '30', audioBitrate: '192' },
  }, { vendor: 'nvidia', encoder: 'h264_nvenc', label: 'NVIDIA NVENC' })
  assert.equal(args[args.indexOf('-rc') + 1], 'vbr')
  assert.equal(args[args.indexOf('-cq') + 1], '18')
  assert.equal(args[args.indexOf('-b:a') + 1], '192000')
  assert.match(args[args.indexOf('-filter_complex') + 1], /scale=.*1920.*1080.*fps=30/)
})

test('extracts preview frames inside 1080p bounds without upscaling', () => {
  const args = buildFrameExtractionArgs('/tmp/source.mp4', 3.25)
  assert.equal(args[args.indexOf('-ss') + 1], '3.250')
  assert.equal(
    args[args.indexOf('-vf') + 1],
    "scale=w='max(2,trunc(if(gte(sar,1),iw,iw*sar)/2)*2)':h='max(2,trunc(if(gte(sar,1),ih/sar,ih)/2)*2)':eval=init,setsar=1,scale=w='min(iw,1920)':h='min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2",
  )
})

test('uses display aspect ratio instead of coded pixel dimensions', () => {
  assert.equal(getDisplayAspectRatio({ width: 1440, height: 360, sample_aspect_ratio: '4:9' }), 16 / 9)
  assert.equal(getDisplayAspectRatio({ width: 1920, height: 1080, display_aspect_ratio: '16:9', side_data_list: [{ rotation: -90 }] }), 9 / 16)
})

test('uses an explicit custom video bitrate', () => {
  const args = buildExportArgs({
    sourcePath: '/tmp/source.mp4',
    outputPath: '/tmp/output.mp4',
    segments: [{ start: 0, end: 2 }],
    metadata,
    quality: { profile: 'custom', customVideoBitrate: '12.5' },
  }, { vendor: 'cpu', encoder: 'libx264', label: 'CPU' })
  assert.equal(args[args.indexOf('-b:v') + 1], '12500000')
})

test('builds stream-copy arguments for fast mode', () => {
  const args = buildFastExportArgs({ outputPath: '/tmp/output.mp4' }, '/tmp/list.ffconcat')
  assert.equal(args[args.indexOf('-c') + 1], 'copy')
  assert.equal(args[args.indexOf('-f') + 1], 'concat')
})

test('writes a concat list with every requested segment', () => {
  const concatPath = createConcatFile('/tmp/source.mp4', [{ start: 2, end: 4 }, { start: 8, end: 9 }])
  try {
    const content = fs.readFileSync(concatPath, 'utf8')
    assert.match(content, /inpoint 2\.000/)
    assert.match(content, /outpoint 9\.000/)
    assert.equal((content.match(/file '/g) || []).length, 2)
  } finally {
    fs.rmSync(concatPath, { force: true })
  }
})

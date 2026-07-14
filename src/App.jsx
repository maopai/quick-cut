import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cpu,
  Film,
  FolderOpen,
  Gauge,
  Image as ImageIcon,
  LoaderCircle,
  Moon,
  MonitorUp,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Video,
  X,
  Zap,
} from 'lucide-react'
import { formatTime, getTimeParts, normalizeTimePart, parseTime, replaceTimePart, segmentDuration, validateSegment } from './time'
import { applyDocumentTheme, storeTheme } from './theme'

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`
const blankSegment = () => ({ id: makeId(), start: '', end: '', startFrame: null, endFrame: null, loading: '' })

const demoMode = new URLSearchParams(window.location.search).has('demo')
const demoMetadata = {
  path: '/Users/demo/Travel_Film_4K.mp4',
  name: 'Travel_Film_4K.mp4',
  duration: 754.84,
  size: 968_622_080,
  format: 'QuickTime / MOV',
  extension: '.mp4',
  video: { codec: 'h264', codecLong: 'H.264 / AVC', width: 3840, height: 2160, fps: 29.97, bitRate: 9_800_000, pixelFormat: 'yuv420p' },
  audio: { codec: 'aac', codecLong: 'AAC', sampleRate: 48_000, channels: 2, bitRate: 192_000 },
}

function demoFrame(label, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="300"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${hue} 65% 28%)"/><stop offset="1" stop-color="hsl(${hue + 48} 55% 12%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="390" cy="80" r="55" fill="rgba(255,255,255,.12)"/><path d="M0 230 L130 120 L220 210 L315 130 L520 260 V300 H0Z" fill="rgba(255,255,255,.16)"/><text x="24" y="268" font-family="Arial" font-size="24" fill="white" opacity=".9">${label}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const demoSegments = [
  { id: makeId(), start: '00:00:12', end: '00:00:28', startFrame: demoFrame('00:00:12', 198), endFrame: demoFrame('00:00:28', 218), loading: '' },
  { id: makeId(), start: '00:02:04', end: '00:02:18', startFrame: demoFrame('00:02:04', 20), endFrame: demoFrame('00:02:18', 40), loading: '' },
  { id: makeId(), start: '00:07:31', end: '00:07:47', startFrame: demoFrame('00:07:31', 272), endFrame: demoFrame('00:07:47', 292), loading: '' },
]

const demoCapabilities = {
  platform: 'darwin',
  arch: 'arm64',
  vendors: {
    apple: { h264: true, hevc: true, prores: true },
    nvidia: { h264: false, hevc: false, av1: false },
    amd: { h264: false, hevc: false, av1: false },
    intel: { h264: false, hevc: false, av1: false, vp9: false },
  },
}

const demoOutput = { directory: '/Users/demo', fileName: 'Travel_Film_4K_new.mp4' }

const engineOptions = [
  { id: 'auto', label: '自动选择', detail: '优先硬件，失败回退 CPU' },
  { id: 'apple', label: 'Apple', detail: 'VideoToolbox' },
  { id: 'nvidia', label: 'NVIDIA', detail: 'NVENC' },
  { id: 'amd', label: 'AMD', detail: 'AMF' },
  { id: 'intel', label: 'Intel', detail: 'Quick Sync' },
  { id: 'cpu', label: 'CPU', detail: '软件编码' },
]

const qualityProfiles = [
  { id: 'source', label: '跟随源参数', detail: '使用源视频目标码率' },
  { id: 'high', label: '高画质', detail: '优先保留画面细节' },
  { id: 'balanced', label: '均衡', detail: '质量与体积平衡' },
  { id: 'compact', label: '小体积', detail: '适合快速分享' },
  { id: 'custom', label: '自定义', detail: '指定视频码率' },
]

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 2 : 0)} ${units[index]}`
}

function MetadataItem({ label, value }) {
  return (
    <div className="metadata-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function FramePreview({ image, label, loading, aspectRatio }) {
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0
    ? Math.min(4, Math.max(0.25, aspectRatio))
    : 16 / 9

  return (
    <div className={`frame-preview ${image ? 'has-image' : ''}`} style={{ '--video-aspect-ratio': safeAspectRatio }}>
      {image ? <img src={image} alt={`${label}预览帧`} /> : (
        <div className="frame-empty">
          {loading ? <LoaderCircle className="spin" size={22} /> : <ImageIcon size={22} />}
          <span>{loading ? '正在读取画面…' : '输入时间后显示画面'}</span>
        </div>
      )}
      <span className="frame-label">{label}</span>
    </div>
  )
}

function TimeCodeInput({ value, label, onChange, onCommit }) {
  const parts = getTimeParts(value)
  const units = ['小时', '分钟', '秒']
  const inputRefs = useRef([])

  function updatePart(index, nextValue) {
    const digits = String(nextValue ?? '').replace(/\D/g, '').slice(0, 2)
    const nextPart = digits.length === 2 ? normalizeTimePart(digits) : digits
    onChange(replaceTimePart(value, index, nextPart))

    if (digits.length === 2 && index < units.length - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function commitPart(index, currentPart = parts[index]) {
    const normalized = replaceTimePart(value, index, normalizeTimePart(currentPart))
    onChange(normalized)
    onCommit(normalized)
  }

  return (
    <div className="time-input-wrap">
      {parts.map((part, partIndex) => (
        <div className="time-part-group" key={units[partIndex]}>
          {partIndex > 0 && <b>:</b>}
          <input
            ref={(element) => { inputRefs.current[partIndex] = element }}
            className="time-part"
            value={part}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            placeholder="00"
            aria-label={`${label}${units[partIndex]}`}
            onFocus={(event) => event.target.select()}
            onChange={(event) => updatePart(partIndex, event.target.value)}
            onBlur={(event) => commitPart(partIndex, event.target.value)}
          />
        </div>
      ))}
      <button onClick={() => onCommit(value)} title={`刷新${label}帧`}><RefreshCw size={14} /></button>
    </div>
  )
}

function SegmentCard({ segment, index, count, duration, aspectRatio, onChange, onRemove, onMove, onPreview }) {
  const error = validateSegment(segment, duration)
  const length = segmentDuration(segment)

  return (
    <article className={`segment-card ${error && (segment.start || segment.end) ? 'has-error' : ''}`}>
      <div className="segment-rail">
        <span className="segment-number">{String(index + 1).padStart(2, '0')}</span>
        <div className="rail-line" />
      </div>
      <div className="segment-content">
        <div className="segment-topline">
          <div>
            <h3>片段 {String(index + 1).padStart(2, '0')}</h3>
            <span className="duration-chip"><Clock3 size={12} />{length ? formatTime(length) : '等待时间范围'}</span>
          </div>
          <div className="segment-actions">
            <button className="icon-button" onClick={() => onMove(index, -1)} disabled={index === 0} title="上移"><ArrowUp size={17} /></button>
            <button className="icon-button" onClick={() => onMove(index, 1)} disabled={index === count - 1} title="下移"><ArrowDown size={17} /></button>
            <button className="icon-button danger" onClick={() => onRemove(index)} disabled={count === 1} title="删除片段"><Trash2 size={17} /></button>
          </div>
        </div>

        <div className="time-grid">
          <label>
            <span>起点时间</span>
            <TimeCodeInput
              value={segment.start}
              label="起点"
              onChange={(value) => onChange(index, 'start', value)}
              onCommit={(value) => onPreview(index, 'start', value)}
            />
          </label>
          <ChevronRight className="time-arrow" size={18} />
          <label>
            <span>终点时间</span>
            <TimeCodeInput
              value={segment.end}
              label="终点"
              onChange={(value) => onChange(index, 'end', value)}
              onCommit={(value) => onPreview(index, 'end', value)}
            />
          </label>
        </div>

        <div className="preview-grid">
          <FramePreview image={segment.startFrame} label="起点帧" loading={segment.loading === 'start'} aspectRatio={aspectRatio} />
          <FramePreview image={segment.endFrame} label="终点帧" loading={segment.loading === 'end'} aspectRatio={aspectRatio} />
        </div>

        {error && (segment.start || segment.end) && <p className="inline-error"><CircleAlert size={14} />{error}</p>}
      </div>
    </article>
  )
}

function ProcessingSettings({ mode, onModeChange, acceleration, onAccelerationChange, metadata, capabilities, quality, onQualityChange }) {
  const [qualityOpen, setQualityOpen] = useState(false)
  const codec = metadata?.video.codec
  const isAvailable = (engine) => {
    if (engine === 'auto' || engine === 'cpu') return true
    return Boolean(codec && capabilities?.vendors?.[engine]?.[codec])
  }

  return (
    <section className="processing-section">
      <div className="section-heading compact">
        <div><span className="step-kicker">02 / PROCESSING</span><h2>处理方式</h2><p>根据切点精度和处理速度选择输出模式。</p></div>
      </div>
      <div className="mode-grid">
        <button className={`mode-card ${mode === 'accurate' ? 'selected' : ''}`} onClick={() => onModeChange('accurate')}>
          <span className="mode-icon"><ShieldCheck size={22} /></span>
          <span><strong>精准剪辑</strong><small>逐帧裁切并重新编码，切点准确</small></span>
          <i>{mode === 'accurate' && <Check size={14} />}</i>
        </button>
        <button className={`mode-card ${mode === 'fast' ? 'selected' : ''}`} onClick={() => onModeChange('fast')}>
          <span className="mode-icon fast"><Rocket size={22} /></span>
          <span><strong>极速剪辑</strong><small>直接复制原始码流，接近秒级完成</small></span>
          <i>{mode === 'fast' && <Check size={14} />}</i>
        </button>
      </div>

      {mode === 'accurate' ? (
        <div className="engine-panel">
          <div className="engine-title"><Zap size={16} /><span><strong>视频编码引擎</strong><small>硬件不可用或启动失败时自动使用 CPU</small></span></div>
          <div className="engine-options">
            {engineOptions.map((engine) => {
              const available = isAvailable(engine.id)
              return (
                <button
                  key={engine.id}
                  className={acceleration === engine.id ? 'selected' : ''}
                  disabled={!available}
                  onClick={() => onAccelerationChange(engine.id)}
                  title={available ? engine.detail : `当前系统或 ${codec?.toUpperCase() || '该'} 编码不支持`}
                >
                  <strong>{engine.label}</strong><small>{available ? engine.detail : '不可用'}</small>
                </button>
              )
            })}
          </div>
          <span className="platform-note"><Cpu size={13} />检测环境：{capabilities?.platform || '读取中'} · {capabilities?.arch || '—'}</span>
          <div className="quality-menu">
            <button className="quality-toggle" onClick={() => setQualityOpen((open) => !open)} aria-expanded={qualityOpen}>
              <span><SlidersHorizontal size={16} /><strong>画质选项</strong><small>{qualityProfiles.find((item) => item.id === quality.profile)?.label} · {quality.resolution === 'source' ? '原分辨率' : quality.resolution} · {quality.fps === 'source' ? '原帧率' : `${quality.fps} FPS`}</small></span>
              <ChevronDown className={qualityOpen ? 'open' : ''} size={17} />
            </button>
            {qualityOpen && (
              <div className="quality-body">
                <div className="quality-block">
                  <label>质量预设</label>
                  <div className="quality-presets">
                    {qualityProfiles.map((profile) => (
                      <button key={profile.id} className={quality.profile === profile.id ? 'selected' : ''} onClick={() => onQualityChange('profile', profile.id)}>
                        <strong>{profile.label}</strong><small>{profile.detail}</small>
                      </button>
                    ))}
                  </div>
                </div>
                {quality.profile === 'custom' && (
                  <label className="custom-bitrate">
                    <span>视频码率</span>
                    <div><input type="number" min="0.5" max="200" step="0.5" value={quality.customVideoBitrate} onChange={(event) => onQualityChange('customVideoBitrate', event.target.value)} /><b>Mbps</b></div>
                  </label>
                )}
                <div className="quality-selects">
                  <label><span>输出分辨率</span><select value={quality.resolution} onChange={(event) => onQualityChange('resolution', event.target.value)}><option value="source">保持原分辨率</option><option value="2160p">最高 4K / 2160p</option><option value="1080p">最高 1080p</option><option value="720p">最高 720p</option></select></label>
                  <label><span>输出帧率</span><select value={quality.fps} onChange={(event) => onQualityChange('fps', event.target.value)}><option value="source">保持原帧率</option><option value="60">60 FPS</option><option value="30">30 FPS</option><option value="24">24 FPS</option></select></label>
                  <label><span>音频码率</span><select value={quality.audioBitrate} onChange={(event) => onQualityChange('audioBitrate', event.target.value)}><option value="source">跟随源音频</option><option value="320">320 kbps</option><option value="192">192 kbps</option><option value="128">128 kbps</option><option value="96">96 kbps</option></select></label>
                </div>
                <p className="quality-hint">降低分辨率时保持原始宽高比，不会放大小分辨率视频。高画质预设会增大文件体积。</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="fast-warning"><CircleAlert size={16} /><span><strong>极速模式以关键帧为切点</strong>实际起止位置可能比输入时间提前或延后数秒，但不会重新编码，画质和编码参数完全不变。</span></div>
      )}
    </section>
  )
}

function OutputSettings({ metadata, output, onNameChange, onChooseDirectory }) {
  return (
    <section className={`output-section ${!metadata ? 'disabled' : ''}`}>
      <div className="section-heading compact">
        <div><span className="step-kicker">03 / OUTPUT</span><h2>输出文件</h2><p>默认保存在源视频目录，文件名自动添加 _new。</p></div>
      </div>
      <div className="output-panel">
        <label className="output-name-field">
          <span>新文件名</span>
          <div><Save size={16} /><input value={output.fileName} onChange={(event) => onNameChange(event.target.value)} placeholder="原文件名_new.mp4" disabled={!metadata} /></div>
        </label>
        <label className="output-location-field">
          <span>保存位置</span>
          <div><FolderOpen size={16} /><strong title={output.directory}>{output.directory || '选择源视频后自动设置'}</strong><button onClick={onChooseDirectory} disabled={!metadata}>更改位置</button></div>
        </label>
      </div>
    </section>
  )
}

export default function App({ initialTheme = 'dark' }) {
  const api = window.frameCut
  const [theme, setTheme] = useState(initialTheme)
  const [metadata, setMetadata] = useState(demoMode ? demoMetadata : null)
  const [segments, setSegments] = useState(demoMode ? demoSegments : [blankSegment(), blankSegment(), blankSegment()])
  const [desiredCount, setDesiredCount] = useState(3)
  const [processingMode, setProcessingMode] = useState('accurate')
  const [acceleration, setAcceleration] = useState('auto')
  const [capabilities, setCapabilities] = useState(demoMode ? demoCapabilities : null)
  const [output, setOutput] = useState(demoMode ? demoOutput : { directory: '', fileName: '' })
  const [quality, setQuality] = useState({ profile: 'source', resolution: 'source', fps: 'source', audioBitrate: 'source', customVideoBitrate: '8' })
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [exportState, setExportState] = useState({ running: false, progress: 0, status: '', engine: '' })
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const dragDepth = useRef(0)

  const totalDuration = useMemo(() => segments.reduce((sum, item) => sum + segmentDuration(item), 0), [segments])
  const errors = useMemo(() => metadata ? segments.map((item) => validateSegment(item, metadata.duration)) : [], [segments, metadata])
  const isReady = Boolean(metadata && output.directory && output.fileName.trim() && segments.length && errors.every((error) => !error))

  useEffect(() => {
    const nextTheme = applyDocumentTheme(storeTheme(theme))
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', nextTheme === 'light' ? '#f5f7fa' : '#090c10')
    Promise.resolve(api?.setTheme?.(nextTheme)).catch(() => {})
  }, [api, theme])

  function notify(message, tone = 'success') {
    window.clearTimeout(toastTimer.current)
    setToast({ message, tone })
    toastTimer.current = window.setTimeout(() => setToast(null), 4200)
  }

  useEffect(() => {
    if (!api?.onProgress) return undefined
    return api.onProgress(({ progress, status, engine }) => {
      setExportState((previous) => ({ ...previous, progress, status, engine: engine || previous.engine }))
    })
  }, [api])

  useEffect(() => {
    if (!api?.getCapabilities || demoMode) return
    api.getCapabilities().then(setCapabilities).catch(() => setCapabilities(null))
  }, [api])

  useEffect(() => {
    const preventFileNavigation = (event) => event.preventDefault()
    window.addEventListener('dragover', preventFileNavigation)
    window.addEventListener('drop', preventFileNavigation)
    return () => {
      window.removeEventListener('dragover', preventFileNavigation)
      window.removeEventListener('drop', preventFileNavigation)
    }
  }, [])

  async function loadVideo(filePath) {
    if (!api || !filePath) return notify('无法读取拖入的文件', 'error')
    if (exportState.running) return notify('视频正在导出，请完成或取消后再更换源文件', 'error')
    if (isLoadingFile) return notify('正在读取视频，请稍候', 'error')
    setIsLoadingFile(true)
    try {
      const [info, outputDefaults] = await Promise.all([
        api.getMetadata(filePath),
        api.getOutputDefaults(filePath),
      ])
      setMetadata(info)
      setOutput(outputDefaults)
      setAcceleration('auto')
      if (info.video.bitRate > 0) setQuality((current) => ({ ...current, customVideoBitrate: (info.video.bitRate / 1_000_000).toFixed(1) }))
      setSegments((current) => current.map((item, index) => ({
        ...item,
        start: item.start || (index === 0 ? formatTime(0) : ''),
        end: item.end || (index === 0 ? formatTime(Math.min(10, info.duration)) : ''),
        startFrame: null,
        endFrame: null,
        loading: '',
      })))
      notify('视频读取完成')
    } catch (error) {
      notify(error.message || '无法读取视频', 'error')
    } finally {
      setIsLoadingFile(false)
    }
  }

  async function chooseVideo() {
    if (!api) return notify('请在桌面应用中选择本地视频', 'error')
    if (exportState.running) return notify('视频正在导出，请完成或取消后再更换源文件', 'error')
    try {
      const filePath = await api.selectVideo()
      if (filePath) await loadVideo(filePath)
    } catch (error) {
      notify(error.message || '无法选择视频', 'error')
    }
  }

  function handleDragEnter(event) {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return
    event.preventDefault()
    dragDepth.current += 1
    setIsDraggingFile(true)
  }

  function handleDragOver(event) {
    if (!Array.from(event.dataTransfer?.types || []).includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDragLeave(event) {
    event.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDraggingFile(false)
  }

  async function handleDrop(event) {
    event.preventDefault()
    dragDepth.current = 0
    setIsDraggingFile(false)
    const files = Array.from(event.dataTransfer?.files || [])
    if (files.length !== 1) return notify('请一次只拖入一个视频文件', 'error')
    if (!api?.getPathForFile) return notify('请在桌面应用中拖入本地视频', 'error')
    try {
      const filePath = api.getPathForFile(files[0])
      await loadVideo(filePath)
    } catch (error) {
      notify(error.message || '无法读取拖入的视频', 'error')
    }
  }

  function updateCount() {
    const count = Math.max(1, Math.min(100, Math.round(Number(desiredCount) || 1)))
    setDesiredCount(count)
    setSegments((current) => {
      if (count < current.length) return current.slice(0, count)
      return [...current, ...Array.from({ length: count - current.length }, blankSegment)]
    })
  }

  function addSegment() {
    setSegments((current) => [...current, blankSegment()])
    setDesiredCount((count) => Math.min(100, count + 1))
  }

  function removeSegment(index) {
    setSegments((current) => current.filter((_, itemIndex) => itemIndex !== index))
    setDesiredCount((count) => Math.max(1, count - 1))
  }

  function moveSegment(index, direction) {
    setSegments((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function changeSegment(index, field, value) {
    setSegments((current) => current.map((item, itemIndex) => itemIndex === index
      ? { ...item, [field]: value, [`${field}Frame`]: null }
      : item))
  }

  async function previewFrame(index, field, committedValue) {
    if (!metadata) return
    const segment = segments[index]
    const rawTime = parseTime(committedValue ?? segment[field])
    if (!Number.isFinite(rawTime) || rawTime < 0 || rawTime > metadata.duration) return
    const seekTime = field === 'end' ? Math.max(0, Math.min(metadata.duration - 0.04, rawTime - 0.04)) : rawTime
    setSegments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, loading: field } : item))
    try {
      const image = demoMode ? demoFrame(formatTime(rawTime), field === 'start' ? 198 : 230) : await api.extractFrame(metadata.path, seekTime)
      setSegments((current) => current.map((item, itemIndex) => itemIndex === index
        ? { ...item, [`${field}Frame`]: image, loading: '' }
        : item))
    } catch (error) {
      setSegments((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, loading: '' } : item))
      notify(error.message || '无法提取预览帧', 'error')
    }
  }

  async function handleExport() {
    if (!isReady || !api) return
    try {
      const outputPath = await api.prepareOutput({ sourcePath: metadata.path, directory: output.directory, fileName: output.fileName })
      if (!outputPath) return
      setExportState({ running: true, progress: 0, status: 'preparing', engine: '' })
      const normalized = segments.map((segment) => ({ start: parseTime(segment.start), end: parseTime(segment.end) }))
      const result = await api.exportVideo({ sourcePath: metadata.path, outputPath, segments: normalized, metadata, mode: processingMode, acceleration, quality })
      setExportState({ running: false, progress: 100, status: 'done', engine: result.engine })
      notify(`导出完成（${result.engine}）：${result.outputPath}`)
    } catch (error) {
      setExportState({ running: false, progress: 0, status: '', engine: '' })
      notify(error.message || '导出失败', 'error')
    }
  }

  async function cancelExport() {
    await api?.cancelExport()
  }

  async function chooseOutputDirectory() {
    if (!api || !metadata) return
    const directory = await api.chooseOutputDirectory(output.directory)
    if (directory) setOutput((current) => ({ ...current, directory }))
  }

  return (
    <div
      className="app-shell"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFile && (
        <div className="drop-overlay" aria-live="polite">
          <div>
            <span><Upload size={32} /></span>
            <strong>松开以读取视频</strong>
            <small>一次拖入一个本地视频文件</small>
          </div>
        </div>
      )}
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark"><Scissors size={22} /></div>
          <div><strong>快速剪辑</strong><span>QUICK CUT</span></div>
        </div>
        <div className="header-title">快速视频片段剪辑</div>
        <div className="header-actions">
          <div className="local-badge"><span />完全本地处理</div>
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
            title={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            <span>{theme === 'dark' ? '浅色' : '深色'}</span>
          </button>
        </div>
      </header>

      <main>
        <section className="hero-row">
          <div>
            <span className="eyebrow"><Sparkles size={14} /> FRAME-ACCURATE WORKFLOW</span>
            <h1>留下想要的画面，<br /><em>其余一剪而过。</em></h1>
            <p>输入任意数量的时间片段，核对起止帧，然后一次完成精准裁切与顺序合并。</p>
          </div>
          <div className="workflow-steps" aria-label="操作步骤">
            <span className={metadata ? 'done' : 'active'}><b>{metadata ? <Check size={14} /> : '1'}</b>选择视频</span>
            <i />
            <span className={metadata ? 'active' : ''}><b>2</b>设置片段</span>
            <i />
            <span><b>3</b>导出成片</span>
          </div>
        </section>

        <section className={`source-card ${metadata ? 'loaded' : ''}`}>
          {!metadata ? (
            <button className="source-empty" onClick={chooseVideo} disabled={isLoadingFile}>
              <span className="source-icon">{isLoadingFile ? <LoaderCircle className="spin" /> : <MonitorUp />}</span>
              <strong>{isLoadingFile ? '正在读取视频信息…' : '选择或拖入一个视频文件'}</strong>
              <small>可拖放到窗口任意位置，支持 MP4、MOV、MKV、AVI、WebM 等常见格式</small>
              <span className="browse-button"><FolderOpen size={17} />浏览文件</span>
            </button>
          ) : (
            <>
              <div className="file-identity">
                <span className="file-icon"><Film size={25} /></span>
                <div><small>当前源文件</small><strong title={metadata.path}>{metadata.name}</strong><span>{formatBytes(metadata.size)} · {metadata.format}</span></div>
              </div>
              <div className="metadata-grid">
                <MetadataItem label="时长" value={formatTime(metadata.duration, false)} />
                <MetadataItem label="分辨率" value={`${metadata.video.width} × ${metadata.video.height}`} />
                <MetadataItem label="视频编码" value={metadata.video.codec.toUpperCase()} />
                <MetadataItem label="帧率" value={`${metadata.video.fps.toFixed(2)} FPS`} />
                <MetadataItem label="音频" value={metadata.audio ? metadata.audio.codec.toUpperCase() : '无音轨'} />
              </div>
              <button className="replace-button" onClick={chooseVideo} disabled={isLoadingFile || exportState.running}><RefreshCw size={15} />更换视频</button>
            </>
          )}
        </section>

        <ProcessingSettings
          mode={processingMode}
          onModeChange={setProcessingMode}
          acceleration={acceleration}
          onAccelerationChange={setAcceleration}
          metadata={metadata}
          capabilities={capabilities}
          quality={quality}
          onQualityChange={(field, value) => setQuality((current) => ({ ...current, [field]: value }))}
        />

        <OutputSettings
          metadata={metadata}
          output={output}
          onNameChange={(fileName) => setOutput((current) => ({ ...current, fileName }))}
          onChooseDirectory={chooseOutputDirectory}
        />

        <section className="editor-section">
          <div className="section-heading">
            <div><span className="step-kicker">04 / SEGMENTS</span><h2>剪辑片段</h2><p>成片将严格按照下方片段的排列顺序合并。</p></div>
            <div className="count-control">
              <label>片段数量</label>
              <div><button onClick={() => setDesiredCount((count) => Math.max(1, count - 1))}>−</button><input type="number" min="1" max="100" value={desiredCount} onChange={(event) => setDesiredCount(event.target.value)} /><button onClick={() => setDesiredCount((count) => Math.min(100, Number(count) + 1))}>＋</button></div>
              <button className="apply-count" onClick={updateCount}>应用</button>
            </div>
          </div>

          {!metadata && <div className="editor-lock"><Video size={21} /><span>请先选择源视频，再设置剪辑时间</span></div>}

          <div className={`segments-list ${!metadata ? 'disabled' : ''}`}>
            {segments.map((segment, index) => (
              <SegmentCard
                key={segment.id}
                segment={segment}
                index={index}
                count={segments.length}
                duration={metadata?.duration}
                aspectRatio={metadata?.video.displayAspectRatio || (metadata?.video.width && metadata?.video.height ? metadata.video.width / metadata.video.height : 16 / 9)}
                onChange={changeSegment}
                onRemove={removeSegment}
                onMove={moveSegment}
                onPreview={previewFrame}
              />
            ))}
          </div>
          <button className="add-segment" onClick={addSegment} disabled={!metadata}><Plus size={18} />添加一个片段</button>
        </section>
      </main>

      <footer className="export-bar">
        <div className="export-summary">
          <div className="summary-icon"><Gauge size={21} /></div>
          <div><small>预计成片</small><strong>{segments.length} 个片段 <i /> {formatTime(totalDuration)}</strong></div>
          {metadata && <span className="preserve-note"><Check size={14} />{processingMode === 'fast' ? '码流原样复制' : qualityProfiles.find((item) => item.id === quality.profile)?.label} · {quality.resolution === 'source' ? `${metadata.video.width}×${metadata.video.height}` : quality.resolution} · {metadata.video.codec.toUpperCase()}</span>}
        </div>
        {exportState.running ? (
          <div className="export-progress">
            <div><span>{exportState.status === 'fallback' ? '硬件不可用，正在回退' : processingMode === 'fast' ? '正在复制与合并码流' : '正在编码与合并'}{exportState.engine ? ` · ${exportState.engine}` : ''}</span><strong>{Math.round(exportState.progress)}%</strong></div>
            <div className="progress-track"><span style={{ width: `${exportState.progress}%` }} /></div>
            <button onClick={cancelExport}>取消</button>
          </div>
        ) : (
          <button className="export-button" disabled={!isReady} onClick={handleExport}><Scissors size={19} />开始剪辑并导出</button>
        )}
      </footer>

      {toast && <div className={`toast ${toast.tone}`}><span>{toast.tone === 'success' ? <Check size={17} /> : <X size={17} />}</span><p>{toast.message}</p><button onClick={() => setToast(null)}><X size={15} /></button></div>}
    </div>
  )
}

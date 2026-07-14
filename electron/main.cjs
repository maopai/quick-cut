const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { getMetadata, extractFrame, getEncoderCapabilities, exportVideo, cancelExport } = require('./ffmpeg.cjs')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 700,
    title: '快速剪辑',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0a0d12',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('video:select', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择视频文件',
    properties: ['openFile'],
    filters: [
      { name: '视频文件', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'mts', 'm2ts'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('video:metadata', (_event, filePath) => getMetadata(filePath))
ipcMain.handle('video:capabilities', () => getEncoderCapabilities())
ipcMain.handle('video:frame', (_event, { filePath, seconds }) => extractFrame(filePath, seconds))

ipcMain.handle('video:output-defaults', (_event, sourcePath) => {
  const parsed = path.parse(sourcePath)
  return {
    directory: parsed.dir,
    fileName: `${parsed.name}_new${parsed.ext || '.mp4'}`,
  }
})

ipcMain.handle('video:choose-directory', async (_event, currentDirectory) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择保存位置',
    defaultPath: currentDirectory,
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('video:prepare-output', async (_event, { sourcePath, directory, fileName }) => {
  const sourceExt = path.extname(sourcePath) || '.mp4'
  let normalizedName = String(fileName || '').trim()
  if (!normalizedName) throw new Error('请输入新视频的文件名')
  if (path.basename(normalizedName) !== normalizedName || /[<>:"/\\|?*]/.test(normalizedName)) {
    throw new Error('文件名中不能包含路径符号或特殊字符')
  }
  if (!path.extname(normalizedName)) normalizedName += sourceExt
  if (path.extname(normalizedName).toLowerCase() !== sourceExt.toLowerCase()) {
    throw new Error(`输出文件需要保持 ${sourceExt} 扩展名`)
  }
  if (!directory || !fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new Error('保存位置不存在，请重新选择文件夹')
  }
  const outputPath = path.join(directory, normalizedName)
  if (path.resolve(sourcePath) === path.resolve(outputPath)) {
    throw new Error('输出文件不能覆盖源视频，请修改新文件名')
  }
  if (fs.existsSync(outputPath)) {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '文件已存在',
      message: `${normalizedName} 已存在，是否覆盖？`,
      detail: directory,
      buttons: ['取消', '覆盖'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    if (choice.response !== 1) return null
  }
  return outputPath
})

ipcMain.handle('video:export', async (event, payload) => {
  if (!fs.existsSync(payload.sourcePath)) throw new Error('源视频文件不存在或已被移动')
  if (path.resolve(payload.sourcePath) === path.resolve(payload.outputPath)) {
    throw new Error('输出文件不能覆盖源视频，请选择另一个文件名')
  }
  return exportVideo(payload, (value) => event.sender.send('video:progress', value))
})

ipcMain.handle('video:cancel', () => cancelExport())

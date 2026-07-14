const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('frameCut', {
  selectVideo: () => ipcRenderer.invoke('video:select'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  getMetadata: (filePath) => ipcRenderer.invoke('video:metadata', filePath),
  getCapabilities: () => ipcRenderer.invoke('video:capabilities'),
  extractFrame: (filePath, seconds) => ipcRenderer.invoke('video:frame', { filePath, seconds }),
  getOutputDefaults: (sourcePath) => ipcRenderer.invoke('video:output-defaults', sourcePath),
  chooseOutputDirectory: (currentDirectory) => ipcRenderer.invoke('video:choose-directory', currentDirectory),
  prepareOutput: (payload) => ipcRenderer.invoke('video:prepare-output', payload),
  exportVideo: (payload) => ipcRenderer.invoke('video:export', payload),
  cancelExport: () => ipcRenderer.invoke('video:cancel'),
  onProgress: (callback) => {
    const listener = (_event, value) => callback(value)
    ipcRenderer.on('video:progress', listener)
    return () => ipcRenderer.removeListener('video:progress', listener)
  },
})

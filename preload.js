const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  fetchModels: (params) => ipcRenderer.invoke('fetch-models', params),
  autoSelectModel: (params) => ipcRenderer.invoke('auto-select-model', params),
  scanFiles: (params) => ipcRenderer.invoke('scan-files', params),
  processFiles: (params) => ipcRenderer.invoke('process-files', params),
  stopProcessing: () => ipcRenderer.invoke('stop-processing'),
  undoRenames: (params) => ipcRenderer.invoke('undo-renames', params),
  getVersion: () => ipcRenderer.invoke('get-version'),
  showNotification: (params) => ipcRenderer.invoke('show-notification', params),

  onProcessProgress: (callback) => {
    ipcRenderer.on('process-progress', (event, data) => callback(data))
  },
  onProcessComplete: (callback) => {
    ipcRenderer.on('process-complete', (event, data) => callback(data))
  },
  removeProcessProgressListener: () => {
    ipcRenderer.removeAllListeners('process-progress')
  },
  removeProcessCompleteListener: () => {
    ipcRenderer.removeAllListeners('process-complete')
  }
})

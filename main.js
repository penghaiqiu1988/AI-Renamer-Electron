const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron')
const path = require('path')
const fs = require('fs').promises
const os = require('os')
const { v4: uuidv4 } = require('uuid')

// Core modules
const isImage = require('./src/core/isImage')
const isVideo = require('./src/core/isVideo')
const saveFile = require('./src/core/saveFile')
const getNewName = require('./src/core/getNewName')
const extractFrames = require('./src/core/extractFrames')
const readFileContent = require('./src/core/readFileContent')
const deleteDirectory = require('./src/core/deleteDirectory')
const isProcessableFile = require('./src/core/isProcessableFile')
const { fetchModels, autoSelectModel } = require('./src/core/chooseModel')

const CONFIG_FILE = path.join(os.homedir(), 'ai-renamer.json')

let mainWindow = null
let shouldStop = false  // Flag for stopping processing

// Load and save config
const loadConfig = async () => {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8')
    return JSON.parse(data)
  } catch (err) {
    return {}
  }
}

const saveConfig = async (config) => {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2))
}

// Create main window
function createWindow() {
  const isMac = process.platform === 'darwin'
  const iconPath = path.join(__dirname, 'assets', 'icon.png')

  const windowOptions = {
    width: 960,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'AI Renamer',
    backgroundColor: '#0f0f11',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false,
    autoHideMenuBar: true,
    icon: iconPath
  }

  // macOS specific titlebar
  if (isMac) {
    windowOptions.titleBarStyle = 'hiddenInset'
    windowOptions.trafficLightPosition = { x: 16, y: 16 }
  }

  // Windows: set icon explicitly for taskbar and window
  if (process.platform === 'win32') {
    windowOptions.icon = path.join(__dirname, 'assets', 'icon.ico')
  }

  mainWindow = new BrowserWindow(windowOptions)

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'))

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// ============== IPC Handlers ==============

// Select folder
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// Select file
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      {
        name: 'All Supported Files',
        extensions: [
          'jpg', 'jpeg', 'png', 'bmp', 'tif', 'tiff', 'webp', 'gif',
          'mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm',
          'pdf', 'txt', 'md', 'json', 'xml', 'yaml', 'yml', 'csv',
          'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'php', 'java', 'c', 'cpp',
          'h', 'hpp', 'cs', 'go', 'rs', 'swift', 'kt', 'html', 'css', 'scss',
          'sh', 'bat', 'sql', 'svg', 'log'
        ]
      },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// Load config
ipcMain.handle('load-config', async () => {
  return await loadConfig()
})

// Save config
ipcMain.handle('save-config', async (event, config) => {
  await saveConfig(config)
})

// Fetch available models
ipcMain.handle('fetch-models', async (event, { provider, baseURL }) => {
  try {
    const models = await fetchModels({ provider, baseURL })
    return { success: true, models }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Auto select model
ipcMain.handle('auto-select-model', async (event, { provider, baseURL }) => {
  try {
    const model = await autoSelectModel({ provider, baseURL })
    return { success: true, model }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Scan directory for files
ipcMain.handle('scan-files', async (event, { inputPath, includeSubdirectories }) => {
  try {
    const files = []

    const scanDir = async (dirPath, relativeBase) => {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        const relativePath = relativeBase ? path.join(relativeBase, entry.name) : entry.name

        if (entry.isFile()) {
          if (entry.name === '.DS_Store' || entry.name === 'Thumbs.db' || entry.name === 'desktop.ini') continue
          if (!isProcessableFile({ filePath: fullPath })) continue

          const ext = path.extname(fullPath).toLowerCase()
          let type = 'text'
          if (isImage({ ext })) type = 'image'
          else if (isVideo({ ext })) type = 'video'
          else if (ext === '.pdf') type = 'pdf'

          const stat = await fs.stat(fullPath)
          files.push({
            name: entry.name,
            path: fullPath,
            relativePath,
            ext,
            type,
            size: stat.size
          })
        } else if (entry.isDirectory() && includeSubdirectories) {
          await scanDir(fullPath, relativePath)
        }
      }
    }

    const stat = await fs.stat(inputPath)
    if (stat.isDirectory()) {
      await scanDir(inputPath, '')
    } else if (stat.isFile()) {
      const ext = path.extname(inputPath).toLowerCase()
      let type = 'text'
      if (isImage({ ext })) type = 'image'
      else if (isVideo({ ext })) type = 'video'
      else if (ext === '.pdf') type = 'pdf'

      files.push({
        name: path.basename(inputPath),
        path: inputPath,
        relativePath: path.basename(inputPath),
        ext,
        type,
        size: stat.size
      })
    }

    return { success: true, files }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// Stop processing
ipcMain.handle('stop-processing', async () => {
  shouldStop = true
  return { success: true }
})

// Process files
ipcMain.handle('process-files', async (event, { files, options }) => {
  const {
    provider, apiKey, baseURL, model, frames, _case, chars, language, customPrompt, inputPath
  } = options

  shouldStop = false  // Reset stop flag

  const total = files.length
  let processed = 0
  let succeeded = 0
  let failed = 0

  for (const file of files) {
    // Check stop flag
    if (shouldStop) {
      // Mark remaining files as stopped
      for (let i = processed; i < total; i++) {
        mainWindow.webContents.send('process-progress', {
          current: i + 1,
          total,
          file: files[i].relativePath,
          status: 'stopped',
          reason: '用户停止'
        })
      }
      processed = total
      break
    }

    try {
      // Send progress update
      mainWindow.webContents.send('process-progress', {
        current: processed + 1,
        total,
        file: file.relativePath,
        status: 'processing'
      })

      const ext = file.ext
      let content
      let videoPrompt
      let images = []
      let framesOutputDir

      if (isImage({ ext })) {
        images.push(file.path)
      } else if (isVideo({ ext })) {
        framesOutputDir = path.join(os.tmpdir(), 'ai-renamer', uuidv4())
        const _extractedFrames = await extractFrames({
          frames,
          framesOutputDir,
          inputFile: file.path
        })
        images = _extractedFrames.images
        videoPrompt = _extractedFrames.videoPrompt
      } else {
        content = await readFileContent({ filePath: file.path })
        if (!content) {
          mainWindow.webContents.send('process-progress', {
            current: processed + 1,
            total,
            file: file.relativePath,
            status: 'skipped',
            reason: '无文本内容'
          })
          processed++
          failed++
          continue
        }
      }

      // Check stop again before API call
      if (shouldStop) {
        mainWindow.webContents.send('process-progress', {
          current: processed + 1,
          total,
          file: file.relativePath,
          status: 'stopped',
          reason: '用户停止'
        })
        processed++
        continue
      }

      const newName = await getNewName({
        model,
        _case,
        chars,
        frames,
        apiKey,
        baseURL,
        language,
        provider,
        images,
        content,
        videoPrompt,
        customPrompt,
        relativeFilePath: file.relativePath
      })

      if (!newName) {
        mainWindow.webContents.send('process-progress', {
          current: processed + 1,
          total,
          file: file.relativePath,
          status: 'failed',
          reason: '无法生成新名称'
        })
        processed++
        failed++
        continue
      }

      const oldFilePath = file.path
      const result = await saveFile({ ext, newName, filePath: file.path })
      const newFilePath = result.newPath
      const relativeNewFilePath = path.join(path.dirname(file.relativePath), result.newFileName)

      mainWindow.webContents.send('process-progress', {
        current: processed + 1,
        total,
        file: file.relativePath,
        status: 'success',
        newName: relativeNewFilePath,
        oldPath: oldFilePath,
        newPath: newFilePath
      })

      if (isVideo({ ext }) && framesOutputDir) {
        deleteDirectory({ folderPath: framesOutputDir })
      }

      succeeded++
    } catch (err) {
      if (shouldStop) {
        mainWindow.webContents.send('process-progress', {
          current: processed + 1,
          total,
          file: file.relativePath,
          status: 'stopped',
          reason: '用户停止'
        })
      } else {
        mainWindow.webContents.send('process-progress', {
          current: processed + 1,
          total,
          file: file.relativePath,
          status: 'error',
          reason: err.message
        })
        failed++
      }
    }

    processed++
  }

  // Send completion event
  mainWindow.webContents.send('process-complete', {
    total,
    succeeded,
    failed,
    stopped: shouldStop
  })

  shouldStop = false
  return { success: true, total, succeeded, failed }
})

// Undo renames
ipcMain.handle('undo-renames', async (event, { history }) => {
  let reverted = 0
  let failed = 0

  for (const item of history) {
    try {
      // Check if the new file still exists
      await fs.access(item.newPath)
      // Rename back to original
      await fs.rename(item.newPath, item.oldPath)
      reverted++
    } catch (err) {
      // File might have been moved or deleted
      failed++
    }
  }

  return { success: true, reverted, failed }
})

// Get app version
ipcMain.handle('get-version', () => {
  return app.getVersion()
})

// Show notification
ipcMain.handle('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show()
  }
})

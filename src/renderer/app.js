// ===== App State =====
const state = {
  inputPath: null,
  files: [],
  selectedFiles: new Set(),
  isProcessing: false,
  config: {},
  renameHistory: [],  // [{ oldPath, newPath }] for undo
  lastBatchId: null  // reserved for future batch-scoped undo
}

// ===== DOM Elements =====
const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => document.querySelectorAll(sel)

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', async () => {
  initTheme()
  await loadConfig()
  bindEvents()
  syncUIFromConfig()
})

// ===== Theme Management =====
function initTheme() {
  const saved = localStorage.getItem('ai-renamer-theme')
  const theme = saved || 'dark'
  applyTheme(theme)
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('ai-renamer-theme', theme)
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme')
  applyTheme(current === 'dark' ? 'light' : 'dark')
}

// ===== Config Management =====
async function loadConfig() {
  try {
    state.config = await window.api.loadConfig()
  } catch (err) {
    state.config = {}
  }
}

async function saveConfig() {
  try {
    await window.api.saveConfig(state.config)
  } catch (err) {
    console.error('Failed to save config:', err)
  }
}

function syncUIFromConfig() {
  const c = state.config
  // Quick settings
  if (c.defaultProvider) $('#qs-provider').value = c.defaultProvider
  if (c.defaultModel) $('#qs-model').value = c.defaultModel
  if (c.defaultCase) $('#qs-case').value = c.defaultCase
  if (c.defaultLanguage) {
    setSelectValue('#qs-language', c.defaultLanguage)
    setSelectValue('#s-language', c.defaultLanguage)
  }

  // Settings modal
  if (c.defaultProvider) $('#s-provider').value = c.defaultProvider
  if (c.defaultBaseURL) $('#s-base-url').value = c.defaultBaseURL
  if (c.defaultApiKey) $('#s-api-key').value = c.defaultApiKey
  if (c.defaultModel) $('#s-model').value = c.defaultModel
  if (c.defaultCase) $('#s-case').value = c.defaultCase
  if (c.defaultChars) $('#s-chars').value = c.defaultChars
  if (c.defaultFrames) $('#s-frames').value = c.defaultFrames
  if (c.defaultCustomPrompt) $('#s-custom-prompt').value = c.defaultCustomPrompt
  if (c.defaultIncludeSubdirectories === 'true') {
    $('#s-include-subdirectories').checked = true
    $('#subdirectories-label').textContent = '是'
  }

  updateApiKeyVisibility()
}

// Helper: set <select> value, fallback to first option if not found
function setSelectValue(selector, value) {
  const el = $(selector)
  if (!el) return
  const opts = Array.from(el.options)
  const match = opts.find(o => o.value === value)
  if (match) {
    el.value = value
  } else {
    // If value not in list, add a custom option
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = value
    el.appendChild(opt)
    el.value = value
  }
}

function updateApiKeyVisibility() {
  const provider = $('#s-provider').value
  const group = $('#api-key-group')
  group.style.display = (provider === 'openai') ? 'flex' : 'none'
}

// ===== Event Bindings =====
function bindEvents() {
  // Theme toggle
  $('#btn-theme').addEventListener('click', toggleTheme)

  // Select folder/file
  $('#btn-select-folder').addEventListener('click', selectFolder)
  $('#btn-select-file').addEventListener('click', selectFile)
  $('#btn-change-path').addEventListener('click', () => {
    if (state.isProcessing) return
    selectFolder()
  })

  // Drag and drop
  const dropZone = $('#drop-zone')
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault()
    dropZone.classList.add('drag-over')
  })
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over')
  })
  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault()
    dropZone.classList.remove('drag-over')
    if (state.isProcessing) return

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const filePath = files[0].path
      if (filePath) {
        await setInputPath(filePath)
      }
    }
  })

  // Select all / deselect all
  $('#btn-select-all').addEventListener('click', () => {
    state.files.forEach(f => state.selectedFiles.add(f.path))
    updateFileListUI()
    updateActionBar()
  })
  $('#btn-deselect-all').addEventListener('click', () => {
    state.selectedFiles.clear()
    updateFileListUI()
    updateActionBar()
  })

  // Start processing
  $('#btn-start').addEventListener('click', startProcessing)
  $('#btn-done').addEventListener('click', resetUI)

  // Undo buttons
  $('#btn-undo').addEventListener('click', undoLastBatch)
  $('#btn-undo-progress').addEventListener('click', undoLastBatch)

  // Settings modal
  $('#btn-settings').addEventListener('click', () => {
    syncUIFromConfig()
    $('#settings-modal').classList.remove('hidden')
  })
  $('#btn-close-settings').addEventListener('click', () => {
    $('#settings-modal').classList.add('hidden')
  })
  $('#btn-save-settings').addEventListener('click', saveSettingsFromModal)
  $('#btn-reset-settings').addEventListener('click', resetSettings)
  $('.modal-overlay').addEventListener('click', () => {
    $('#settings-modal').classList.add('hidden')
  })
  $('#s-provider').addEventListener('change', updateApiKeyVisibility)
  $('#s-include-subdirectories').addEventListener('change', (e) => {
    $('#subdirectories-label').textContent = e.target.checked ? '是' : '否'
  })

  // Fetch models button (settings)
  $('#btn-fetch-models').addEventListener('click', async () => {
    await fetchAndPopulateModels('#s-model')
  })

  // Refresh models (quick settings)
  $('#btn-refresh-models').addEventListener('click', async () => {
    await fetchAndPopulateModels('#qs-model')
  })

  // Quick settings sync
  $('#qs-provider').addEventListener('change', async (e) => {
    state.config.defaultProvider = e.target.value
    await saveConfig()
    await fetchAndPopulateModels('#qs-model')
  })
  $('#qs-case').addEventListener('change', async (e) => {
    state.config.defaultCase = e.target.value
    await saveConfig()
  })
  $('#qs-language').addEventListener('change', async (e) => {
    state.config.defaultLanguage = e.target.value
    await saveConfig()
  })

  // Process progress listener
  window.api.onProcessProgress((data) => {
    updateProgressItem(data)
  })
  window.api.onProcessComplete((data) => {
    showProcessComplete(data)
  })
}

// ===== Select Path =====
async function selectFolder() {
  if (state.isProcessing) return
  const folderPath = await window.api.selectFolder()
  if (folderPath) {
    await setInputPath(folderPath)
  }
}

async function selectFile() {
  if (state.isProcessing) return
  const filePath = await window.api.selectFile()
  if (filePath) {
    await setInputPath(filePath)
  }
}

async function setInputPath(inputPath) {
  state.inputPath = inputPath

  // Show path display
  $('#drop-zone').classList.add('hidden')
  $('#selected-path').classList.remove('hidden')
  $('#path-text').textContent = inputPath

  // Scan files
  const includeSubdirs = state.config.defaultIncludeSubdirectories === 'true'
  const result = await window.api.scanFiles({ inputPath, includeSubdirectories: includeSubdirs })

  if (!result.success) {
    alert('扫描文件失败: ' + result.error)
    return
  }

  state.files = result.files
  state.selectedFiles = new Set(result.files.map(f => f.path))

  // Show file list
  $('#file-list-section').classList.remove('hidden')
  $('#quick-settings').classList.remove('hidden')
  $('#action-bar').classList.remove('hidden')
  $('#progress-section').classList.add('hidden')

  updateFileListUI()
  updateActionBar()
  updateUndoButton()

  // Auto-fetch models if not set
  if (!state.config.defaultModel) {
    fetchAndPopulateModels('#qs-model')
  }
}

// ===== File List UI =====
function updateFileListUI() {
  const listEl = $('#file-list')
  const countEl = $('#file-count')
  countEl.textContent = state.files.length

  listEl.innerHTML = state.files.map(file => {
    const checked = state.selectedFiles.has(file.path) ? 'checked' : ''
    const typeIcon = getTypeIcon(file.type)
    const sizeStr = formatSize(file.size)

    return `
      <div class="file-item" data-path="${escapeAttr(file.path)}">
        <input type="checkbox" class="file-checkbox" data-path="${escapeAttr(file.path)}" ${checked}>
        <div class="file-icon ${file.type}">${typeIcon}</div>
        <div class="file-info">
          <span class="file-name">${escapeHtml(file.name)}</span>
          <span class="file-meta">${file.ext} · ${sizeStr}</span>
        </div>
        <span class="file-status pending" id="status-${hashStr(file.path)}">待处理</span>
      </div>
    `
  }).join('')

  // Bind checkbox events
  listEl.querySelectorAll('.file-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const path = e.target.dataset.path
      if (e.target.checked) {
        state.selectedFiles.add(path)
      } else {
        state.selectedFiles.delete(path)
      }
      updateActionBar()
    })
  })
}

function updateActionBar() {
  const count = state.selectedFiles.size
  $('#selected-count').textContent = `已选择 ${count} 个文件`
  $('#btn-start').disabled = count === 0
}

function updateUndoButton() {
  const hasHistory = state.renameHistory.length > 0
  const undoWrapper = $('#undo-btn-wrapper')
  if (undoWrapper) {
    if (hasHistory) {
      undoWrapper.classList.remove('hidden')
    } else {
      undoWrapper.classList.add('hidden')
    }
  }
}

function getTypeIcon(type) {
  switch (type) {
    case 'image':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
    case 'video':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>'
    case 'pdf':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
    default:
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>'
  }
}

// ===== Processing =====
async function startProcessing() {
  if (state.isProcessing) return
  state.isProcessing = true

  // Get options from quick settings + config
  const provider = $('#qs-provider').value
  const model = $('#qs-model').value
  const _case = $('#qs-case').value
  const language = $('#qs-language').value

  let baseURL = state.config.defaultBaseURL
  if (provider === 'ollama' && !baseURL) baseURL = 'http://127.0.0.1:11434'
  else if (provider === 'lm-studio' && !baseURL) baseURL = 'http://127.0.0.1:1234'
  else if (provider === 'openai' && !baseURL) baseURL = 'https://api.openai.com'

  const options = {
    provider,
    apiKey: state.config.defaultApiKey || '',
    baseURL,
    model: model || undefined,
    frames: parseInt(state.config.defaultFrames) || 3,
    _case,
    chars: parseInt(state.config.defaultChars) || 20,
    language,
    customPrompt: state.config.defaultCustomPrompt || null,
    inputPath: state.inputPath
  }

  // If no model selected, try auto-select
  if (!options.model) {
    try {
      const result = await window.api.autoSelectModel({ provider, baseURL })
      if (result.success && result.model) {
        options.model = result.model
      } else {
        alert('无法自动选择模型，请在设置中手动指定模型。')
        state.isProcessing = false
        return
      }
    } catch (err) {
      alert('获取模型列表失败: ' + err.message)
      state.isProcessing = false
      return
    }
  }

  // Prepare selected files
  const selectedFileObjects = state.files.filter(f => state.selectedFiles.has(f.path))
  if (selectedFileObjects.length === 0) {
    state.isProcessing = false
    return
  }

  // Show progress section with stop button
  $('#progress-section').classList.remove('hidden')
  $('#progress-summary').classList.add('hidden')
  $('#progress-actions').classList.add('hidden')
  $('#action-bar').classList.add('hidden')
  $('#progress-log').innerHTML = ''

  // Show stop button, hide start
  showStopButton(true)

  updateProgressBar(0, selectedFileObjects.length)

  // Reset all file statuses
  state.files.forEach(f => {
    const statusEl = document.getElementById(`status-${hashStr(f.path)}`)
    if (statusEl) {
      statusEl.textContent = '待处理'
      statusEl.className = 'file-status pending'
    }
    const itemEl = document.querySelector(`.file-item[data-path="${CSS.escape(f.path)}"]`)
    if (itemEl) {
      itemEl.classList.remove('success', 'failed', 'error', 'skipped', 'processing')
    }
  })

  // Start processing
  try {
    await window.api.processFiles({
      files: selectedFileObjects,
      options
    })
  } catch (err) {
    console.error('Processing error:', err)
  }
}

function showStopButton(show) {
  const startBtn = $('#btn-start')
  if (show) {
    // Replace start button with stop button in the action bar area
    // We'll add a stop button inside progress section
    let stopBtn = $('#btn-stop')
    if (!stopBtn) {
      const progressHeader = $('.progress-header')
      stopBtn = document.createElement('button')
      stopBtn.id = 'btn-stop'
      stopBtn.className = 'btn btn-danger btn-stop-pulse'
      stopBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="6" y="6" width="12" height="12"></rect>
        </svg>
        停止
      `
      stopBtn.addEventListener('click', stopProcessing)
      progressHeader.appendChild(stopBtn)
    }
    stopBtn.classList.remove('hidden')
  } else {
    const stopBtn = $('#btn-stop')
    if (stopBtn) stopBtn.classList.add('hidden')
  }
}

async function stopProcessing() {
  try {
    await window.api.stopProcessing()
  } catch (err) {
    console.error('Stop error:', err)
  }
  state.isProcessing = false
  showStopButton(false)
  $('#progress-actions').classList.remove('hidden')
}

function updateProgressItem(data) {
  const { current, total, file, status, reason, newName, oldPath, newPath } = data

  updateProgressBar(current, total)

  // Track rename history for undo
  if (status === 'success' && oldPath && newPath) {
    state.renameHistory.push({ oldPath, newPath })
  }

  // Update file list status
  const fileObj = state.files.find(f => f.relativePath === file)
  if (fileObj) {
    const statusEl = document.getElementById(`status-${hashStr(fileObj.path)}`)
    const itemEl = document.querySelector(`.file-item[data-path="${CSS.escape(fileObj.path)}"]`)

    if (statusEl && itemEl) {
      itemEl.classList.remove('processing', 'success', 'failed', 'error', 'skipped')

      switch (status) {
        case 'processing':
          itemEl.classList.add('processing')
          statusEl.textContent = '处理中...'
          statusEl.className = 'file-status processing'
          break
        case 'success':
          itemEl.classList.add('success')
          statusEl.textContent = '成功'
          statusEl.className = 'file-status success'
          if (newName) {
            const infoEl = itemEl.querySelector('.file-info')
            const existingNew = infoEl.querySelector('.file-new-name')
            if (existingNew) existingNew.remove()
            const newEl = document.createElement('div')
            newEl.className = 'file-new-name'
            newEl.textContent = '→ ' + newName
            infoEl.appendChild(newEl)
          }
          break
        case 'failed':
        case 'error':
          itemEl.classList.add('failed')
          statusEl.textContent = reason || '失败'
          statusEl.className = 'file-status failed'
          break
        case 'skipped':
          itemEl.classList.add('skipped')
          statusEl.textContent = reason || '跳过'
          statusEl.className = 'file-status skipped'
          break
        case 'stopped':
          itemEl.classList.add('skipped')
          statusEl.textContent = '已停止'
          statusEl.className = 'file-status skipped'
          break
      }
    }
  }

  // Add to progress log
  const logEl = $('#progress-log')
  const logItem = document.createElement('div')
  let logText = file
  let logResult = ''

  switch (status) {
    case 'processing':
      logItem.className = 'log-item processing'
      logResult = '处理中...'
      break
    case 'success':
      logItem.className = 'log-item success'
      logResult = newName ? `→ ${newName}` : '成功'
      break
    case 'failed':
    case 'error':
      logItem.className = 'log-item failed'
      logResult = reason || '失败'
      break
    case 'skipped':
      logItem.className = 'log-item skipped'
      logResult = reason || '跳过'
      break
    case 'stopped':
      logItem.className = 'log-item skipped'
      logResult = '已停止'
      break
  }

  logItem.innerHTML = `<span class="log-name">${escapeHtml(logText)}</span><span class="log-result">${escapeHtml(logResult)}</span>`
  logEl.appendChild(logItem)
  logEl.scrollTop = logEl.scrollHeight
}

function updateProgressBar(current, total) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  $('#progress-bar').style.width = pct + '%'
  $('#progress-text').textContent = `${current} / ${total}`
}

function showProcessComplete(data) {
  state.isProcessing = false
  showStopButton(false)
  const { total, succeeded, failed } = data

  $('#summary-success').textContent = succeeded
  $('#summary-failed').textContent = failed
  $('#summary-total').textContent = total
  $('#progress-summary').classList.remove('hidden')
  $('#progress-actions').classList.remove('hidden')

  updateUndoButton()

  // Notification
  try {
    window.api.showNotification({
      title: 'AI Renamer 完成',
      body: `共处理 ${total} 个文件，成功 ${succeeded} 个，失败 ${failed} 个`
    })
  } catch (e) {}
}

// ===== Undo =====
async function undoLastBatch() {
  if (state.renameHistory.length === 0) {
    alert('没有可撤销的操作')
    return
  }

  const confirmed = confirm(`确定要撤销 ${state.renameHistory.length} 个文件的重命名吗？文件将恢复为原始名称。`)
  if (!confirmed) return

  try {
    const result = await window.api.undoRenames({ history: state.renameHistory })
    if (result.success) {
      alert(`成功撤销 ${result.reverted} 个文件，失败 ${result.failed} 个`)
      state.renameHistory = []
      updateUndoButton()
      // Refresh file list if we have a path
      if (state.inputPath) {
        await setInputPath(state.inputPath)
      }
    } else {
      alert('撤销失败: ' + (result.error || '未知错误'))
    }
  } catch (err) {
    alert('撤销出错: ' + err.message)
  }
}

// ===== Reset UI =====
function resetUI() {
  state.inputPath = null
  state.files = []
  state.selectedFiles.clear()
  state.isProcessing = false
  state.renameHistory = []

  $('#drop-zone').classList.remove('hidden')
  $('#selected-path').classList.add('hidden')
  $('#file-list-section').classList.add('hidden')
  $('#quick-settings').classList.add('hidden')
  $('#action-bar').classList.add('hidden')
  $('#progress-section').classList.add('hidden')
  showStopButton(false)
}

// ===== Settings =====
async function saveSettingsFromModal() {
  state.config.defaultProvider = $('#s-provider').value
  state.config.defaultBaseURL = $('#s-base-url').value || undefined
  state.config.defaultApiKey = $('#s-api-key').value || undefined
  state.config.defaultModel = $('#s-model').value || undefined
  state.config.defaultCase = $('#s-case').value
  state.config.defaultChars = parseInt($('#s-chars').value) || 20
  state.config.defaultLanguage = $('#s-language').value || 'English'
  state.config.defaultFrames = parseInt($('#s-frames').value) || 3
  state.config.defaultCustomPrompt = $('#s-custom-prompt').value || undefined
  state.config.defaultIncludeSubdirectories = $('#s-include-subdirectories').checked ? 'true' : 'false'

  await saveConfig()
  syncUIFromConfig()
  $('#settings-modal').classList.add('hidden')
}

async function resetSettings() {
  state.config = {}
  await saveConfig()
  syncUIFromConfig()

  // Reset form fields to defaults
  $('#s-provider').value = 'ollama'
  $('#s-base-url').value = ''
  $('#s-api-key').value = ''
  $('#s-model').value = ''
  $('#s-case').value = 'kebabCase'
  $('#s-chars').value = '20'
  $('#s-language').value = 'English'
  $('#s-frames').value = '3'
  $('#s-custom-prompt').value = ''
  $('#s-include-subdirectories').checked = false
  $('#subdirectories-label').textContent = '否'
}

// ===== Model Fetching =====
async function fetchAndPopulateModels(selectId) {
  const provider = selectId === '#qs-model' ? $('#qs-provider').value : $('#s-provider').value
  const baseURL = getBaseURL(provider)

  const selectEl = $(selectId)
  const currentVal = selectEl.value

  // Clear existing options except the first
  while (selectEl.options.length > 1) {
    selectEl.remove(1)
  }

  // Add loading option
  const loadingOpt = document.createElement('option')
  loadingOpt.textContent = '加载中...'
  loadingOpt.disabled = true
  selectEl.appendChild(loadingOpt)

  try {
    const result = await window.api.fetchModels({ provider, baseURL })
    // Remove loading
    selectEl.remove(selectEl.options.length - 1)

    if (result.success && result.models) {
      result.models.forEach(name => {
        const opt = document.createElement('option')
        opt.value = name
        opt.textContent = name
        selectEl.appendChild(opt)
      })

      // Restore previous selection or auto-select
      if (currentVal && result.models.includes(currentVal)) {
        selectEl.value = currentVal
      } else if (result.models.length > 0) {
        try {
          const autoResult = await window.api.autoSelectModel({ provider, baseURL })
          if (autoResult.success && autoResult.model) {
            selectEl.value = autoResult.model
          }
        } catch (e) {}
      }
    } else {
      const errOpt = document.createElement('option')
      errOpt.textContent = '无法获取模型'
      errOpt.disabled = true
      selectEl.appendChild(errOpt)
    }
  } catch (err) {
    selectEl.remove(selectEl.options.length - 1)
    const errOpt = document.createElement('option')
    errOpt.textContent = '连接失败'
    errOpt.disabled = true
    selectEl.appendChild(errOpt)
  }
}

function getBaseURL(provider) {
  const configBase = state.config.defaultBaseURL
  if (configBase) return configBase

  switch (provider) {
    case 'ollama': return 'http://127.0.0.1:11434'
    case 'lm-studio': return 'http://127.0.0.1:1234'
    case 'openai': return 'https://api.openai.com'
    default: return 'http://127.0.0.1:11434'
  }
}

// ===== Utility Functions =====
function escapeHtml(str) {
  if (!str) return ''
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeAttr(str) {
  if (!str) return ''
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function hashStr(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

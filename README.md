<img width="1024" height="1024" alt="icon" src="https://github.com/user-attachments/assets/3070d0b7-c25e-4606-b9a7-090afa7c9516" />

# AI Renamer Desktop

基于 [ai-renamer](https://github.com/ozgrozer/ai-renamer) 的 Electron 桌面版应用，使用 AI 模型智能重命名文件。

## 功能特性

- 🖼️ **图片重命名** - 使用视觉模型分析图片内容并智能命名
- 🎬 **视频重命名** - 自动提取视频关键帧，AI 分析内容后重命名
- 📄 **文档重命名** - 读取文本/PDF/代码文件内容，AI 生成描述性文件名
- 🤖 **多提供商支持** - Ollama / OpenAI / LM Studio ，模型自动获取
- 🎨 **多种命名风格** - kebab-case, camelCase, PascalCase, snake_case 等 12 种
- 🌐 **多语言输出** - 可指定任意输出语言
- 📁 **批量处理** - 支持文件夹批量处理，包含子目录
- ⚙️ **自定义提示词** - 可添加自定义 AI 指令
- ⚙️ **操作管理** - 待处理器的文件添加/删除，处理过程中止，处理完成后撤销重命名，明亮/黑暗模式切换

<img width="946" height="713" alt="ScreenShot_2026-05-07_204211_401" src="https://github.com/user-attachments/assets/60073f01-bb4c-423c-bd28-b74acc48c2cb" />
<img width="946" height="713" alt="ScreenShot_2026-05-07_204155_849" src="https://github.com/user-attachments/assets/287b53d6-79e6-4ba6-a94c-a9aa7c29a2d9" />
<img width="946" height="713" alt="FileUploader" src="https://github.com/user-attachments/assets/a7c448c3-252f-4d94-a5ff-88f0a8e2ad23" />
<img width="946" height="713" alt="ScreenShot_2026-05-07_204117_330" src="https://github.com/user-attachments/assets/2b4a8ec5-bb12-4ee0-abd8-5eb37ff9a559" />
<img width="944" height="711" alt="ScreenShot_2026-05-07_204102_632" src="https://github.com/user-attachments/assets/56e9bc1f-b878-49d4-8f9a-2b1027550c92" />


## 系统要求

- Windows 10/11 (x64)
- 如需重命名视频，需安装 [ffmpeg](https://www.ffmpeg.org/download.html)
- 如使用 Ollama，需安装 [Ollama](https://ollama.com/download) 并下载至少一个模型（推荐 llava）
- 如使用 LM Studio，需安装 [LM Studio](https://lmstudio.ai/) 并加载模型
- 如使用 OpenAI，需有有效的 API Key

## 使用方法

### 直接运行（已打包版本）

1. 解压 `AI-Renamer-Windows-v1.0.0.zip`
2. 双击 `AI Renamer.exe` 即可运行

### 从源码构建

```bash
# 1. 安装依赖
npm install

# 2. 开发模式运行
npm start

# 3. 打包为 Windows exe（需要在 Windows 上操作，或安装 wine）
npm run build

# 4. 打包为目录格式
npm run build:dir
```

## 操作步骤

1. **选择文件/文件夹** - 拖放或点击按钮选择要处理的路径
2. **配置设置** - 在快速设置栏选择 Provider、Model、命名风格等
3. **详细设置** - 点击右上角设置图标，可配置 Base URL、API Key、自定义提示词等
4. **选择文件** - 在文件列表中勾选要处理的文件
5. **开始重命名** - 点击"开始重命名"按钮，等待 AI 处理
6. **查看结果** - 进度面板显示每个文件的处理状态和结果

## 配置说明

| 选项 | 说明 | 默认值 |
|------|------|--------|
| Provider | AI 提供商 | Ollama |
| Base URL | API 地址 | 根据提供商自动设置 |
| API Key | OpenAI 密钥 | - |
| Model | AI 模型 | 自动选择 |
| 命名风格 | 文件名格式 | kebab-case |
| 最大字符数 | 文件名长度限制 | 20 |
| 输出语言 | 重命名语言 | English |
| 视频帧数 | 视频关键帧提取数 | 3 |
| 包含子目录 | 是否递归处理子目录 | 否 |
| 自定义提示词 | 附加 AI 指令 | - |

## 技术栈

- **Electron** v33 - 桌面应用框架
- **原生 HTML/CSS/JS** - 渲染进程 UI
- **Ollama / OpenAI / LM Studio API** - AI 模型调用
- **ffmpeg** - 视频帧提取
- **change-case** - 命名风格转换
- **pdf-parse** - PDF 文件解析

## License

GPL-3.0

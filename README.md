# 快速剪辑（Quick Cut）

[![CI](https://github.com/maopai/quick-cut/actions/workflows/ci.yml/badge.svg)](https://github.com/maopai/quick-cut/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

快速剪辑是一个完全本地运行的跨平台视频片段裁切与合并工具。选择一个源视频，通过独立的“时 / 分 / 秒”输入框设置任意数量的时间段，核对每段的起点帧和终点帧，再按列表顺序输出为一个新视频。

## 下载

请前往 [GitHub Releases](https://github.com/maopai/quick-cut/releases) 下载当前版本：

- macOS Apple Silicon：`Quick-Cut-1.4.0-arm64.dmg` 或 `.zip`
- macOS Intel：`Quick-Cut-1.4.0-x64.dmg` 或 `.zip`
- Windows 64 位：`Quick-Cut-Setup-1.4.0-x64.exe` 为安装版，`Quick-Cut-Portable-1.4.0-x64.exe` 为免安装版

当前版本未进行 Apple Developer ID 或 Windows 代码签名，首次运行时系统可能显示“开发者未验证”或 SmartScreen 提示。

## 已实现功能

- Windows 与 macOS 桌面应用（Electron + React）
- 通过文件选择器或拖放到窗口任意位置读取 MP4、MOV、MKV、AVI、WebM、M4V、MTS、M2TS 等常见视频文件
- 剪辑前输入片段数量，之后仍可增减、删除和上下调整顺序
- 时间采用“时 / 分 / 秒”三段式输入，单个数字自动补零；分钟和秒限制为 `00–59`
- 每个片段独立完整显示起点帧和终点帧，不裁切画面，也不加载或播放完整视频
- 预览帧默认最高为 1080p；高分辨率视频等比缩小到 1920×1080 边界内，低于该范围时保持源分辨率且不放大
- 校验空值、时间格式、起止顺序以及是否超过源视频时长
- 精准模式按列表顺序逐帧裁切，支持 Apple VideoToolbox、NVIDIA NVENC、AMD AMF、Intel Quick Sync 和 CPU 软件编码
- 自动模式优先尝试当前系统支持的硬件编码器，硬件初始化失败时自动回退 CPU
- 精准模式包含可展开的“画质选项”二级菜单，提供跟随源参数、高画质、均衡、小体积和自定义码率预设
- 可选择保持源分辨率或最高 4K、1080p、720p，支持保持源帧率或输出 60、30、24 FPS
- 音频码率支持跟随源文件以及 320、192、128、96 kbps
- 极速模式直接复制原始码流，画质与编码参数完全不变，但切点会落在附近关键帧
- 新文件默认命名为 `原文件名_new.原扩展名`，默认保存到源视频目录，也可修改文件名和保存位置
- 显示实时处理进度，支持取消
- FFmpeg 与 FFprobe 随应用打包，最终用户不需要单独安装
- 视频分辨率、帧率、像素格式、视频编码类型、音频编码类型和采样率按源文件保持

## 关于“保持原编码”

精准模式为了让 `HH:MM:SS` 指定的切点准确生效，会重新编码，而不是只在关键帧处截断。输出会使用与源文件相同的编码类型（例如 H.264 仍输出 H.264、HEVC 仍输出 HEVC）、分辨率、帧率、像素格式和接近源文件的目标码率。编码器的具体实现参数不可能从所有成品视频中完整反推，因此文件哈希和最终文件大小不会与源文件完全一致。

极速模式使用 FFmpeg concat demuxer 的 `inpoint/outpoint` 和 `-c copy`，不进行视频或音频重新编码。它通常只需普通文件复制所需的时间，但受 GOP/关键帧位置限制，实际切点可能比输入值提前或延后数秒。

常见视频编码映射：H.264、HEVC/H.265、VP8、VP9、AV1、MPEG-4、ProRes、MJPEG、Theora。常见音频编码映射：AAC、MP3、Opus、Vorbis、FLAC、ALAC 和 PCM。

## 本地开发

需要 Node.js 20.19 或更高版本（推荐使用 Node.js 22 LTS）。

```bash
npm install
npm run dev
```

测试和检查：

```bash
npm test
npm run lint
npm run build:web
```

## 打包

在 macOS 上生成 `.dmg` 和 `.zip`：

```bash
npm run build
```

在 64 位 Windows 上生成 x64 NSIS 安装包和免安装版：

```powershell
npm run build
```

也可以显式执行：

```powershell
npm run build:win:x64
```

产物位于 `release/`。建议分别在对应系统上构建；仓库中的 GitHub Actions 配置会生成 macOS Intel、macOS Apple Silicon 和 Windows x64 三套版本。不支持 Windows 32 位。

当前项目没有配置 Apple Developer ID 和 Windows 代码签名证书，因此直接分发时系统可能显示“开发者未验证”或 SmartScreen 提示。正式发布前应在构建环境中配置对应签名证书。

## 项目结构

```text
electron/
  main.cjs       Electron 窗口、文件选择和 IPC
  preload.cjs    安全的渲染层接口
  ffmpeg.cjs     元数据、帧提取、裁切合并和进度
src/
  App.jsx        桌面界面和交互
  time.js        HH:MM:SS 解析与校验
  styles.css     响应式视觉样式
```

## 隐私与安全

视频选择、预览帧提取和剪辑导出均在本机完成。本项目不包含账号系统、云端上传或遥测代码。

如果发现安全问题，请不要在公开 Issue 中披露利用细节，请参阅 [SECURITY.md](SECURITY.md)。

## 参与贡献

欢迎提交 Issue 和 Pull Request。开始前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 第三方组件

应用通过 `ffmpeg-static` 和 `@ffprobe-installer/ffprobe` 使用 FFmpeg/FFprobe。FFmpeg、FFprobe 及其他第三方依赖适用各自的许可证，具体以对应上游项目和依赖包中的许可信息为准。

## 许可证

本项目源码采用 [MIT License](LICENSE) 开源。

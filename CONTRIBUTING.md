# 参与贡献

感谢你为快速剪辑贡献代码、文档或问题报告。

## 提交问题

- 先搜索现有 Issue，避免重复提交。
- Bug 报告请写明操作系统、应用版本、输入视频格式、复现步骤和实际结果。
- 请勿上传含隐私内容的视频；如需样本，请使用可公开的最小复现文件。
- 安全漏洞请按 [SECURITY.md](SECURITY.md) 中的方式报告。

## 本地开发

```bash
npm install
npm run dev
```

提交 Pull Request 前，请确保以下命令全部通过：

```bash
npm test
npm run lint
npm run build:web
```

请让每个 Pull Request 聚焦一个清晰的问题，并在描述中说明改动目的和验证方式。

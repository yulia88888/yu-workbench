# 瑜的工作台 · GitHub Pages 部署指南

纯前端零后端 PWA，托管到 GitHub Pages 后即可**每天自动刷新爆款数据**，手机打开即用。

## 这个仓库包含什么
- `index.html` 主程序（四模块工作台）
- `manifest.webmanifest` / `sw.js` / `icon.svg` PWA 配置
- `gen_daily.py` 每日数据生成脚本（抓 B站/微博真实链接 + 抖音/小红书/快手精选话题）
- `.github/workflows/refresh.yml` 每日定时 Action（自动跑脚本并提交 `daily.json`）
- `daily.json` 前端自动导入的数据

## 一次性部署步骤（约 5 分钟）

### 1. 在 GitHub 新建一个空仓库
- 仓库名随意，例如 `yu-workbench`
- **不要**勾选 "Add a README"（保持空仓库）
- 选 Public（Pages 免费需要 Public，除非你有 Pro）

### 2. 把本文件夹内容推上去
在**你自己的电脑**上（已装 git）：
```bash
cd 你下载解压的这个文件夹
git init
git add .
git commit -m "init 瑜的工作台"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```
> 如果你把文件交给我、给我一个 GitHub Token（repo 权限），我也可以直接帮你推。

### 3. 开启 GitHub Pages
- 进仓库 `Settings → Pages`
- Source 选 **Deploy from a branch**
- Branch 选 `main` ，目录选 `/ (root)`
- 保存，等 1~2 分钟，会得到一个 `https://你的用户名.github.io/你的仓库名/` 的网址

### 4. 开启每日自动刷新
- 进仓库 `Settings → Actions → General`，确保 `Workflow permissions` 选 **Read and write permissions**（让 Action 能把 daily.json 提交回仓库）
- 之后每天北京时间 09:30 自动跑一次，站点打开即是最新数据
- 想立刻看效果：进 `Actions` 标签 → 选 `每日刷新爆款数据` → `Run workflow` 手动跑一次

## 使用
手机浏览器打开你的 Pages 网址 → 添加到主屏幕（PWA）→ 每天自动显示当日爆款。
- 卡片「▶ 跳原视频」= 真实原片（B站/微博可用；抖音/小红书/快手为搜索入口）
- 卡片「📋 复制链接」= 一键复制该链接

## 说明
- 抖音/小红书/快手不向外部开放具体视频直链，所以这部分是**精选搜索话题**（点开去搜最新爆款），符合平台规则且稳定。
- B站/微博用公开接口抓**真实链接**，失败时有兜底不会空。
- 想要更高品质（用 AI 联网挑具体抖音爆款视频）的版本，可继续用聊天里的每日自动化，复制进工作台即可。

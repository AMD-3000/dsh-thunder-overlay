# 安装说明（给另一个 DSH 的 agent）

包名 `dsh-thunder-overlay`，版本 0.1.0，单文件分发：`dsh-thunder-overlay-0.1.0.tgz`。

## 环境

- 目标机器已装 DSH（Web / 桌面 / Mobile 都可以），引擎 `0.2.1-rc.2` 上下
- Node ≥ 22.12，profile 目录里已有 `package.json`（含 `dsh.profile.bundles`）

## 方式 A：用 DSH 的 plugin_manager（推荐）

把 tgz 传到目标机器，在会话里让 agent 调用：

```
plugin_manager install_bundle
  target: "file:/绝对路径/dsh-thunder-overlay-0.1.0.tgz"
```

它会把包装进当前 profile、写入 `dsh.profile.bundles`，并尽量热应用。

## 方式 B：手工

```sh
cd ~/dsh-home/profiles/web        # 你的 profile 目录（含 package.json / cordis.yml）
pnpm add /绝对路径/dsh-thunder-overlay-0.1.0.tgz
```

然后把 `"dsh-thunder-overlay"` 加进 `package.json` 的 `dsh.profile.bundles` 数组，重启引擎，刷新 Web GUI。

## 安装后

- 入口在 **设置 → 雷霆大白字**
- 四类提示各自可开关：用户发消息（开始）、智能体忙碌（忙碌文案）、智能体完成（完成文案）、工具调用（动作词）
- 可调字号、停留、间隔、背景（模糊／纯色／压暗）、模糊半径、压暗量、底部小字
- 设置存在目标机器浏览器的 `localStorage`（键名 `dsh-thunder-overlay:config`），不写 profile 配置

## 说明

- **大字字体内嵌、小字字体远程**：Noto Sans SC Black 的 69 字子集 base64 内嵌（OFL，可再分发）；底部小字的 Endfield **不随包分发**，运行时从上游仓库抓取并缓存，失败退回系统字体（设置里可关）
- **无安装脚本**：没有 postinstall，安装不会执行任何构建
- 宿主半 `lib/index.js` 是空 `apply`，所有逻辑都在 `lib/client.js`（浏览器端）
- 卸载：`pnpm remove dsh-thunder-overlay`，并从 `dsh.profile.bundles` 里删掉对应项

## 卸载

```sh
cd ~/dsh-home/profiles/web
pnpm remove dsh-thunder-overlay
# 编辑 package.json，从 dsh.profile.bundles 移除 "dsh-thunder-overlay"
```

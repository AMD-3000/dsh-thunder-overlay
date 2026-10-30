# dsh-thunder-overlay

DSH Web GUI 插件：**会话在干活时，整帧砸下一记大白字**——超大纯白字、毛玻璃背景、轻微故障感，出现即走。灵感来自游戏《Control》的区域标题卡。

- 挂载点：`shell.overlay`（框架级浮层，盖在所有列之上，不在滚动容器里）
- 状态源：`ctx.uiSession.sessionStatus` + 会话事件流（`user/message`、`tool/call`）
- 纯视觉：`pointer-events: none`，不拦点击、不改任何业务状态

<p align="center">
  <img src="images/preview-start.png" width="48%" alt="开始挑战" />
  <img src="images/preview-run.png" width="48%" alt="执行命令" />
</p>

## 触发逻辑

1. **用户发消息**（新的 `user/message`）→ 弹「开始挑战」
2. **智能体进入忙碌**（`running` 由空闲变忙碌）→ 弹「忙碌文案」（默认「大肥鱼」）
3. **工具调用**（新的 `tool/call`）→ 换一次动作词（`bash`→执行命令、`run_code`→执行代码、`web_search`→网络搜索……）
4. **智能体干完活**（`running` 由忙碌变空闲）→ 弹「完成文案」（默认「挑战成功」）
5. 每帧停留 `duration` 后淡出并卸载；新动作会直接顶掉还没消失的旧帧

四类触发各有独立开关，文案可在设置页改。
## 设置页

**设置 → 雷霆大白字**：

| 项 | 说明 |
|---|---|
| 启用 | 总开关 |
| 用户发消息 / 智能体忙碌 / 智能体完成 / 工具调用 | 四类提示各自开关 |
| 大字 | 跟随动作 / 固定词 |
| 忙碌文案、完成文案 | 输入框，随你写 |
| 字号 / 停留 / 间隔 | 滑杆 |
| 背景 | 模糊（毛玻璃）/ 纯色 / 压暗 |
| 模糊半径 / 压暗量 / 底色 | 随背景方式出现 |
| 底部小字 | 开关 |
| 远程字体 | 关掉就不去网上抓字体 |
| 预览一次 | 按当前设置冒一帧（会先关掉设置面板） |

改动即时生效，存在本机浏览器 `localStorage`（键 `dsh-thunder-overlay:config`），不写 profile 配置。

## 配置

不改设置页也可以直接改 `lib/client.js` 顶部的 `DEFAULTS`：

| 键 | 默认 | 含义 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `mode` | `'action'` | `'action'` 大字跟随动作；`'fixed'` 永远写 `word` |
| `word` | `'雷霆嘎巴'` | fixed 模式的大字 / 无动作时的兜底字 |
| `openingWord` | `'开始挑战'` | 用户发消息时弹的字 |
| `busyWord` | `'大肥鱼'` | 智能体进入忙碌时弹的字 |
| `finishWord` | `'挑战成功'` | 智能体干完活时弹的字 |
| `detail` | `true` | 是否显示底部小字 |
| `duration` | `500` | 单帧停留毫秒 |
| `cooldown` | `0` | 两次白字最短间隔 |
| `scale` | `1` | 字号倍率 |
| `backdrop` | `'blur'` | `'blur'` / `'solid'` / `'veil'` |
| `backdropBlur` | `18` | 模糊半径（会随屏宽缩放） |
| `backdropDim` | `0.12` | 压暗量 |
| `backdropColor` | `'#0e1116'` | solid 模式底色 |
| `backdropAlpha` | `0.94` | solid 模式不透明度 |
| `showStart` / `showBusy` / `showActions` / `showFinish` | `true` | 四类触发的默认开关 |
| `remoteFont` | `true` | 是否从上游抓 Endfield 小字字体 |

词表在同文件 `TOOL_WORDS`（`run_code`→执行代码；没收录的工具一律显示「执行」，底部小字里能看到真实工具名）；也可以用 `labels: { bash: '我的词' }` 覆盖单个工具。

## 远程字体（不随包分发）

底部的 Endfield 小字**不打包**：运行时从上游仓库抓取（jsDelivr → GitHub raw 依次尝试），成功后缓存在本机 `localStorage`（`dsh-thunder-overlay:font`），失败就退回系统等宽字体。设置页有「远程字体」开关可以关掉。

因此包本身只内嵌了 OFL 授权的 Noto Sans SC 子集，Endfield 不参与再分发。详见 [THIRD_PARTY.md](THIRD_PARTY.md)。

## 已知边界

- 只认"当前选中的会话"；后台会话在干活不会冒字
- 页面刷新后才加载新版客户端代码（引擎侧宿主半热生效）
- `prefers-reduced-motion: reduce` 时退化为纯淡入淡出

## 结构

```
package.json        # dsh.bundle.patch + dsh.client 声明
cordis.patch.yml    # 把宿主半插入 loader（宿主半是空 apply）
lib/index.js        # 宿主半：无行为
lib/client.js       # 浏览器半：全部实现（手写 lazy-CJS，无需编译）
```

## 安装

让目标机器上的 agent 直接执行：

```
plugin_manager install_bundle
  target: "github:AMD-3000/dsh-thunder-overlay"
```

它会拉取仓库、装进当前 profile 并写入 `dsh.profile.bundles`。装完刷新 Web GUI，入口在 **设置 → 雷霆大白字**。

手工等价操作：在 profile 目录 `pnpm add github:AMD-3000/dsh-thunder-overlay`，把 `dsh-thunder-overlay` 加进 `dsh.profile.bundles`，重启引擎。

## 许可证

代码 MIT（见 [LICENSE](LICENSE)）；内嵌的 Noto Sans SC 子集为 OFL，全文见 [OFL-NotoSansSC.txt](OFL-NotoSansSC.txt)；Endfield 不随包分发。

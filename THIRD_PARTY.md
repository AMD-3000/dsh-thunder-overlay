# 第三方资源

## Noto Sans SC（Black 字重子集）

- 来源：Google Fonts，通过 fonts.googleapis.cn 的 `text=` 子集接口生成
- 授权：SIL Open Font License 1.1（OFL）
- 用途：大字正文字形，已按本插件词表裁成 69 个汉字的 woff2，base64 内嵌于 `lib/client.js`（可再分发）

## Endfield（lhclbt/Endfield_Font）

- 来源：https://github.com/lhclbt/Endfield_Font
- 授权：**仓库未声明任何许可证**
- 处理：**不随本包分发**。插件在运行时按需从上游抓取，顺序为
  1. `https://cdn.jsdelivr.net/gh/lhclbt/Endfield_Font@main/EndfieldByButan.ttf`
  2. `https://raw.githubusercontent.com/lhclbt/Endfield_Font/main/EndfieldByButan.ttf`

  抓取成功后缓存在本机 `localStorage`（键 `dsh-thunder-overlay:font`）；失败则底部小字退回系统等宽字体。
- 关闭方式：设置 → 雷霆大白字 →「远程字体」开关，或 `DEFAULTS.remoteFont = false`

### OFL 合规

Noto Sans SC 的完整许可证文本见仓库根目录 [`OFL-NotoSansSC.txt`](OFL-NotoSansSC.txt)（SIL Open Font License 1.1，版权行：Copyright 2014-2021 Adobe, with Reserved Font Name 'Source'）。

本包对该字体的使用方式：**仅做子集并嵌入程序**（69 个汉字，woff2 base64），不单独分发字体文件、不售卖字体，符合 OFL 对"随软件一同分发"的要求。

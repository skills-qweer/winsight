# WinSight（窗界之眼）

WinSight 是面向 Codex 的 Windows 窗口观察与受控操作插件。它用于普通截图无法可靠工作时，帮助 Codex 找到正确窗口、直接捕获画面、识别黑帧、读取文字、观察变化、映射坐标，并在安全的本地应用界面执行经过二次校验的点击或按键。

它适用于原生 Windows、Chromium/Electron、Cocos、Qt、模拟器、游戏编辑器等桌面窗口，尤其适合截图返回黑屏、窗口被遮挡、DPI 导致坐标偏移，或 `Windows.Graphics.Capture` 报兼容性错误的情况。

## 主要作用

| 能力 | 说明 |
| --- | --- |
| 窗口发现 | 按标题、进程和 HWND 列出并锁定准确窗口 |
| 多后端截图 | 自动尝试 WGC、PrintWindow、DXGI 和可见屏幕 GDI |
| 黑帧诊断 | 检查 PNG、亮度和色彩范围，报告可能的黑屏或后端错误 |
| 局部截图 | 按窗口、客户区、归一化或逻辑坐标捕获指定区域 |
| 变化观察 | 跟踪窗口移动、缩放、重建和画面实质变化 |
| 有界录制 | 在时长、帧数和字节上限内记录证据帧和 JSON 清单 |
| 本地 OCR | 使用 `Windows.Media.Ocr` 识别文字并返回词语边界，不上传图片 |
| 坐标映射 | 在截图像素、客户区、屏幕、归一化和应用逻辑坐标间转换 |
| 受控输入 | 先准备并复核目标，再用短效单次令牌执行安全点击或按键 |

## 什么时候使用

- 普通 Computer Use 截图是黑色、空白或内容不完整。
- 窗口被其他应用遮挡，但仍需要读取 Electron、Cocos、Qt 等窗口内容。
- Windows 10 出现 `SetIsBorderRequired`、`E_NOINTERFACE` 或 `0x80004002` 错误。
- 需要准确识别目标窗口，而不是依据可能重复的标题盲点坐标。
- 窗口移动、缩放或跨 DPI 显示器后，需要重新计算点击位置。
- 需要观察一个区域是否发生实质变化，或保存一小段有界证据序列。
- 需要在本机识别窗口文字及其位置。
- 需要在已经授权的游戏、模拟器或编辑器界面执行安全本地操作。

## 在 Codex 中使用

安装并启用 WinSight 后，可以直接在对话里调用 `$winsight`。

### 查找并截图窗口

```text
$winsight 列出当前 Windows 窗口，找到微信开发者工具并截图；如果标题重复，先让我看到候选窗口。
```

```text
$winsight 捕获标题包含 FogHarborEchoes 的窗口。普通截图黑屏时自动诊断并切换后端。
```

### 截取指定区域或识别文字

```text
$winsight 截取这个窗口右侧模拟器区域，并说明截图使用的客户区和屏幕坐标。
```

```text
$winsight 对当前窗口中央区域做本地 OCR，返回识别文字和每个词的位置。
```

### 观察窗口变化

```text
$winsight 观察这个窗口 20 秒，告诉我窗口是否移动、重建，以及画面是否发生实质变化。
```

观察会话有边界：闲置十分钟后失效，录制也受时长、帧数和总字节上限约束，不会建立隐藏的无限后台录制。

### 映射并执行安全本地操作

```text
$winsight 把游戏逻辑分辨率 1920×1080 中的坐标 (960, 540) 映射到当前窗口，准备点击；复核窗口和画面仍一致后执行，并再次截图验证结果。
```

WinSight 不会根据旧截图直接盲点坐标。输入采用两步握手：

1. `prepare_input` 锁定 HWND、标题、边界、DPI、坐标和动作，并返回当前画面。
2. `execute_prepared_input` 只在 30 秒内且窗口身份与布局未变化时执行。
3. 令牌单次使用；执行后必须重新截图验证可见结果。

需要后台操作时使用 `action=invoke`，按已观察的按钮位置准备，再核对返回的控件名称、身份和当前图片后执行。
它只调用按钮的 UI Automation InvokePattern，不移动鼠标、不切换前台；不支持、禁用、歧义或变化的按钮
直接失败，不自动回退为前台点击。窗口和控件的身份都绑定到单次令牌。普通 `click` / `key` 仍需要前台。
应用响应“打开”等操作时可能自己显示新窗口，后台调用不能保证应用自身永不改变焦点。

Windows 10 / PowerShell 5 修复与实测见 `docs/COMPLETED.md` 的 2026-10-31 记录。
已安装文件的旧工具 schema 需要重新连接插件后才显示 `invoke`；不要向仍声明旧枚举的连接猜传新参数。
插件升级可能覆盖本机修正，应先与该提交核对，不能盲目覆盖新版。


## 坐标类型

| 类型 | 适用场景 |
| --- | --- |
| `window_pixels` | 坐标来自 WinSight 返回的整窗 PNG |
| `client_pixels` | 坐标位于窗口客户区，不含标题栏和边框 |
| `normalized` | 使用 0–1 的相对坐标，适合窗口尺寸可能变化的区域 |
| `logical` | 应用或游戏使用固定逻辑分辨率，需要同时提供宽高 |

窗口移动、缩放、DPI 改变、标题变化或 HWND 重建后必须重新映射。

## 截图后端

`backend=auto` 默认按以下顺序尝试：

1. WGC：优先捕获指定 HWND，可在窗口被遮挡时工作。
2. `PrintWindow(PW_RENDERFULLCONTENT)`：兼容 Chromium、Electron、Cocos、Qt 等窗口。
3. DXGI Desktop Duplication：从真实桌面画面裁切窗口，因此会包含遮挡它的其他窗口。
4. 可见屏幕 GDI：最终兜底，仅能得到当前屏幕可见内容。

WinSight 会返回实际使用的后端、窗口元数据和 `LikelyBlackFrame` 结果。只有 PNG 有效且 `LikelyBlackFrame=false` 时，才应根据画面继续推理。后端细节见 [backends.md](skills/winsight/references/backends.md)。

## 安全边界

WinSight 的输入能力仅用于用户已经授权的安全本地应用操作。

禁止用它处理或自动操作：

- 登录、密码、验证码和 CAPTCHA；
- 支付、转账和购买确认；
- 权限、隐私、安全设置和 Windows 安全界面；
- 密码管理器或其他敏感凭据表面；
- 未经单独明确授权的上传、发布、发消息、共享变更或软件安装。

可使用 `emergency_stop_input` 立即取消所有待执行输入并暂停操作；恢复安全本地操作需要调用 `resume_input`。

## 插件、技能与源码

本仓库同时包含：

- `.codex-plugin/plugin.json`：Codex 插件清单；
- `.mcp.json` 与 `mcp/server.mjs`：WinSight MCP 服务；
- `skills/winsight/`：可独立发现的 Codex 技能和 PowerShell 兜底脚本。

GitHub 源码仓库、Codex 已安装插件和 `$CODEX_HOME\skills\winsight` 下的独立技能副本不是同一个状态。仓库更新后，已安装副本需要通过对应安装渠道升级或重新同步，不能只凭 GitHub 的更新时间判断本机已经更新。

## 脚本兜底与开发测试

正常使用优先调用 WinSight MCP 工具。只有 MCP 不可用或进行开发诊断时才直接运行脚本。

诊断环境：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File skills\winsight\scripts\winsight.ps1 -Action diagnose
```

按 HWND 捕获：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File skills\winsight\scripts\winsight.ps1 `
  -Action capture -Hwnd 123456 -Backend auto
```

项目验证：

```powershell
node scripts/test_mcp.mjs
node scripts/test_observation.mjs
node scripts/test_tracking_move.mjs
python scripts/check_project_docs.py
```

受监督的真实输入测试必须显式提供窗口标题、像素坐标和 `--execute`，并检查操作后的截图。正常使用不要直接调用 `input.ps1`，因为 MCP 的准备/执行握手额外提供了窗口漂移和令牌重放保护。

## 实现与兼容性

- WGC 在 Windows 10 build 19045 上不会调用不受支持的 `IsBorderRequired`。
- 缺少本机 SDK contract 元数据时，首次使用会从 NuGet 下载固定版本的 Microsoft SDK Contracts，验证 SHA-256 后只缓存编译元数据；之后可以离线运行。
- OCR 完全在本机通过 `Windows.Media.Ocr` 执行，返回词语边界，但该提供者不暴露置信度。
- 实现使用公开 Windows API，不复制流媒体软件的专有代码，也不提供 DRM 绕过或隐藏进程注入。

## 项目状态

不要从旧对话推断当前开发状态。维护仓库前依次阅读：

- [PROJECT_STATUS.md](docs/PROJECT_STATUS.md)
- [CURRENT_TASK.md](docs/CURRENT_TASK.md)
- [ROADMAP.md](docs/ROADMAP.md)
- [ACCEPTANCE.md](docs/ACCEPTANCE.md)

完成证据保存在 [COMPLETED.md](docs/COMPLETED.md)，设计决策保存在 [DECISION_LOG.md](docs/DECISION_LOG.md)。自动检查通过与用户验收是两个不同状态。

## 许可

本项目采用 [MIT License](LICENSE)。

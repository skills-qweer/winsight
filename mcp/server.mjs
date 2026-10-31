import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPT_ROOT = path.join(ROOT, "skills", "winsight", "scripts");
const CAPTURE_SCRIPT = path.join(SCRIPT_ROOT, "winsight.ps1");
const INPUT_SCRIPT = path.join(SCRIPT_ROOT, "input.ps1");
const ANALYSIS_SCRIPT = path.join(SCRIPT_ROOT, "analysis.ps1");
const OCR_SCRIPT = path.join(SCRIPT_ROOT, "ocr.ps1");
const SERVER_NAME = "WinSight MCP";
const SERVER_VERSION = "0.4.0";
const TOKEN_TTL_MS = 30_000;
const preparedInputs = new Map();
const observationSessions = new Map();
const OBSERVATION_TTL_MS = 10 * 60_000;
const MAX_OBSERVATION_SESSIONS = 16;
let inputEnabled = true;

const JsonRpcError = {
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};

const BLOCKED_PROCESS = /^(LockApp|LogonUI|CredentialUIBroker|consent|SecurityHealthUI|KeePass|Bitwarden|1Password|Enpass|LastPass)$/i;
const BLOCKED_TITLE = /(password|passcode|sign[ -]?in|log[ -]?in|captcha|payment|credential|验证码|密码|登录|支付|付款|权限|permission|security|安全)/i;
const ALLOWED_KEYS = new Set(["ENTER", "ESCAPE", "SPACE", "TAB", "UP", "DOWN", "LEFT", "RIGHT"]);

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function textResult(text, structuredContent = {}) {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

function imageResult(text, pngBytes, structuredContent = {}) {
  return {
    content: [
      { type: "text", text },
      { type: "image", data: pngBytes.toString("base64"), mimeType: "image/png" },
    ],
    structuredContent,
  };
}

function requireNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return value;
}

function cleanupTokens() {
  const now = Date.now();
  for (const [token, prepared] of preparedInputs) {
    if (prepared.used || prepared.expiresAt <= now) preparedInputs.delete(token);
  }
  for (const [sessionId, session] of observationSessions) {
    if (session.expiresAt <= now) observationSessions.delete(sessionId);
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runPowerShell(script, args = []) {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...args.map(String)],
    {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 60_000,
    },
  );
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error(`PowerShell script returned no JSON: ${path.basename(script)}`);
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`PowerShell script returned invalid JSON (${path.basename(script)}): ${error instanceof Error ? error.message : String(error)}; prefix=${JSON.stringify(trimmed.slice(0, 500))}`);
  }
}

function normalizeWindowList(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.value)) return value.value;
  return value ? [value] : [];
}

async function listWindows() {
  return normalizeWindowList(await runPowerShell(CAPTURE_SCRIPT, ["-Action", "list"]));
}

function selectorCount(args) {
  return [args?.hwnd !== undefined, Boolean(args?.title), Boolean(args?.process)].filter(Boolean).length;
}

async function resolveWindow(args) {
  if (selectorCount(args) !== 1) {
    throw new Error("Provide exactly one selector: hwnd, title, or process.");
  }
  const windows = await listWindows();
  let matches;
  if (args.hwnd !== undefined) {
    const hwnd = Number(args.hwnd);
    matches = windows.filter((window) => Number(window.hwnd) === hwnd);
  } else if (args.title) {
    const needle = String(args.title).toLocaleLowerCase();
    matches = windows.filter((window) => String(window.title ?? "").toLocaleLowerCase().includes(needle));
  } else {
    const needle = String(args.process).toLocaleLowerCase();
    matches = windows.filter((window) => String(window.process ?? "").toLocaleLowerCase().includes(needle));
  }
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one matching window, found ${matches.length}. Use list_windows and select by hwnd.`);
  }
  return matches[0];
}

function assertInputSurfaceAllowed(window) {
  const processName = String(window.process ?? "");
  const title = String(window.title ?? "");
  const creatorLoginState = /^Untitled\s+-\s+.*Cocos Creator/i.test(title);
  if (BLOCKED_PROCESS.test(processName) || BLOCKED_TITLE.test(title) || creatorLoginState) {
    throw new Error("WinSight refuses input on authentication, payment, permission, password-manager, or Windows security surfaces.");
  }
}

function rectFor(window, area) {
  const rect = area === "client" ? window.clientBounds : window.bounds;
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    throw new Error(`The selected ${area} area has invalid bounds.`);
  }
  return rect;
}

function mapCoordinates(window, args) {
  const area = args.area ?? "window";
  if (!["window", "client"].includes(area)) throw new Error("area must be window or client.");
  const coordinateSpace = args.coordinateSpace ?? "window_pixels";
  const rect = rectFor(window, area);
  const x = requireNumber(args.x, "x");
  const y = requireNumber(args.y, "y");
  let pixelX;
  let pixelY;

  if (coordinateSpace === "window_pixels" || coordinateSpace === "client_pixels") {
    pixelX = x;
    pixelY = y;
  } else if (coordinateSpace === "normalized") {
    if (x < 0 || x > 1 || y < 0 || y > 1) throw new Error("Normalized coordinates must be between 0 and 1.");
    pixelX = x * Math.max(0, rect.width - 1);
    pixelY = y * Math.max(0, rect.height - 1);
  } else if (coordinateSpace === "logical") {
    const logicalWidth = requireNumber(args.logicalWidth, "logicalWidth");
    const logicalHeight = requireNumber(args.logicalHeight, "logicalHeight");
    if (logicalWidth <= 0 || logicalHeight <= 0) throw new Error("Logical dimensions must be positive.");
    pixelX = (x / logicalWidth) * rect.width;
    pixelY = (y / logicalHeight) * rect.height;
  } else {
    throw new Error("coordinateSpace must be window_pixels, client_pixels, normalized, or logical.");
  }

  if (pixelX < 0 || pixelX >= rect.width || pixelY < 0 || pixelY >= rect.height) {
    throw new Error("Mapped coordinate is outside the selected area.");
  }

  const screenX = Math.round(rect.x + pixelX);
  const screenY = Math.round(rect.y + pixelY);
  return {
    area,
    coordinateSpace,
    source: { x, y, logicalWidth: args.logicalWidth ?? null, logicalHeight: args.logicalHeight ?? null },
    areaBounds: rect,
    areaPixel: { x: Math.round(pixelX), y: Math.round(pixelY) },
    screen: { x: screenX, y: screenY },
    capturePixel: {
      x: screenX - window.bounds.x,
      y: screenY - window.bounds.y,
    },
    dpi: window.dpi ?? 96,
    dpiScale: window.dpiScale ?? 1,
  };
}

function mapRegion(window, args) {
  const area = args.area ?? "window";
  if (!["window", "client"].includes(area)) throw new Error("area must be window or client.");
  const coordinateSpace = args.coordinateSpace ?? "window_pixels";
  const rect = rectFor(window, area);
  const x = requireNumber(args.x, "x");
  const y = requireNumber(args.y, "y");
  const width = requireNumber(args.width, "width");
  const height = requireNumber(args.height, "height");
  let pixelX;
  let pixelY;
  let pixelWidth;
  let pixelHeight;

  if (coordinateSpace === "window_pixels" || coordinateSpace === "client_pixels") {
    pixelX = x;
    pixelY = y;
    pixelWidth = width;
    pixelHeight = height;
  } else if (coordinateSpace === "normalized") {
    if ([x, y, width, height].some((value) => value < 0 || value > 1) || x + width > 1 || y + height > 1) {
      throw new Error("Normalized region values must be between 0 and 1 and remain inside the selected area.");
    }
    pixelX = x * rect.width;
    pixelY = y * rect.height;
    pixelWidth = width * rect.width;
    pixelHeight = height * rect.height;
  } else if (coordinateSpace === "logical") {
    const logicalWidth = requireNumber(args.logicalWidth, "logicalWidth");
    const logicalHeight = requireNumber(args.logicalHeight, "logicalHeight");
    if (logicalWidth <= 0 || logicalHeight <= 0) throw new Error("Logical dimensions must be positive.");
    pixelX = (x / logicalWidth) * rect.width;
    pixelY = (y / logicalHeight) * rect.height;
    pixelWidth = (width / logicalWidth) * rect.width;
    pixelHeight = (height / logicalHeight) * rect.height;
  } else {
    throw new Error("coordinateSpace must be window_pixels, client_pixels, normalized, or logical.");
  }

  const left = Math.round(pixelX);
  const top = Math.round(pixelY);
  const right = Math.round(pixelX + pixelWidth);
  const bottom = Math.round(pixelY + pixelHeight);
  if (left < 0 || top < 0 || right > rect.width || bottom > rect.height || right <= left || bottom <= top) {
    throw new Error("Mapped region is empty or outside the selected area.");
  }
  const screen = { x: rect.x + left, y: rect.y + top, width: right - left, height: bottom - top };
  return {
    area,
    coordinateSpace,
    source: { x, y, width, height, logicalWidth: args.logicalWidth ?? null, logicalHeight: args.logicalHeight ?? null },
    areaBounds: rect,
    areaPixels: { x: left, y: top, width: right - left, height: bottom - top },
    screen,
    capturePixels: {
      x: screen.x - window.bounds.x,
      y: screen.y - window.bounds.y,
      width: screen.width,
      height: screen.height,
    },
    dpi: window.dpi ?? 96,
    dpiScale: window.dpiScale ?? 1,
  };
}

async function captureWindow(window, backend = "auto") {
  const outputDir = path.join(os.tmpdir(), "winsight-mcp");
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `capture-${crypto.randomUUID()}.png`);
  const result = await runPowerShell(CAPTURE_SCRIPT, [
    "-Action", "capture",
    "-Hwnd", window.hwnd,
    "-Backend", backend,
    "-Output", outputPath,
  ]);
  const selected = result.selected ?? {};
  const success = selected.Success ?? selected.success;
  const black = selected.LikelyBlackFrame ?? selected.likelyBlackFrame;
  if (!success || black) {
    throw new Error(`Capture did not produce a valid frame: ${selected.Error ?? selected.error ?? "black frame"}`);
  }
  return { window: result.target ?? window, result, outputPath, pngBytes: await fs.readFile(outputPath) };
}

async function cropCapture(window, captured, regionArgs) {
  const mappingWindow = captured.window ?? window;
  const mapping = mapRegion(mappingWindow, regionArgs);
  const outputPath = path.join(os.tmpdir(), "winsight-mcp", `region-${crypto.randomUUID()}.png`);
  const crop = await runPowerShell(ANALYSIS_SCRIPT, [
    "-Action", "crop",
    "-ImagePath", captured.outputPath,
    "-Output", outputPath,
    "-X", mapping.capturePixels.x,
    "-Y", mapping.capturePixels.y,
    "-Width", mapping.capturePixels.width,
    "-Height", mapping.capturePixels.height,
  ]);
  if (!(crop.Success ?? crop.success)) throw new Error(`Region crop failed: ${crop.Error ?? crop.error}`);
  return { ...captured, window: mappingWindow, outputPath, pngBytes: await fs.readFile(outputPath), mapping, crop };
}

async function captureObservation(window, backend, regionArgs) {
  const captured = await captureWindow(window, backend);
  return regionArgs ? cropCapture(window, captured, regionArgs) : captured;
}

async function compareImagePaths(beforePath, afterPath, pixelThreshold = 16) {
  const result = await runPowerShell(ANALYSIS_SCRIPT, [
    "-Action", "compare",
    "-ImagePath", beforePath,
    "-Other", afterPath,
    "-PixelThreshold", pixelThreshold,
  ]);
  if (!(result.Success ?? result.success)) throw new Error(`Frame comparison failed: ${result.Error ?? result.error}`);
  return result;
}

async function runOcr(imagePath) {
  const result = await runPowerShell(OCR_SCRIPT, ["-ImagePath", imagePath]);
  if (typeof result.text === "string" && result.text.length > 50_000) {
    result.text = `${result.text.slice(0, 50_000)}\n[truncated]`;
  }
  if (Array.isArray(result.lines) && result.lines.length > 500) {
    result.lines = result.lines.slice(0, 500);
    result.linesTruncated = true;
  }
  return result;
}

function windowFingerprint(window) {
  return JSON.stringify({
    hwnd: Number(window.hwnd),
    processId: Number(window.processId),
    process: window.process,
    title: window.title,
    bounds: window.bounds,
    clientBounds: window.clientBounds,
    dpi: window.dpi,
  });
}

function selectorSchema() {
  return {
    hwnd: { type: "number", description: "Exact top-level window handle. Preferred after list_windows." },
    title: { type: "string", description: "Case-insensitive title substring. Must match exactly one window." },
    process: { type: "string", description: "Case-insensitive process substring. Must match exactly one window." },
  };
}

function backendSchema() {
  return { type: "string", enum: ["auto", "wgc", "printwindow", "dxgi", "gdi-screen"], default: "auto" };
}

function regionSchema() {
  return {
    area: { type: "string", enum: ["window", "client"], default: "window" },
    coordinateSpace: { type: "string", enum: ["window_pixels", "client_pixels", "normalized", "logical"], default: "window_pixels" },
    x: { type: "number" },
    y: { type: "number" },
    width: { type: "number" },
    height: { type: "number" },
    logicalWidth: { type: "number" },
    logicalHeight: { type: "number" },
  };
}

function windowChanges(previous, current, recreated = false) {
  const changes = [];
  if (recreated || Number(previous.hwnd) !== Number(current.hwnd)) changes.push("hwnd_recreated");
  if (Number(previous.processId) !== Number(current.processId)) changes.push("process_changed");
  if (previous.title !== current.title) changes.push("title_changed");
  if (JSON.stringify(previous.bounds) !== JSON.stringify(current.bounds)) changes.push("window_moved_or_resized");
  if (JSON.stringify(previous.clientBounds) !== JSON.stringify(current.clientBounds)) changes.push("client_moved_or_resized");
  if (Number(previous.dpi) !== Number(current.dpi)) changes.push("dpi_changed");
  if (Boolean(previous.visible) !== Boolean(current.visible)) changes.push("visibility_changed");
  if (Boolean(previous.minimized) !== Boolean(current.minimized)) changes.push("minimized_changed");
  return changes;
}

async function resolveTrackedWindow(session) {
  const windows = await listWindows();
  const exact = windows.filter((window) => Number(window.hwnd) === Number(session.lastWindow.hwnd));
  if (exact.length === 1) return { window: exact[0], recreated: false };
  const candidates = windows.filter((window) =>
    String(window.process ?? "").toLocaleLowerCase() === String(session.lastWindow.process ?? "").toLocaleLowerCase()
    && String(window.title ?? "") === String(session.lastWindow.title ?? ""));
  if (candidates.length === 1) return { window: candidates[0], recreated: true };
  throw new Error(`Tracked window is unavailable; found ${candidates.length} recreation candidates.`);
}

const tools = [
  {
    name: "diagnose_capture",
    title: "Diagnose Windows Capture",
    description: "Report Windows build and WinSight capture API compatibility without changing system settings.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "list_windows",
    title: "List Windows App Windows",
    description: "List visible top-level Windows windows with HWND, process, window/client bounds, and DPI metadata.",
    inputSchema: {
      type: "object",
      properties: { filter: { type: "string", description: "Optional case-insensitive title or process substring." } },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "capture_window",
    title: "Capture Windows Window",
    description: "Capture one Windows window and return a PNG image plus backend and frame-quality metadata.",
    inputSchema: {
      type: "object",
      properties: {
        ...selectorSchema(),
        backend: backendSchema(),
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "map_coordinates",
    title: "Map Window Coordinates",
    description: "Map window/client pixel, normalized, or logical coordinates to current screen and capture pixels.",
    inputSchema: {
      type: "object",
      properties: {
        ...selectorSchema(),
        area: { type: "string", enum: ["window", "client"], default: "window" },
        coordinateSpace: { type: "string", enum: ["window_pixels", "client_pixels", "normalized", "logical"], default: "window_pixels" },
        x: { type: "number" },
        y: { type: "number" },
        logicalWidth: { type: "number" },
        logicalHeight: { type: "number" },
      },
      required: ["x", "y"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "capture_region",
    title: "Capture Windows Window Region",
    description: "Capture a mapped window/client region and return its PNG plus source, screen, and capture-pixel coordinates.",
    inputSchema: {
      type: "object",
      properties: { ...selectorSchema(), backend: backendSchema(), ...regionSchema() },
      required: ["x", "y", "width", "height"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "start_observation",
    title: "Start Bounded Window Observation",
    description: "Capture a baseline and start a ten-minute bounded session for window continuity and visual-change polling.",
    inputSchema: {
      type: "object",
      properties: {
        ...selectorSchema(),
        backend: backendSchema(),
        threshold: { type: "number", minimum: 0, maximum: 1, default: 0.05 },
        pixelThreshold: { type: "integer", minimum: 0, maximum: 255, default: 16 },
        region: { type: "object", properties: regionSchema(), required: ["x", "y", "width", "height"] },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "poll_observation",
    title: "Poll Window Observation",
    description: "Revalidate a tracked window, capture the next frame, and report identity/bounds changes plus a material-change score.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "stop_observation",
    title: "Stop Window Observation",
    description: "Stop one bounded observation session and release its in-memory state.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "record_window",
    title: "Record Bounded Window Frames",
    description: "Record a bounded multi-backend frame sequence in local temporary storage with a JSON manifest and per-frame change evidence.",
    inputSchema: {
      type: "object",
      properties: {
        ...selectorSchema(),
        backend: backendSchema(),
        durationMs: { type: "integer", minimum: 100, maximum: 60000, default: 5000 },
        intervalMs: { type: "integer", minimum: 100, maximum: 10000, default: 500 },
        maxFrames: { type: "integer", minimum: 1, maximum: 600, default: 120 },
        maxBytes: { type: "integer", minimum: 1048576, maximum: 268435456, default: 67108864 },
        threshold: { type: "number", minimum: 0, maximum: 1, default: 0.05 },
        pixelThreshold: { type: "integer", minimum: 0, maximum: 255, default: 16 },
        region: { type: "object", properties: regionSchema(), required: ["x", "y", "width", "height"] },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "ocr_window",
    title: "OCR Windows Window",
    description: "Capture a full window or mapped region and recognize visible text locally with Windows.Media.Ocr.",
    inputSchema: {
      type: "object",
      properties: {
        ...selectorSchema(),
        backend: backendSchema(),
        region: { type: "object", properties: regionSchema(), required: ["x", "y", "width", "height"] },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "prepare_input",
    title: "Prepare Controlled Window Input",
    description: "Capture and prepare a single-use action. invoke calls a supported UI Automation button without moving the pointer or activating its window; no foreground fallback. click/key require foreground activation.",
    inputSchema: {
      type: "object",
      properties: {
        ...selectorSchema(),
        action: { type: "string", enum: ["click", "key", "invoke"] },
        area: { type: "string", enum: ["window", "client"], default: "window" },
        coordinateSpace: { type: "string", enum: ["window_pixels", "client_pixels", "normalized", "logical"], default: "window_pixels" },
        x: { type: "number" },
        y: { type: "number" },
        logicalWidth: { type: "number" },
        logicalHeight: { type: "number" },
        key: { type: "string", enum: [...ALLOWED_KEYS] },
      },
      required: ["action"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "execute_prepared_input",
    title: "Execute Prepared Window Input",
    description: "Revalidate the target and automatically execute one unexpired prepared input exactly once on a safe local app surface.",
    inputSchema: {
      type: "object",
      properties: { token: { type: "string", description: "Single-use token returned by prepare_input." } },
      required: ["token"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "emergency_stop_input",
    title: "Emergency Stop WinSight Input",
    description: "Immediately disable input execution and invalidate all prepared actions for this WinSight server session.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "resume_input",
    title: "Resume WinSight Input",
    description: "Re-enable controlled input after an emergency stop. Sensitive surfaces remain blocked.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

async function handleToolCall(name, args) {
  cleanupTokens();

  if (name === "diagnose_capture") {
    const result = await runPowerShell(CAPTURE_SCRIPT, ["-Action", "diagnose"]);
    return textResult(JSON.stringify(result, null, 2), result);
  }

  if (name === "list_windows") {
    let windows = await listWindows();
    if (args.filter) {
      const needle = String(args.filter).toLocaleLowerCase();
      windows = windows.filter((window) => `${window.process ?? ""} ${window.title ?? ""}`.toLocaleLowerCase().includes(needle));
    }
    return textResult(JSON.stringify(windows, null, 2), { windows, count: windows.length });
  }

  if (name === "capture_window") {
    const window = await resolveWindow(args);
    const captured = await captureWindow(window, args.backend ?? "auto");
    const selected = captured.result.selected;
    return imageResult(
      `Captured ${captured.window.title} with ${selected.Backend ?? selected.backend}.`,
      captured.pngBytes,
      { window: captured.window, selected, attempts: captured.result.attempts },
    );
  }

  if (name === "map_coordinates") {
    const window = await resolveWindow(args);
    const mapping = mapCoordinates(window, args);
    return textResult(JSON.stringify({ window, mapping }, null, 2), { window, mapping });
  }

  if (name === "capture_region") {
    const window = await resolveWindow(args);
    const captured = await captureWindow(window, args.backend ?? "auto");
    const region = await cropCapture(window, captured, args);
    return imageResult(
      `Captured region ${region.mapping.capturePixels.width}x${region.mapping.capturePixels.height} from ${window.title}.`,
      region.pngBytes,
      { window: region.window, mapping: region.mapping, selected: captured.result.selected, attempts: captured.result.attempts },
    );
  }

  if (name === "start_observation") {
    if (observationSessions.size >= MAX_OBSERVATION_SESSIONS) {
      throw new Error(`At most ${MAX_OBSERVATION_SESSIONS} observation sessions may be active.`);
    }
    const window = await resolveWindow(args);
    const threshold = args.threshold ?? 0.05;
    const pixelThreshold = args.pixelThreshold ?? 16;
    if (typeof threshold !== "number" || threshold < 0 || threshold > 1) throw new Error("threshold must be between 0 and 1.");
    if (!Number.isInteger(pixelThreshold) || pixelThreshold < 0 || pixelThreshold > 255) throw new Error("pixelThreshold must be an integer from 0 to 255.");
    const baseline = await captureObservation(window, args.backend ?? "auto", args.region);
    const sessionId = crypto.randomUUID();
    const baselineWindow = baseline.window ?? window;
    const session = {
      sessionId,
      backend: args.backend ?? "auto",
      region: args.region ?? null,
      threshold,
      pixelThreshold,
      createdAt: Date.now(),
      expiresAt: Date.now() + OBSERVATION_TTL_MS,
      lastWindow: baselineWindow,
      lastPath: baseline.outputPath,
      pollCount: 0,
    };
    observationSessions.set(sessionId, session);
    return imageResult(
      `Started bounded observation for ${baselineWindow.title}. Session expires after ten minutes of inactivity.`,
      baseline.pngBytes,
      { sessionId, expiresAt: new Date(session.expiresAt).toISOString(), window: baselineWindow, region: baseline.mapping ?? null, threshold, pixelThreshold },
    );
  }

  if (name === "poll_observation") {
    const sessionId = String(args.sessionId ?? "");
    const session = observationSessions.get(sessionId);
    if (!session) throw new Error("Observation session is missing or expired.");
    const resolved = await resolveTrackedWindow(session);
    const current = await captureObservation(resolved.window, session.backend, session.region);
    const currentWindow = current.window ?? resolved.window;
    const changes = windowChanges(session.lastWindow, currentWindow, resolved.recreated);
    const comparison = await compareImagePaths(session.lastPath, current.outputPath, session.pixelThreshold);
    const score = Number(comparison.Score ?? comparison.score ?? 0);
    session.lastWindow = currentWindow;
    session.lastPath = current.outputPath;
    session.pollCount += 1;
    session.expiresAt = Date.now() + OBSERVATION_TTL_MS;
    return imageResult(
      `Polled ${currentWindow.title}: visual score ${score.toFixed(6)}, ${changes.length} window-state changes.`,
      current.pngBytes,
      {
        sessionId,
        pollCount: session.pollCount,
        expiresAt: new Date(session.expiresAt).toISOString(),
        window: currentWindow,
        changes,
        continuityChanged: changes.length > 0,
        comparison,
        threshold: session.threshold,
        materialChanged: score >= session.threshold,
        region: current.mapping ?? null,
        selected: current.result.selected,
      },
    );
  }

  if (name === "stop_observation") {
    const sessionId = String(args.sessionId ?? "");
    const existed = observationSessions.delete(sessionId);
    return textResult(existed ? "Observation session stopped." : "Observation session was already absent.", { sessionId, stopped: existed });
  }

  if (name === "record_window") {
    const initialWindow = await resolveWindow(args);
    const durationMs = args.durationMs ?? 5000;
    const intervalMs = args.intervalMs ?? 500;
    const maxFrames = args.maxFrames ?? 120;
    const maxBytes = args.maxBytes ?? 64 * 1024 * 1024;
    const threshold = args.threshold ?? 0.05;
    const pixelThreshold = args.pixelThreshold ?? 16;
    if (!Number.isInteger(durationMs) || durationMs < 100 || durationMs > 60_000) throw new Error("durationMs must be an integer from 100 to 60000.");
    if (!Number.isInteger(intervalMs) || intervalMs < 100 || intervalMs > 10_000) throw new Error("intervalMs must be an integer from 100 to 10000.");
    if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 600) throw new Error("maxFrames must be an integer from 1 to 600.");
    if (!Number.isInteger(maxBytes) || maxBytes < 1024 * 1024 || maxBytes > 256 * 1024 * 1024) throw new Error("maxBytes must be from 1 MiB to 256 MiB.");
    if (typeof threshold !== "number" || threshold < 0 || threshold > 1) throw new Error("threshold must be between 0 and 1.");
    if (!Number.isInteger(pixelThreshold) || pixelThreshold < 0 || pixelThreshold > 255) throw new Error("pixelThreshold must be an integer from 0 to 255.");

    const recordingId = crypto.randomUUID();
    const directory = path.join(os.tmpdir(), "winsight-recordings", recordingId);
    await fs.mkdir(directory, { recursive: true });
    const startedAt = Date.now();
    let nextDue = startedAt;
    let totalBytes = 0;
    let previousPath = null;
    let lastPngBytes = null;
    let stopReason = "duration";
    const frames = [];
    const tracking = { lastWindow: initialWindow };

    while (frames.length < maxFrames) {
      if (frames.length > 0 && Date.now() - startedAt >= durationMs) break;
      const waitMs = nextDue - Date.now();
      if (waitMs > 0) await delay(waitMs);
      let resolved;
      try {
        resolved = frames.length === 0 ? { window: initialWindow, recreated: false } : await resolveTrackedWindow(tracking);
      } catch (error) {
        stopReason = `window_unavailable: ${error instanceof Error ? error.message : String(error)}`;
        break;
      }
      const captured = await captureObservation(resolved.window, args.backend ?? "auto", args.region);
      const capturedWindow = captured.window ?? resolved.window;
      const changes = windowChanges(tracking.lastWindow, capturedWindow, resolved.recreated);
      const stat = await fs.stat(captured.outputPath);
      if (totalBytes + stat.size > maxBytes) {
        stopReason = "max_bytes";
        break;
      }
      const framePath = path.join(directory, `frame-${String(frames.length).padStart(4, "0")}.png`);
      await fs.copyFile(captured.outputPath, framePath);
      const comparison = previousPath ? await compareImagePaths(previousPath, framePath, pixelThreshold) : null;
      const score = Number(comparison?.Score ?? comparison?.score ?? 0);
      const selected = captured.result.selected;
      frames.push({
        index: frames.length,
        elapsedMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
        file: framePath,
        bytes: stat.size,
        backend: selected.Backend ?? selected.backend,
        attempts: captured.result.attempts,
        window: capturedWindow,
        changes,
        comparison,
        materialChanged: comparison ? score >= threshold : false,
        region: captured.mapping ?? null,
      });
      totalBytes += stat.size;
      previousPath = framePath;
      lastPngBytes = captured.pngBytes;
      tracking.lastWindow = capturedWindow;
      nextDue += intervalMs;
    }

    if (frames.length >= maxFrames) stopReason = "max_frames";
    if (frames.length === 0 || !lastPngBytes) throw new Error(`Recording produced no retained frames (${stopReason}).`);
    const manifest = {
      recordingId,
      createdAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      requested: { durationMs, intervalMs, maxFrames, maxBytes, backend: args.backend ?? "auto", threshold, pixelThreshold, region: args.region ?? null },
      stopReason,
      frameCount: frames.length,
      totalBytes,
      frames,
    };
    const manifestPath = path.join(directory, "manifest.json");
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return imageResult(
      `Recorded ${frames.length} bounded frames (${totalBytes} bytes); stopped by ${stopReason}.`,
      lastPngBytes,
      {
        recordingId,
        directory,
        manifestPath,
        stopReason,
        frameCount: frames.length,
        totalBytes,
        frames: frames.slice(-100),
        framesTruncated: frames.length > 100,
      },
    );
  }

  if (name === "ocr_window") {
    const window = await resolveWindow(args);
    const captured = await captureObservation(window, args.backend ?? "auto", args.region);
    const ocr = await runOcr(captured.outputPath);
    return imageResult(
      ocr.success ? `Recognized ${ocr.lines?.length ?? 0} text lines in ${window.title}.` : `OCR provider unavailable or failed: ${ocr.error}`,
      captured.pngBytes,
      { window: captured.window ?? window, region: captured.mapping ?? null, selected: captured.result.selected, ocr },
    );
  }

  if (name === "prepare_input") {
    if (!inputEnabled) throw new Error("WinSight input is stopped. Call resume_input first.");
    const resolvedWindow = await resolveWindow(args);
    assertInputSurfaceAllowed(resolvedWindow);
    const captured = await captureWindow(resolvedWindow, "auto");
    const window = captured.window ?? resolvedWindow;
    assertInputSurfaceAllowed(window);
    let action;
    if (args.action === "click" || args.action === "invoke") {
      action = { type: args.action, mapping: mapCoordinates(window, args) };
      if (args.action === "invoke") {
        const inspected = await runPowerShell(INPUT_SCRIPT, [
          "-Action", "inspect-invoke", "-Hwnd", window.hwnd,
          "-ScreenX", action.mapping.screen.x, "-ScreenY", action.mapping.screen.y,
        ]);
        if (!inspected.control?.runtimeId) throw new Error("No invokable control identity was returned.");
        action.control = inspected.control;
      }
    } else if (args.action === "key") {
      const key = String(args.key ?? "").toUpperCase();
      if (!ALLOWED_KEYS.has(key)) throw new Error(`key must be one of: ${[...ALLOWED_KEYS].join(", ")}`);
      action = { type: "key", key };
    } else {
      throw new Error("action must be click, key, or invoke.");
    }

    const token = crypto.randomUUID();
    const prepared = {
      token,
      window,
      fingerprint: windowFingerprint(window),
      action,
      createdAt: Date.now(),
      expiresAt: Date.now() + TOKEN_TTL_MS,
      used: false,
    };
    preparedInputs.set(token, prepared);
    return imageResult(
      `Prepared ${action.type} for ${window.title}. No input has executed. Token expires in ${TOKEN_TTL_MS / 1000} seconds.`,
      captured.pngBytes,
      { token, expiresAt: new Date(prepared.expiresAt).toISOString(), window, action },
    );
  }

  if (name === "execute_prepared_input") {
    if (!inputEnabled) throw new Error("WinSight input is stopped.");
    const token = String(args.token ?? "");
    const prepared = preparedInputs.get(token);
    if (!prepared) throw new Error("Prepared input token is missing, expired, or already used.");
    if (prepared.used || prepared.expiresAt <= Date.now()) {
      preparedInputs.delete(token);
      throw new Error("Prepared input token is expired or already used.");
    }

    const currentWindow = await resolveWindow({ hwnd: prepared.window.hwnd });
    assertInputSurfaceAllowed(currentWindow);
    if (windowFingerprint(currentWindow) !== prepared.fingerprint) {
      preparedInputs.delete(token);
      throw new Error("Target window identity, title, bounds, client bounds, or DPI changed. Prepare a new action.");
    }

    const actionDescription = prepared.action.type !== "key"
      ? `${prepared.action.type} ${currentWindow.process} / ${currentWindow.title} at screen (${prepared.action.mapping.screen.x}, ${prepared.action.mapping.screen.y}), capture pixel (${prepared.action.mapping.capturePixel.x}, ${prepared.action.mapping.capturePixel.y}).`
      : `Send key ${prepared.action.key} to ${currentWindow.process} / ${currentWindow.title}.`;
    prepared.used = true;
    preparedInputs.delete(token);
    let result;
    if (prepared.action.type !== "key") {
      result = await runPowerShell(INPUT_SCRIPT, [
        "-Action", prepared.action.type,
        "-Hwnd", currentWindow.hwnd,
        "-ScreenX", prepared.action.mapping.screen.x,
        "-ScreenY", prepared.action.mapping.screen.y,
        ...(prepared.action.type === "invoke"
          ? ["-ExpectedControl", Buffer.from(JSON.stringify(prepared.action.control), "utf8").toString("base64")]
          : []),
      ]);
    } else {
      result = await runPowerShell(INPUT_SCRIPT, [
        "-Action", "key",
        "-Hwnd", currentWindow.hwnd,
        "-Key", prepared.action.key,
      ]);
    }
    if (result?.result?.Success !== true) {
      throw new Error(result?.result?.Error || "Input provider did not confirm execution.");
    }
    return textResult(`Executed: ${actionDescription}`, { status: "executed", action: prepared.action, result });
  }

  if (name === "emergency_stop_input") {
    inputEnabled = false;
    preparedInputs.clear();
    return textResult("WinSight input is stopped and all prepared actions were invalidated.", { inputEnabled });
  }

  if (name === "resume_input") {
    inputEnabled = true;
    return textResult("WinSight controlled input is enabled for this server session.", { inputEnabled });
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function handleRequest(message) {
  const { id, method, params } = message;
  if (method === "initialize") {
    sendResult(id, {
      protocolVersion: params?.protocolVersion ?? "2025-11-25",
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      instructions: "Use list_windows and capture_window for observation. For input, always call prepare_input before execute_prepared_input so the target and coordinates are revalidated. Safe local actions can execute automatically. Never use input on authentication, security, payment, permission, CAPTCHA, or password surfaces.",
    });
    return;
  }
  if (method === "ping") {
    sendResult(id, {});
    return;
  }
  if (method === "tools/list") {
    sendResult(id, { tools });
    return;
  }
  if (method === "tools/call") {
    try {
      sendResult(id, await handleToolCall(params?.name, params?.arguments ?? {}));
    } catch (error) {
      sendError(id, JsonRpcError.INVALID_PARAMS, error instanceof Error ? error.message : String(error));
    }
    return;
  }
  if (id !== undefined) sendError(id, JsonRpcError.METHOD_NOT_FOUND, `Method not found: ${method}`);
}

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  void handleRequest(message).catch((error) => {
    if (message.id !== undefined) sendError(message.id, JsonRpcError.INTERNAL_ERROR, error instanceof Error ? error.message : String(error));
  });
});

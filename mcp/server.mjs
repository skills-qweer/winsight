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
const SERVER_NAME = "WinSight MCP";
const SERVER_VERSION = "0.2.0";
const TOKEN_TTL_MS = 30_000;
const preparedInputs = new Map();
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
  return JSON.parse(trimmed);
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
  return { result, outputPath, pngBytes: await fs.readFile(outputPath) };
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
        backend: { type: "string", enum: ["auto", "printwindow", "gdi-screen"], default: "auto" },
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
    name: "prepare_input",
    title: "Prepare Controlled Window Input",
    description: "Capture the current target and prepare a short-lived single-use click or allowlisted key action without executing it.",
    inputSchema: {
      type: "object",
      properties: {
        ...selectorSchema(),
        action: { type: "string", enum: ["click", "key"] },
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
      `Captured ${window.title} with ${selected.Backend ?? selected.backend}.`,
      captured.pngBytes,
      { window, selected, attempts: captured.result.attempts },
    );
  }

  if (name === "map_coordinates") {
    const window = await resolveWindow(args);
    const mapping = mapCoordinates(window, args);
    return textResult(JSON.stringify({ window, mapping }, null, 2), { window, mapping });
  }

  if (name === "prepare_input") {
    if (!inputEnabled) throw new Error("WinSight input is stopped. Call resume_input and obtain confirmation first.");
    const window = await resolveWindow(args);
    assertInputSurfaceAllowed(window);
    let action;
    if (args.action === "click") {
      action = { type: "click", mapping: mapCoordinates(window, args) };
    } else if (args.action === "key") {
      const key = String(args.key ?? "").toUpperCase();
      if (!ALLOWED_KEYS.has(key)) throw new Error(`key must be one of: ${[...ALLOWED_KEYS].join(", ")}`);
      action = { type: "key", key };
    } else {
      throw new Error("action must be click or key.");
    }

    const captured = await captureWindow(window, "auto");
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

    const actionDescription = prepared.action.type === "click"
      ? `Click ${currentWindow.process} / ${currentWindow.title} at screen (${prepared.action.mapping.screen.x}, ${prepared.action.mapping.screen.y}), capture pixel (${prepared.action.mapping.capturePixel.x}, ${prepared.action.mapping.capturePixel.y}).`
      : `Send key ${prepared.action.key} to ${currentWindow.process} / ${currentWindow.title}.`;
    prepared.used = true;
    preparedInputs.delete(token);
    let result;
    if (prepared.action.type === "click") {
      result = await runPowerShell(INPUT_SCRIPT, [
        "-Action", "click",
        "-Hwnd", currentWindow.hwnd,
        "-ScreenX", prepared.action.mapping.screen.x,
        "-ScreenY", prepared.action.mapping.screen.y,
      ]);
    } else {
      result = await runPowerShell(INPUT_SCRIPT, [
        "-Action", "key",
        "-Hwnd", currentWindow.hwnd,
        "-Key", prepared.action.key,
      ]);
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

import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";

const root = path.resolve(import.meta.dirname, "..");
const child = spawn(process.execPath, [path.join(root, "mcp", "server.mjs")], {
  cwd: root,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
const pending = new Map();
let nextId = 1;

lines.on("line", (line) => {
  const message = JSON.parse(line);
  const handler = pending.get(message.id);
  if (!handler) return;
  pending.delete(message.id);
  if (message.error) handler.reject(new Error(message.error.message));
  else handler.resolve(message.result);
});

function request(method, params = {}) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function callTool(name, args = {}) {
  return request("tools/call", { name, arguments: args });
}

function assertPng(result, label) {
  const image = result.content.find((item) => item.type === "image");
  if (!image || image.mimeType !== "image/png") throw new Error(`${label} did not return PNG image content.`);
  const signature = Buffer.from(image.data, "base64").subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error(`${label} returned an invalid PNG signature.`);
  return signature;
}

try {
  const initialized = await request("initialize", { protocolVersion: "2025-11-25" });
  const listed = await request("tools/list");
  const diagnosed = await callTool("diagnose_capture");
  const windows = await callTool("list_windows", { filter: "FogHarborEchoes" });
  if (windows.structuredContent.count !== 1) throw new Error("Expected one FogHarborEchoes window.");
  const hwnd = windows.structuredContent.windows[0].hwnd;
  const captured = await callTool("capture_window", { hwnd, backend: "auto" });
  const signature = assertPng(captured, "auto capture_window");
  const wgcCaptured = await callTool("capture_window", { hwnd, backend: "wgc" });
  assertPng(wgcCaptured, "WGC capture_window");
  const dxgiCaptured = await callTool("capture_window", { hwnd, backend: "dxgi" });
  assertPng(dxgiCaptured, "DXGI capture_window");

  const mapped = await callTool("map_coordinates", {
    hwnd,
    area: "window",
    coordinateSpace: "normalized",
    x: 0.5,
    y: 0.5,
  });
  const prepared = await callTool("prepare_input", { hwnd, action: "key", key: "ESCAPE" });
  const token = prepared.structuredContent.token;
  await callTool("emergency_stop_input");
  let stoppedGuardPassed = false;
  try {
    await callTool("execute_prepared_input", { token });
  } catch (error) {
    stoppedGuardPassed = /stopped|missing|expired|used/i.test(error.message);
  }
  if (!stoppedGuardPassed) throw new Error("Emergency-stop guard did not reject prepared input.");
  await callTool("resume_input");

  let creatorLoginGuard = "not_present";
  const creatorWindows = await callTool("list_windows", { filter: "Cocos Creator 3.8.8" });
  if (creatorWindows.structuredContent.count === 1) {
    try {
      await callTool("prepare_input", {
        hwnd: creatorWindows.structuredContent.windows[0].hwnd,
        action: "key",
        key: "ESCAPE",
      });
      creatorLoginGuard = "failed";
    } catch (error) {
      creatorLoginGuard = /refuses input/i.test(error.message) ? "passed" : `unexpected: ${error.message}`;
    }
    if (creatorLoginGuard !== "passed") throw new Error(`Creator login guard failed: ${creatorLoginGuard}`);
  }

  process.stdout.write(`${JSON.stringify({
    passed: true,
    server: initialized.serverInfo,
    toolCount: listed.tools.length,
    diagnosisBuild: diagnosed.structuredContent.build,
    hwnd,
    captureBackend: captured.structuredContent.selected.Backend,
    explicitBackends: [
      wgcCaptured.structuredContent.selected.Backend,
      dxgiCaptured.structuredContent.selected.Backend,
    ],
    captureSize: {
      width: captured.structuredContent.selected.Width,
      height: captured.structuredContent.selected.Height,
    },
    pngSignature: signature,
    centerMapping: mapped.structuredContent.mapping,
    preparedTokenCreated: Boolean(token),
    emergencyStopGuard: stoppedGuardPassed,
    creatorLoginGuard,
  }, null, 2)}\n`);
} finally {
  child.stdin.end();
  child.kill();
}

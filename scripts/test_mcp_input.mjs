import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const options = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, values) => {
    if (value.startsWith("--")) pairs.push([value.slice(2), values[index + 1] ?? true]);
    return pairs;
  }, []),
);
if (options.execute !== true && options.execute !== "true") {
  throw new Error("Pass --execute to run the prepared local input test.");
}
const title = String(options.title ?? "FogHarborEchoes");
const x = Number(options.x);
const y = Number(options.y);
if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Pass numeric --x and --y window-pixel coordinates.");

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

try {
  await request("initialize", { protocolVersion: "2025-11-25" });
  const windows = await callTool("list_windows", { filter: title });
  if (windows.structuredContent.count !== 1) throw new Error(`Expected one ${title} window.`);
  const hwnd = windows.structuredContent.windows[0].hwnd;
  const prepared = await callTool("prepare_input", {
    hwnd,
    action: "click",
    area: "window",
    coordinateSpace: "window_pixels",
    x,
    y,
  });
  const token = prepared.structuredContent.token;
  const executed = await callTool("execute_prepared_input", { token });
  let replayGuardPassed = false;
  try {
    await callTool("execute_prepared_input", { token });
  } catch (error) {
    replayGuardPassed = /missing|expired|used/i.test(error.message);
  }
  if (!replayGuardPassed) throw new Error("Single-use token replay guard failed.");
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const captured = await callTool("capture_window", { hwnd, backend: "auto" });
  const image = captured.content.find((item) => item.type === "image");
  const outputPath = path.join(os.tmpdir(), `winsight-input-after-${Date.now()}.png`);
  await fs.writeFile(outputPath, Buffer.from(image.data, "base64"));
  process.stdout.write(`${JSON.stringify({
    passed: true,
    hwnd,
    prepared: prepared.structuredContent.action,
    executed: executed.structuredContent,
    replayGuardPassed,
    afterCaptureBackend: captured.structuredContent.selected.Backend,
    outputPath,
  }, null, 2)}\n`);
} finally {
  child.stdin.end();
  child.kill();
}

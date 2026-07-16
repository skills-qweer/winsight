import { spawn } from "node:child_process";
import fs from "node:fs/promises";
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

function assertImage(result, label) {
  const image = result.content.find((item) => item.type === "image");
  if (!image || image.mimeType !== "image/png") throw new Error(`${label} did not return a PNG image.`);
}

const region = {
  area: "window",
  coordinateSpace: "normalized",
  x: 0.70,
  y: 0.05,
  width: 0.28,
  height: 0.90,
};

try {
  await request("initialize", { protocolVersion: "2025-11-25" });
  const listed = await request("tools/list");
  const windows = await callTool("list_windows", { filter: "FogHarborEchoes" });
  if (windows.structuredContent.count !== 1) throw new Error("Expected one FogHarborEchoes window.");
  const hwnd = windows.structuredContent.windows[0].hwnd;

  process.stderr.write("[observation-test] capture_region\n");
  const cropped = await callTool("capture_region", { hwnd, backend: "wgc", ...region });
  assertImage(cropped, "capture_region");
  if (cropped.structuredContent.mapping.capturePixels.width <= 0) throw new Error("ROI mapping is empty.");

  process.stderr.write("[observation-test] start_observation\n");
  const started = await callTool("start_observation", { hwnd, backend: "wgc", region, threshold: 0.05 });
  assertImage(started, "start_observation");
  const sessionId = started.structuredContent.sessionId;
  process.stderr.write("[observation-test] poll_observation\n");
  const polled = await callTool("poll_observation", { sessionId });
  assertImage(polled, "poll_observation");
  if (typeof polled.structuredContent.comparison.Score !== "number") throw new Error("poll_observation has no change score.");
  process.stderr.write("[observation-test] stop_observation\n");
  const stopped = await callTool("stop_observation", { sessionId });
  if (!stopped.structuredContent.stopped) throw new Error("stop_observation did not stop the session.");

  process.stderr.write("[observation-test] ocr_window\n");
  const ocr = await callTool("ocr_window", { hwnd, backend: "wgc", region });
  assertImage(ocr, "ocr_window");
  if (!ocr.structuredContent.ocr.success || !ocr.structuredContent.ocr.text) throw new Error("ocr_window returned no recognized text.");

  process.stderr.write("[observation-test] record_window\n");
  const recording = await callTool("record_window", {
    hwnd,
    backend: "auto",
    durationMs: 6000,
    intervalMs: 300,
    maxFrames: 3,
    maxBytes: 10 * 1024 * 1024,
    region,
  });
  assertImage(recording, "record_window");
  if (recording.structuredContent.frameCount < 2 || recording.structuredContent.frameCount > 3) {
    throw new Error(`Unexpected recording frame count: ${recording.structuredContent.frameCount}`);
  }
  await fs.access(recording.structuredContent.manifestPath);

  await new Promise((resolve) => process.stdout.write(`${JSON.stringify({
    passed: true,
    toolCount: listed.tools.length,
    hwnd,
    region: cropped.structuredContent.mapping,
    observation: {
      changes: polled.structuredContent.changes,
      score: polled.structuredContent.comparison.Score,
      materialChanged: polled.structuredContent.materialChanged,
    },
    ocr: {
      provider: ocr.structuredContent.ocr.provider,
      language: ocr.structuredContent.ocr.language,
      lineCount: ocr.structuredContent.ocr.lines.length,
      textPreview: ocr.structuredContent.ocr.text.slice(0, 160),
    },
    recording: {
      frameCount: recording.structuredContent.frameCount,
      totalBytes: recording.structuredContent.totalBytes,
      stopReason: recording.structuredContent.stopReason,
      manifestPath: recording.structuredContent.manifestPath,
    },
  }, null, 2)}\n`, resolve));
} finally {
  child.stdin.end();
  child.kill();
}

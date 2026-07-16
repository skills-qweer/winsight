import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import readline from "node:readline";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const root = path.resolve(import.meta.dirname, "..");
const title = `WinSight Tracking Test ${crypto.randomUUID()}`;
const formScript = [
  "Add-Type -AssemblyName System.Windows.Forms",
  "$form = New-Object System.Windows.Forms.Form",
  `$form.Text = '${title}'`,
  "$form.StartPosition = 'Manual'",
  "$form.SetBounds(120, 120, 520, 360)",
  "$label = New-Object System.Windows.Forms.Label",
  "$label.Text = 'WinSight move and resize tracking fixture'",
  "$label.AutoSize = $true",
  "$label.Location = New-Object System.Drawing.Point -ArgumentList 30,40",
  "$form.Controls.Add($label)",
  "[void]$form.ShowDialog()",
].join("; ");
const fixture = spawn("powershell.exe", ["-NoProfile", "-STA", "-WindowStyle", "Hidden", "-Command", formScript]);
let fixtureError = "";
fixture.stderr.on("data", (chunk) => { fixtureError += chunk.toString(); });
const server = spawn(process.execPath, [path.join(root, "mcp", "server.mjs")], {
  cwd: root,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
const lines = readline.createInterface({ input: server.stdout, crlfDelay: Infinity });
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
  server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function callTool(name, args = {}) {
  return request("tools/call", { name, arguments: args });
}

async function waitForWindow() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const windows = await callTool("list_windows", { filter: title });
    if (windows.structuredContent.count === 1) return windows.structuredContent.windows[0];
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Tracking fixture window did not appear. ${fixtureError.trim()}`);
}

try {
  await request("initialize", { protocolVersion: "2025-11-25" });
  const window = await waitForWindow();
  const started = await callTool("start_observation", { hwnd: window.hwnd, backend: "printwindow", threshold: 0.05 });
  const moveScript = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class WinSightMoveFixture { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int ht, uint flags); }'; [WinSightMoveFixture]::SetWindowPos([IntPtr]${window.hwnd}, [IntPtr]::Zero, 260, 210, 680, 460, 20)`;
  await execFileAsync("powershell.exe", ["-NoProfile", "-Command", moveScript], { windowsHide: true });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const polled = await callTool("poll_observation", { sessionId: started.structuredContent.sessionId });
  await callTool("stop_observation", { sessionId: started.structuredContent.sessionId });
  if (!polled.structuredContent.changes.includes("window_moved_or_resized")) {
    throw new Error(`Move/resize was not detected: ${JSON.stringify(polled.structuredContent.changes)}`);
  }
  process.stdout.write(`${JSON.stringify({
    passed: true,
    title,
    before: window.bounds,
    after: polled.structuredContent.window.bounds,
    changes: polled.structuredContent.changes,
    comparison: polled.structuredContent.comparison,
  }, null, 2)}\n`);
} finally {
  server.stdin.end();
  server.kill();
  fixture.kill();
}

// Print an HTML file to PDF through Chrome's DevTools protocol, with a page-number footer.
//   node print.mjs <in.html> <out.pdf>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , inp, out] = process.argv;
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9333;
const profile = path.join(os.tmpdir(), 'blackstart-print-profile');
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
await send('Page.navigate', { url: pathToFileURL(path.resolve(inp)).href });
await sleep(1500);
const res = await send('Page.printToPDF', {
  printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#666;font-family:Georgia,serif"><span class="pageNumber"></span></div>',
});
fs.writeFileSync(out, Buffer.from(res.result.data, 'base64'));
console.log('wrote', out, fs.statSync(out).size, 'bytes');
ws.close();
proc.kill();

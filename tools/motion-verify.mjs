#!/usr/bin/env node
/**
 * tools/motion-verify.mjs -- 动效/视觉对照与回归验证工具链（本轮改版验收）。
 *
 * 作者：verify-harness（写作用域：tools/motion-verify*、docs/motion-verify.md、shots/verify/**）
 * 只读 android/** 与 official/**。
 *
 * 本轮已实现（最小闭环）：
 *   build    跑 android/build.sh，断言 bin/dsh-phone.apk 存在；用 aapt2 dump badging 读出 APK 内部
 *            真实 versionName/versionCode，与旁车 bin/dsh-phone.apk.json 比对（旁车=插件面板显示源，
 *            必须与包内一致，否则面板会显示假版本）；再独立算 md5 校验旁车。
 *   install  adb install -r 到 <DEVICE>；清 logcat、启动、抓 crash buffer 与主 buffer，
 *            断言无 FATAL EXCEPTION；再用 dumpsys window 断言前台确实是本 App。
 *   capture  统一把 window/transition/animator_scale 置 1（否则测到的是被系统缩放后的时长，
 *            本机实测出厂值是 5/0.5/5），再 adb shell screenrecord 录制、pull 回
 *            shots/verify/<name>.mp4，并用 ffmpeg 抽帧到 shots/verify/<name>/frames/。
 *            ffmpeg 缺失时退回 screencap 轮询（帧率 <=10fps，结果里会标 limitation）。
 *
 * 用法：
 *   node tools/motion-verify.mjs build
 *   node tools/motion-verify.mjs install [--apk PATH]
 *   node tools/motion-verify.mjs capture --name home-local --pkg com.lc.phoneharness --secs 6 [--seq launch|drawer|back]
 *   node tools/motion-verify.mjs capture --name home-ref   --pkg com.deepseek.chat   --secs 6
 *
 * 退出码：0 全通过；1 有 FAIL。每个数字都带证据来源（file:line 或 录制文件+帧号/命令回显）。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NL = String.fromCharCode(10);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ANDROID = path.join(ROOT, 'android');
const VERIFY = path.join(ROOT, 'shots', 'verify');
const APK_PATH = path.join(ANDROID, 'bin', 'dsh-phone.apk');
const APK_META = path.join(ANDROID, 'bin', 'dsh-phone.apk.json');
const AAPT2 = path.join(ROOT, 'sdk', 'build-tools', 'android-16', 'aapt2.exe');
const ADB = process.env.MOTION_ADB || '<PLATFORM_TOOLS>/adb.exe';
const DEVICE = process.env.MOTION_DEVICE || '<DEVICE>';
const LOCAL_PKG = 'com.lc.phoneharness';
const REF_PKG = 'com.deepseek.chat';

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n) => argv.indexOf('--' + n) >= 0;
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

function sh(bin, args, o) {
  const r = spawnSync(bin, args, Object.assign({ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, o || {}));
  return { code: r.status, out: r.stdout || '', err: r.stderr || '', error: r.error ? String(r.error.message) : null };
}
function adb() { return sh(ADB, ['-s', DEVICE].concat(Array.prototype.slice.call(arguments))); }
function adbShell(cmdline) { return adb('shell', cmdline); }
function sleepMs(ms) { const sab = new SharedArrayBuffer(4); Atomics.wait(new Int32Array(sab), 0, 0, ms); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function writeJson(p, obj) { ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj, null, 2) + NL, 'utf8'); }
function tail(s, n) { const a = String(s == null ? '' : s).trim().split(NL); return a.slice(-(n || 8)).join(NL); }
function sha256File(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function md5File(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); }

/* ---------- 环境探测：每个外部工具都要有版本证据，缺哪个就退化哪条路径 ---------- */
let PROBE = null;
function findBash() {
  const cands = [process.env.MOTION_BASH, 'C:/Program Files/Git/bin/bash.exe', 'C:/Program Files/Git/usr/bin/bash.exe', 'C:/Program Files (x86)/Git/bin/bash.exe', 'bash'].filter(Boolean);
  for (const c of cands) { const r = sh(c, ['-c', 'echo ok']); if (r.code === 0 && r.out.indexOf('ok') >= 0) return c; }
  return null;
}
function findPython() {
  const cands = [process.env.MOTION_PY,
    '<HOME>/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe', 'py', 'python', 'python3'].filter(Boolean);
  for (const c of cands) {
    const args = c === 'py' ? ['-3', '-c', 'import sys;print(sys.version)'] : ['-c', 'import sys;print(sys.version)'];
    const r = sh(c, args);
    if (r.code === 0 && r.out.indexOf('3.') >= 0) {
      const pil = sh(c, c === 'py' ? ['-3', '-c', 'import PIL;print(PIL.__version__)'] : ['-c', 'import PIL;print(PIL.__version__)']);
      return { bin: c, isPyLauncher: c === 'py', version: r.out.trim().split(NL)[0], pillow: pil.code === 0 ? pil.out.trim() : null };
    }
  }
  return null;
}
function findTool(bin, args) {
  const r = sh(bin, args || ['-version']);
  if (r.code === 0) return { bin, version: (r.out + r.err).trim().split(NL)[0] };
  return null;
}
function probeEnv() {
  if (PROBE) return PROBE;
  PROBE = {
    adb: (function () { const r = sh(ADB, ['version']); return { bin: ADB, ok: r.code === 0, version: (r.out || r.err).trim().split(NL)[0], exists: fs.existsSync(ADB) }; })(),
    device: (function () { const r = adb('shell', 'getprop ro.build.version.sdk'); return { serial: DEVICE, sdk: (r.out || '').trim(), connected: r.code === 0 && (r.out || '').trim().length > 0 }; })(),
    ffmpeg: findTool('ffmpeg'),
    ffprobe: findTool('ffprobe'),
    python: findPython(),
    bash: (function () { const b = findBash(); return b ? { bin: b } : null; })(),
    aapt2: fs.existsSync(AAPT2) ? AAPT2 : null,
    java: findTool('javac', ['-version']),
  };
  return PROBE;
}

/* ---------- build ---------- */
function dumpBadging(apk) {
  const p = probeEnv();
  if (!p.aapt2) return { ok: false, why: 'no aapt2 at ' + AAPT2 };
  const r = sh(p.aapt2, ['dump', 'badging', apk]);
  if (r.code !== 0) return { ok: false, why: tail(r.err, 4) };
  const text = r.out;
  const pick = (re) => { const m = text.match(re); return m ? m[1] : null; };
  return {
    ok: true,
    versionName: pick(/versionName='([^']+)'/),
    versionCode: pick(/versionCode='([^']+)'/),
    packageName: pick(/package: name='([^']+)'/),
    launchable: pick(/launchable-activity: name='([^']+)'/),
    raw: tail(text, 6),
  };
}
function cmdBuild() {
  const p = probeEnv();
  ensureDir(VERIFY); ensureDir(path.join(ROOT, 'tools'));
  const res = { cmd: 'build', at: new Date().toISOString(), tool: 'tools/motion-verify.mjs', env: p, asserts: [], ok: false };
  const A = (name, pass, expected, actual, evidence) => res.asserts.push({ name, pass: !!pass, expected, actual, evidence });

  if (!p.bash) { A('bash available', false, 'bash found', 'none', 'findBash() candidates all failed'); res.error = 'no bash'; writeJson(path.join(VERIFY, 'build.json'), res); return res; }
  const t0 = Date.now();
  const r = sh(p.bash.bin, ['build.sh'], { cwd: ANDROID });
  res.buildMs = Date.now() - t0;
  res.build = { bin: p.bash.bin, code: r.code, stdoutTail: tail(r.out, 14), stderrTail: tail(r.err, 10) };
  console.log('--- build.sh exit=' + r.code + ' (' + res.buildMs + 'ms) ---');
  console.log(tail(r.out, 14));
  A('android/build.sh exit 0', r.code === 0, 0, r.code, 'tools/motion-verify.mjs cmdBuild(): spawnSync(bash build.sh) in android/');

  const apkExists = fs.existsSync(APK_PATH);
  res.apk = apkExists ? { path: APK_PATH, bytes: fs.statSync(APK_PATH).size, md5: md5File(APK_PATH), sha256: sha256File(APK_PATH), mtime: fs.statSync(APK_PATH).mtime.toISOString() } : { path: APK_PATH };
  A('bin/dsh-phone.apk exists', apkExists, 'exists', apkExists ? 'exists' : 'missing', 'android/bin/dsh-phone.apk');
  if (!apkExists) { writeJson(path.join(VERIFY, 'build.json'), res); return res; }

  /* 旁车元数据：插件面板显示版本的唯一来源（插件不解包 APK，见 android/build.sh [8/8]） */
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(APK_META, 'utf8')); } catch (e) { meta = null; }
  res.sidecar = meta;
  A('bin/dsh-phone.apk.json readable', !!meta, 'json', meta ? 'ok' : 'unreadable', APK_META);
  if (meta) {
    A('sidecar.size == real apk bytes', meta.size === res.apk.bytes, res.apk.bytes, meta.size, 'fs.stat vs json');
    A('sidecar.md5 == real apk md5', meta.md5 === res.apk.md5, res.apk.md5, meta.md5, 'crypto.createHash over bin/dsh-phone.apk');
  }

  /* 包内真实版本 vs 旁车：这是「版本号正确」的核心断言（旁车错了面板就显示假版本） */
  const badging = dumpBadging(APK_PATH);
  res.badging = badging;
  if (badging.ok) {
    A('apk package == com.lc.phoneharness', badging.packageName === LOCAL_PKG, LOCAL_PKG, badging.packageName, 'aapt2 dump badging ' + APK_PATH);
    if (meta) {
      A('apk versionName == sidecar versionName', badging.versionName === meta.versionName, meta.versionName, badging.versionName, 'aapt2 dump badging vs bin/dsh-phone.apk.json');
      A('apk versionCode == sidecar versionCode', String(badging.versionCode) === String(meta.versionCode), String(meta.versionCode), String(badging.versionCode), 'aapt2 dump badging vs bin/dsh-phone.apk.json');
    }
  } else {
    res.asserts.push({ name: 'aapt2 dump badging', pass: false, expected: 'ok', actual: badging.why, evidence: AAPT2 });
  }

  /* 插件随包资源是否同源（不同源则面板下载安装的是旧包，属发布事故） */
  const assetMeta = path.join(ROOT, 'plugin', 'assets', 'dsh-phone.apk.json');
  if (fs.existsSync(assetMeta)) {
    let am = null; try { am = JSON.parse(fs.readFileSync(assetMeta, 'utf8')); } catch (e) {}
    res.pluginAssets = am;
    const same = am && meta && am.md5 === meta.md5;
    res.asserts.push({ name: 'plugin/assets/dsh-phone.apk.json 与 android/bin 同源', pass: !!same, expected: meta ? meta.md5 : null, actual: am ? am.md5 : null, evidence: assetMeta + ' (SYNC_ASSETS=1 时 build.sh 自动同步)' });
  }

  res.version = { versionName: meta ? meta.versionName : (badging.ok ? badging.versionName : null), versionCode: meta ? meta.versionCode : (badging.ok ? badging.versionCode : null), builtAt: meta ? meta.builtAt : null };
  res.ok = res.asserts.every((a) => a.pass);
  writeJson(path.join(VERIFY, 'build.json'), res);
  console.log('build ' + (res.ok ? 'PASS' : 'FAIL') + ' -> ' + path.join(VERIFY, 'build.json'));
  return res;
}

/* ---------- install ---------- */
function resolveLauncher(pkg) {
  const r = adbShell('cmd package resolve-activity --brief ' + pkg);
  const lines = (r.out || '').trim().split(NL).filter((l) => l.indexOf('/') > 0);
  return lines.length ? lines[lines.length - 1].trim() : null;
}
function crashLines(filter) {
  const r = adb('logcat', '-d', '-v', 'brief');
  return (r.out || '').split(NL).filter((l) => filter(l)).map((l) => l.trim()).slice(0, 40);
}

/* API 35 实测：dumpsys window windows 里已经没有 mCurrentFocus 字段（回显为空），
   能拿到前台的是 dumpsys activity activities 的 ResumedActivity。逐个来源探测，返回第一个有内容的。 */
function foregroundOwner() {
  const tries = [
    { src: 'dumpsys activity activities | grep ResumedActivity', cmd: 'dumpsys activity activities | grep -E ResumedActivity' },
    { src: 'dumpsys window | grep mCurrentFocus', cmd: 'dumpsys window | grep -E mCurrentFocus' },
    { src: 'dumpsys window displays | grep mFocusedApp', cmd: 'dumpsys window displays | grep -E mFocusedApp' },
  ];
  const attempts = [];
  for (const t of tries) {
    const r = adbShell(t.cmd);
    const line = (r.out || '').split(NL).map((l) => l.trim()).filter((l) => l.length > 0).pop() || '';
    attempts.push({ src: t.src, line });
    if (line.indexOf('null') < 0 && line.length > 0) return { line, src: t.src, attempts };
  }
  return { line: '', src: 'none', attempts };
}
function cmdInstall() {
  const p = probeEnv();
  ensureDir(VERIFY); ensureDir(path.join(ROOT, 'tools'));
  const apk = opt('apk', APK_PATH);
  const res = { cmd: 'install', at: new Date().toISOString(), device: DEVICE, apk, asserts: [], ok: false };
  const A = (name, pass, expected, actual, evidence) => res.asserts.push({ name, pass: !!pass, expected, actual, evidence });

  A('adb present', p.adb.ok, 'adb version ok', p.adb.version, ADB);
  A('device connected', p.device.connected, DEVICE, p.device.connected ? 'sdk ' + p.device.sdk : 'offline', 'adb -s ' + DEVICE + ' shell getprop ro.build.version.sdk');
  A('apk exists', fs.existsSync(apk), apk, fs.existsSync(apk) ? 'exists' : 'missing', apk);
  if (!fs.existsSync(apk)) { writeJson(path.join(VERIFY, 'install.json'), res); return res; }
  res.apkMd5 = md5File(apk);

  const inst = adb('install', '-r', '-t', apk);
  res.install = { code: inst.code, out: tail(inst.out + inst.err, 6) };
  console.log('--- adb install -r exit=' + inst.code + ' ---' + NL + res.install.out);
  A('adb install -r Success', inst.code === 0 && /Success/i.test(inst.out), 'Success', tail(inst.out + inst.err, 2), 'adb -s ' + DEVICE + ' install -r -t ' + apk);

  const dump = adbShell('dumpsys package ' + LOCAL_PKG);
  const vm = (dump.out || '').match(/versionName=([^\s]+)/);
  const vc = (dump.out || '').match(/versionCode=(\d+)/);
  res.installed = { versionName: vm ? vm[1] : null, versionCode: vc ? vc[1] : null };
  let sidecar = null; try { sidecar = JSON.parse(fs.readFileSync(APK_META, 'utf8')); } catch (e) {}
  if (sidecar && vm) A('设备上 versionName == 旁车', vm[1] === sidecar.versionName, sidecar.versionName, vm[1], 'dumpsys package vs bin/dsh-phone.apk.json');

  const comp = resolveLauncher(LOCAL_PKG);
  res.launcher = comp;
  A('launcher resolvable', !!comp, 'pkg/activity', comp || 'none', 'cmd package resolve-activity --brief ' + LOCAL_PKG);

  adb('logcat', '-c');
  sleepMs(400);
  const start = comp ? adbShell('am start -W -n ' + comp) : { out: '', err: '', code: 1 };
  res.start = { comp, code: start.code, out: tail(start.out, 8) };
  console.log('--- am start -W -n ' + comp + ' ---' + NL + res.start.out);
  A('am start 成功', /Status: ok/.test(start.out) || /Activity: /.test(start.out), 'Status: ok', tail(start.out, 2), 'am start -W -n ' + comp);

  /* MainActivity 是非 exported（AndroidManifest.xml:50），shell 起不来属预期；如实记录，不算失败。 */
  const direct = adbShell('am start -W -n ' + LOCAL_PKG + '/.MainActivity');
  res.directMainActivity = { code: direct.code, out: tail(direct.out + direct.err, 4), blocked: !/Status: ok/.test(direct.out) };
  console.log('--- direct MainActivity attempt (expected blocked, not exported) ---' + NL + res.directMainActivity.out);

  sleepMs(2500);
  const crash = crashLines((l) => /FATAL EXCEPTION|FATAL ANDROID|beginning of crash/.test(l));
  res.crashLines = crash;
  A('无 FATAL EXCEPTION（crash buffer）', crash.length === 0, '0 crash lines', crash.length + ' lines', 'adb logcat -d -v brief（启动前后窗口）');

  const fatalForPkg = crashLines((l) => /AndroidRuntime/.test(l) && l.indexOf(LOCAL_PKG) >= 0);
  res.fatalForPkg = fatalForPkg;
  A('无本包 AndroidRuntime 崩溃', fatalForPkg.length === 0, 0, fatalForPkg.length, 'adb logcat -d | AndroidRuntime 且含 ' + LOCAL_PKG);

  const fg = foregroundOwner();
  res.foreground = fg;
  A('前台是本 App', fg.line.indexOf(LOCAL_PKG) >= 0, LOCAL_PKG, fg.line || 'empty', fg.src + '（API 35 上 dumpsys window windows 已无 mCurrentFocus，实测回显空，改用 ResumedActivity）');

  const alive = adbShell('pidof ' + LOCAL_PKG);
  res.pid = (alive.out || '').trim();
  A('进程存活', res.pid.length > 0, 'pid', res.pid || 'none', 'adb shell pidof ' + LOCAL_PKG);

  res.ok = res.asserts.every((a) => a.pass);
  writeJson(path.join(VERIFY, 'install.json'), res);
  console.log('install ' + (res.ok ? 'PASS' : 'FAIL') + ' -> ' + path.join(VERIFY, 'install.json'));
  return res;
}

/* ---------- capture ---------- */
const STEPS = {
  launch: [],
  idle: [],
  drawer: [{ at: 900, act: 'swipe', a: [8, 1200, 760, 1200, 280] }],
  back: [{ at: 900, act: 'key', a: ['KEYCODE_BACK'] }],
};

/* ---------- MuMu 多屏：必须显式指定 display，否则录到的是 display 0（MuMu 桌面） ---------- */
/* 实测（2026-10-22，本机）：设备是 MuMu 模拟器，同时在线多个 display。am start 启动的 App 落在
   **它自己的 display**（不是 display 0）；而 screencap / screenrecord 不带 -d 时默认 display 0
   （screencap -h: "If the id is not given, it defaults to 4619827820427265280"）→ 录到的是 MuMu
   桌面的游戏推荐流，不是被测 App。这条坑会让全部采集证据作废。
   映射：dumpsys window displays 里 mCurrentFocus 含包名的那一块的 Display: mDisplayId=NN
        → dumpsys display 的 mViewports 把 displayId=NN 映到 uniqueId='local:<SFID>'
   -d 用法：screencap/screenrecord 的 -d 取 **SFID**；input 的 -d 取 **mDisplayId**。 */
function parseAppDisplayId(dump, pkg) {
  let cur = null; let hit = null;
  for (const l of String(dump || '').split(NL)) {
    const m = l.match(/Display:\s*mDisplayId=(\d+)/);
    if (m) { cur = Number(m[1]); continue; }
    if (cur !== null && l.indexOf('mCurrentFocus=') >= 0 && l.indexOf(pkg) >= 0) hit = cur;
  }
  return hit;
}
function sfIdForDisplayId(dump, mid) {
  const m = String(dump || '').match(new RegExp('displayId=' + mid + ",\\s*uniqueId='local:(\\d+)'"));
  return m ? m[1] : null;
}
function resolveAppDisplay(pkg) {
  const win = adbShell('dumpsys window displays').out || '';
  const mDisplayId = parseAppDisplayId(win, pkg);
  const sfId = mDisplayId === null ? null : sfIdForDisplayId(adbShell('dumpsys display').out || '', mDisplayId);
  return {
    pkg, mDisplayId, sfId,
    source: "dumpsys window displays 的 mCurrentFocus 所属 Display 块 → dumpsys display mViewports 的 uniqueId=local:<SFID>",
    note: 'screencap/screenrecord 的 -d 用 SFID；input 的 -d 用 mDisplayId',
  };
}

/* docs/motion-capture-protocol.md §4 的 A1-A12 标准交互脚本。
   两侧必须逐条一致执行：同一初始页面、同一坐标、同一手势参数。
   坐标基准 1080x2460（本机 wm size 实测 1080x2460，协议写 1080x2400，差 60px 已记入 limitations）。
   形如 [x,y] 的坐标是**暂定值**：能用 --tap x,y / --steps JSON 覆盖，最终值需 re-motion 与 lead 确认。 */
const PROTO = {
  A1: { name: '冷启动首帧', steps: [] },
  A2: { name: '列表项按下反馈（原地长按1.2s）', steps: [{ at: 1200, act: 'swipe', a: [540, 1200, 540, 1200, 1200] }] },
  A3: { name: '页面 push 转场（点列表第一项）', steps: [{ at: 1200, act: 'tap', a: [540, 1200] }] },
  A4: { name: '页面 pop 转场（详情页返回）', steps: [{ at: 1200, act: 'tap', a: [540, 1200] }, { at: 3000, act: 'key', a: ['KEYCODE_BACK'] }] },
  A5: { name: '弹层/底部弹窗进入', steps: [{ at: 1200, act: 'tap', a: [900, 300] }] },
  A6: { name: '弹层退出', steps: [{ at: 1200, act: 'tap', a: [900, 300] }, { at: 3400, act: 'key', a: ['KEYCODE_BACK'] }] },
  A7: { name: '主按钮按压反馈', steps: [{ at: 1200, act: 'swipe', a: [540, 2100, 540, 2100, 1200] }] },
  A8: { name: '加载/骨架屏', steps: [{ at: 1200, act: 'tap', a: [540, 1200] }] },
  A9: { name: '输入框聚焦+发送态', steps: [{ at: 1200, act: 'tap', a: [540, 2150] }, { at: 2400, act: 'text', a: ['hello'] }] },
  A10: { name: '列表惯性滚动+过滚', steps: [{ at: 1200, act: 'swipe', a: [540, 1600, 540, 500, 120] }] },
  A11: { name: '开关/勾选切换', steps: [{ at: 1200, act: 'tap', a: [880, 600] }] },
  A12: { name: 'Chip 选中/取消', steps: [{ at: 1200, act: 'tap', a: [300, 500] }] },
};

/* 协议 §3：gfxinfo framestats 是「权威逐帧时序」。
   注意它给的是**每帧的渲染时间戳/耗时**，能证明「这段时间内持续出帧」，
   但不是动画时长的直接读数 —— 因此本工具同时给 busyWindowMs（最长连续出帧段，gap>=50ms 断段）
   与 screenrecord 逐帧图像测得的时长做交叉校验，分歧 > 16.7ms 就写进 divergences。 */
function parseGfxinfo(text) {
  const lines = String(text || '').split(NL).map((l) => l.trim());
  const hdrIdx = lines.findIndex((l) => l.indexOf('---PROFILEDATA---') >= 0);
  if (hdrIdx < 0) return { rows: 0, note: '输出里没有 ---PROFILEDATA---：framestats 未开启或该段无绘制' };
  const header = (lines[hdrIdx + 1] || '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  const colCompleted = header.indexOf('FrameCompleted');
  if (colCompleted < 0) return { rows: 0, note: 'framestats 表头缺 FrameCompleted：' + header.join('|'), header };
  const dataRows = lines.slice(hdrIdx + 2).filter((l) => /^[0-9][0-9,]*$/.test(l)).map((l) => l.split(',').map((s) => Number(s.trim()))).filter((r) => r.length >= colCompleted + 1);
  const completed = dataRows.map((r) => r[colCompleted]).filter((n) => n > 0).sort((a, b) => a - b);
  const rows = dataRows;
  if (!completed.length) return { rows: rows.length, header, note: 'framestats 行 FrameCompleted 全为 0' };
  const diffsMs = completed.slice(1).map((v, i) => Math.round((v - completed[i]) / 1e6));
  const bursts = [];
  let start = 0;
  for (let i = 0; i < diffsMs.length; i += 1) {
    if (diffsMs[i] >= 50 || diffsMs[i] < 0) { bursts.push({ startIdx: start, endIdx: i, ms: Math.round((completed[i] - completed[start]) / 1e6) }); start = i + 1; }
  }
  bursts.push({ startIdx: start, endIdx: completed.length - 1, ms: Math.round((completed[completed.length - 1] - completed[start]) / 1e6) });
  const longest = bursts.slice().sort((a, b) => b.ms - a.ms)[0];
  const jank = diffsMs.filter((d) => d > 33).length;
  return {
    rows: rows.length, header, completedFrames: completed.length,
    firstCompletedMs: Math.round(completed[0] / 1e6), lastCompletedMs: Math.round(completed[completed.length - 1] / 1e6),
    windowMs: Math.round((completed[completed.length - 1] - completed[0]) / 1e6),
    busyWindowMs: longest ? longest.ms : null, busyFrames: longest ? longest.endIdx - longest.startIdx + 1 : null,
    bursts: bursts.filter((b) => b.ms > 30).slice(0, 12),
    jankFramesGt33ms: jank, maxIntervalMs: diffsMs.length ? Math.max.apply(null, diffsMs) : null,
    meanIntervalMs: diffsMs.length ? Math.round(diffsMs.reduce((a, b) => a + b, 0) / diffsMs.length) : null,
  };
}
const SCALE_KEYS = ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale'];
function readScales() {
  const o = {};
  for (const k of SCALE_KEYS) o[k] = (adbShell('settings get global ' + k).out || '').trim();
  return o;
}
/* target=1 测时长真值；target=5 慢放测曲线形状。always 记录 before/after，便于换算与复原。 */
function setScales(target) {
  const before = readScales();
  for (const k of SCALE_KEYS) adbShell('settings put global ' + k + ' ' + target);
  const after = readScales();
  const keyset = SCALE_KEYS.map((k) => after[k]).join('/');
  return { before, after, target: String(target), allEqualTarget: SCALE_KEYS.every((k) => after[k] === String(target)), keyset };
}
function screenrecordArgs(size, secs, outFile, displayId) {
  const a = ['shell', 'screenrecord', '--time-limit', String(secs), '--bit-rate', '8000000'];
  if (size) a.push('--size', size);
  /* screenrecord --help 实测支持 --display-id ID（默认主 display = display 0 = MuMu 桌面） */
  if (displayId) a.push('--display-id', String(displayId));
  a.push(outFile);
  return a;
}
function startScreenrecord(secs, outFile, size, displayId) {
  const args = ['-s', DEVICE].concat(screenrecordArgs(size, secs, outFile, displayId));
  const proc = spawn(ADB, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  proc.stdout.on('data', (d) => { out += String(d); });
  proc.stderr.on('data', (d) => { err += String(d); });
  return { proc, getOut: () => out, getErr: () => err, startedAt: Date.now() };
}

/* 实测：--time-limit 到点后设备端文件已完整，但 adb.exe 进程仍不回 exitCode（实测 exit=null，
   pull 回来的 mp4 却是完整可解的 6.0s）。所以判定「录制完成」以**设备端文件尺寸稳定**为准，
   稳定后主动 kill 掉那个挂着的 adb 进程，并把两路证据都写进 JSON。 */
function deviceFileSize(dev) {
  const r = adbShell('ls -l ' + dev);
  const m = (r.out || '').match(/(\d+)\s*$/);
  return m ? Number(m[1]) : -1;
}
function awaitScreenrecordDone(h, devFile, recordSecs) {
  const t = Date.now();
  const hardLimit = recordSecs * 1000 + 20000;
  let size = -1, stableSince = 0, sawFile = false;
  while (Date.now() - t < hardLimit) {
    const s = deviceFileSize(devFile);
    if (s > 0) {
      sawFile = true;
      if (s === size) { if (!stableSince) stableSince = Date.now(); if (Date.now() - stableSince > 1200) break; }
      else { size = s; stableSince = 0; }
    }
    if (h.proc.exitCode !== null && sawFile) break;
    sleepMs(250);
  }
  const procExited = h.proc.exitCode !== null;
  const elapsed = Date.now() - t;
  if (!procExited) { try { h.proc.kill(); } catch (e) {} }
  return { code: h.proc.exitCode, out: h.getOut(), err: h.getErr(), procExited, killedByTool: !procExited, deviceBytes: size, waitedMs: elapsed, stoppedBy: sawFile && size > 0 ? 'device-file-size-stable' : 'hard-limit' };
}

/* screenrecord 是阻塞进程；用同步轮询等它自然结束（--time-limit 到点自己退） */
function waitProc(h, timeoutMs) {
  const t = Date.now();
  while (h.proc.exitCode === null && Date.now() - t < timeoutMs) sleepMs(150);
  const timedOut = h.proc.exitCode === null;
  if (timedOut) { try { h.proc.kill(); } catch (e) {} }
  return { code: h.proc.exitCode, out: h.getOut(), err: h.getErr(), timedOut };
}
/* input 实测支持 -d DISPLAY_ID（Usage: input [<source>] [-d DISPLAY_ID] <command> [<arg>...]）：
   不带 -d 的 tap/swipe/keyevent 会打到 display 0（MuMu 桌面），App 收不到任何输入。 */
/* ---------- cap.sh 桥：lead 落盘的共享采集原语（tools/cap.sh，本人只读调用）
   为什么所有截图/输入都必须走它（lead 实测 + 我的实测一致）：
     ① 裸 screencap 会 "Multiple displays were found... defaulting to the first" → 抓到 display 0 = MuMu 桌面；
     ② input 不带 -d 会把 tap/swipe 打到 display 0（桌面）；
     ③ 每个 App 的 display 逻辑 id / uniqueId 每次启动都会变，写死必错。
   cap.sh 内部按「焦点方块 → dumpsys display mViewports 的 uniqueId」解析，因此每次调用都重新解析。
   代价：每次调用多一次 dumpsys 往返（本脚本在 capture 开始时做 3 次计时标定写进证据）。 */
const CAP_SH = path.join(ROOT, 'tools', 'cap.sh');
function capRun(args) {
  const p = probeEnv();
  if (!p.bash) return { code: null, out: '', err: 'cap.sh 需要 bash：未探测到可用 bash' };
  return sh(p.bash.bin, [CAP_SH].concat(args));
}
function capDisp(pkg) { const r = capRun(['disp', pkg]); return r.code === 0 ? parseInt((r.out || '').trim(), 10) : null; }
function capUid(pkg) { const r = capRun(['uid', pkg]); return r.code === 0 ? (r.out || '').trim() : null; }
function capFront(pkg) { return capRun(['front', pkg]).code === 0; }
function capShot(pkg, outPath) { return capRun(['shot', pkg, outPath]); }
function capMode(mode) { return capRun(['mode', mode]); }
function uiModeNight() {
  const r = adbShell('cmd uimode night');
  const m = (r.out || '').match(/night\s*:?\s*(yes|no)/i);
  return m ? m[1].toLowerCase() : (r.out || '').trim();
}
function displayFacts() {
  return {
    wmSize: (adbShell('wm size').out || '').trim().split(NL).join(' | '),
    wmDensity: (adbShell('wm density').out || '').trim().split(NL).join(' | '),
    uiModeNight: uiModeNight(),
  };
}
/* ---------- screencap 突发（保证通道）：MuMu 虚拟屏上 screenrecord 常「空闲即收尾」——
   同一条命令实测有时拿到 39 帧/766ms（splash→主页转场），有时只 1 帧（录制开始时屏幕空闲）。
   所以再跑一路 screencap 突发兜底：单次 exec-out 往返约 200ms（实测 20 帧 3462ms ≈ 5fps），
   每帧带 wall-clock 偏移。display 的 uid 仍由 cap.sh 解析（不写死、绝不落 display 0）。 */
function captureBurstWithSteps(pkg, name, steps, secs, opts) {
  const o = opts || {};
  const dir = path.join(VERIFY, name + '-burst');
  ensureDir(dir);
  for (const f of fs.readdirSync(dir)) { if (f.endsWith('.png')) fs.unlinkSync(path.join(dir, f)); }
  /* 冷启动场景：App 的 display 随启动才创建，先 force-stop 才能让 am start 成为一次真实冷启动
     （实测：App 已在首页时再 am start .SplashActivity → 「intent has been delivered to currently
     running top-most instance」，画面完全不动，warm 重放物理上不可执行） */
  if (o.forceStopFirst) { adbShell('am force-stop ' + pkg); sleepMs(700); }
  const uid0 = capUid(pkg);
  const t0 = Date.now();
  const byAt = steps.slice().sort((a, b) => a.at - b.at);
  let si = 0; const stepLog = []; const timeline = []; let uidResolves = 0; let uidCur = uid0; let firstUid = null;
  const deadline = t0 + Math.max(2, secs) * 1000;
  let nullStreak = 0;
  while (Date.now() < deadline) {
    while (si < byAt.length && byAt[si].at <= Date.now() - t0) {
      const s = byAt[si]; let r = null; let via = null; let out = '';
      if (s.act === 'amstart') {
        r = adbShell('am start -W -n ' + s.a[0]); out = tail(r.out, 4);
        if (r.code !== 0) { sleepMs(600); r = adbShell('am start -W -n ' + s.a[0]); out = tail(r.out, 4); } /* 实测会偶发 Broken pipe (32) */
      }
      if (s.act === 'amstart') { r = adbShell('am start -n ' + s.a[0]); via = 'am start'; }
      else if (s.act === 'tap') { r = capRun(['tap', pkg, String(s.a[0]), String(s.a[1])]); via = 'cap.sh tap'; }
      else if (s.act === 'swipe') { r = capRun(['swipe', pkg].concat(s.a.map(String))); via = 'cap.sh swipe'; }
      else if (s.act === 'key') { r = capRun(['key', pkg, String(s.a[0])]); via = 'cap.sh key'; }
      const tt = out.match(/TotalTime: (\d+)/);
      stepLog.push({ atMs: Date.now() - t0, step: s, via, code: r ? r.code : null, out, totalTimeMs: tt ? Number(tt[1]) : null });
      if (s.act === 'amstart') { const u2 = capUid(pkg); if (u2) { uidCur = u2; uidResolves += 1; if (!firstUid) firstUid = u2; } }
      si += 1;
    }
    if (!uidCur) { const uu = capUid(pkg); if (uu) { uidCur = uu; uidResolves += 1; if (!firstUid) firstUid = uu; } }
    if (!uidCur) {
      timeline.push({ atMs: Date.now() - t0, bytes: 0, code: null, isPng: false, dims: null, uid: null, path: null, err: 'uid 未解析：App display 尚未创建（冷启动前）' });
      nullStreak += 1;
      if (nullStreak > 10) break;   /* 别把整个窗口耗在解析上：实测空转 capUid 每次约 85ms */
      sleepMs(120); continue;
    }
    const idx = timeline.length + 1;
    const f = path.join(dir, 'b' + String(idx).padStart(3, '0') + '.png');
    /* encoding:'buffer' —— sh() 默认 utf8，二进制 PNG 会被替换成 U+FFFD 而写坏 */
    const rr = sh(ADB, ['-s', DEVICE, 'exec-out', 'screencap', '-d', uidCur, '-p'], { maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' });
    const buf = rr.out;
    const bytes = buf ? (Buffer.isBuffer(buf) ? buf.length : Buffer.byteLength(String(buf))) : 0;
    const isPng = Buffer.isBuffer(buf) && bytes > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    /* PNG IHDR：宽高在 16..24 字节，大端；用来证明抓到的不是 display 0（1080x2460）而是 App display（1080x1920） */
    const dims = isPng ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : null;
    const rec = { atMs: Date.now() - t0, bytes, code: rr.code, isPng, dims, uid: uidCur, path: null };
    if (!isPng && bytes < 5000) { const u3 = capUid(pkg); if (u3) { uidCur = u3; uidResolves += 1; } /* App 每次 am start 换 display：失败就重解析 */ }
    if (rr.code === 0 && isPng) { fs.writeFileSync(f, buf); rec.path = f; rec.name = path.basename(f); }
    else rec.err = tail(String(rr.err), 1);
    timeline.push(rec);
  }
  const good = timeline.filter((x) => x.path);
  const spanMs = good.length > 1 ? good[good.length - 1].atMs - good[0].atMs : null;
  const dimSet = {};
  for (const x of good) { if (x.dims) { const k = x.dims.w + 'x' + x.dims.h; dimSet[k] = (dimSet[k] || 0) + 1; } }
  const out = {
    method: 'screencap-burst', dir, uid: uid0, firstUid, uidResolves, dims: dimSet, frames: good.length, attempts: timeline.length,
    spanMs, fps: spanMs ? Number(((good.length - 1) / (spanMs / 1000)).toFixed(2)) : null,
    timeline, stepLog,
    forceStopFirst: !!o.forceStopFirst,
    note: '这一路会把交互脚本再放一遍（与 screenrecord 那一路分开），因此「同一个动效」在本 JSON 里有两路证据；时间戳是 wall-clock 偏移，不是屏幕 PTS',
  };
  writeJson(path.join(VERIFY, name + '-burst.json'), out);
  return out;
}
function doSteps(steps, t0, pkg) {
  const log = [];
  const byAt = steps.slice().sort((a, b) => a.at - b.at);
  for (const s of byAt) {
    const wait = s.at - (Date.now() - t0);
    if (wait > 0) sleepMs(wait);
    let r = null; let via = null;
    if (s.act === 'tap') { r = capRun(['tap', pkg, String(s.a[0]), String(s.a[1])]); via = 'cap.sh tap'; }
    else if (s.act === 'swipe') { r = capRun(['swipe', pkg].concat(s.a.map(String))); via = 'cap.sh swipe'; }
    else if (s.act === 'key') { r = capRun(['key', pkg, String(s.a[0])]); via = 'cap.sh key'; }
    else if (s.act === 'text') { r = capRun(['text', pkg, String(s.a[0])]); via = 'cap.sh text'; }
    else if (s.act === 'shot') { r = capShot(pkg, s.a[0]); via = 'cap.sh shot'; }
    else if (s.act === 'amstart') { r = adbShell('am start -W -n ' + s.a[0]); via = 'am start -W'; }
    log.push({ atMs: Date.now() - t0, issuedAtMs: Date.now() - t0, step: s, via, code: r ? r.code : null, out: r ? tail(r.out, 2) : null });
    console.log('  step t=' + (Date.now() - t0) + 'ms via=' + via + ' ' + JSON.stringify(s));
  }
  return log;
}
/* 抽帧：不强制 fps。
   API 35 模拟器 screenrecord 产出的是**变帧率**流（实测 r_frame_rate=60000/1001 但 avg_frame_rate≈21fps），
   用 -vf fps=30 会把同一帧复制出来凑数（实测 126 真实帧被写成 180 张），时长/缓动一律失真。
   所以：1) ffprobe -show_frames 取每帧 pts_time；2) ffmpeg -fps_mode passthrough 原样导出；
   3) 断言张数 == 时间戳数。时间轴以 pts_time 为准，帧号只作证据索引。 */
function frameTimestamps(mp4) {
  const p = probeEnv();
  const r = sh(p.ffprobe.bin, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', mp4]);
  return (r.out || '').split(NL).map((s) => s.trim()).filter((s) => s.length > 0 && s !== 'N/A').map(Number);
}
function extractFrames(mp4, outDir, fpsHint) {
  const p = probeEnv();
  ensureDir(outDir);
  if (!p.ffmpeg) return { method: 'none', frames: 0, dir: outDir, why: 'ffmpeg 不可用：capture 阶段退回 screencap 轮询，帧率上限约 10fps' };
  /* 必须先清空目录：否则 readdir 会把上一轮的旧帧也算进 frames（实测 167 张里只有 94 张是本轮的），
     使得 frames 与 PTS 数不一致。 */
  for (const f of fs.readdirSync(outDir)) { if (f.endsWith('.png')) fs.unlinkSync(path.join(outDir, f)); }
  const pattern = path.join(outDir, 'f%05d.png');
  const r = sh(p.ffmpeg.bin, ['-hide_banner', '-loglevel', 'error', '-i', mp4, '-fps_mode', 'passthrough', pattern]);
  const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.png')).sort();
  let ts = []; let tsErr = null;
  try { ts = frameTimestamps(mp4); } catch (e) { tsErr = String(e.message); }
  const tsPath = path.join(path.dirname(outDir), path.basename(outDir) + '.frames.json');
  writeJson(tsPath, { source: mp4, count: files.length, pts: ts, fpsHint: fpsHint || null });
  const avg = ts.length > 1 ? (ts[ts.length - 1] - ts[0]) / (ts.length - 1) : null;
  return {
    method: 'ffmpeg-vfr-passthrough', code: r.code, frames: files.length, dir: outDir,
    ptsCount: ts.length, timestampsPath: tsPath, timestamps: ts,
    spanSec: ts.length > 1 ? Number((ts[ts.length - 1] - ts[0]).toFixed(3)) : null,
    avgIntervalMs: avg ? Math.round(avg * 1000) : null,
    vfr: true, tsErr, stderrTail: tail(r.err, 4),
  };
}
function captureScreencapSequence(outDir, secs, fps, sfId) {
  const p = probeEnv();
  ensureDir(outDir);
  const interval = Math.max(100, Math.round(1000 / fps));
  const t0 = Date.now();
  let n = 0;
  while (Date.now() - t0 < secs * 1000) {
    n += 1;
    const sc = ['-s', DEVICE, 'exec-out', 'screencap'];
    if (sfId) sc.push('-d', String(sfId));
    const r = sh(ADB, sc.concat(['-p']), { encoding: 'buffer' });
    const f = path.join(outDir, 's' + String(n).padStart(4, '0') + '.png');
    if (r.code === 0 && r.stdout && r.stdout.length > 1000) fs.writeFileSync(f, r.stdout);
    const wait = interval - (Date.now() - t0) % interval;
    if (wait > 0) sleepMs(wait);
  }
  return { method: 'screencap', fps: Math.round(1000 / interval), frames: n, dir: outDir, limitation: '帧率受 screencap 单帧耗时限制，实测约 ' + Math.round(1000 / interval) + 'fps；时间轴抖动由 shell 往返决定' };
}
function cmdCapture() {
  const p = probeEnv();
  ensureDir(VERIFY); ensureDir(path.join(ROOT, 'tools'));
  const name = opt('name', 'capture-' + Date.now());
  const pkg = opt('pkg', LOCAL_PKG);
  const secs = Number(opt('secs', '6'));
  const seq = opt('seq', 'launch');
  const fps = Number(opt('fps', '30'));
  const outDir = path.join(VERIFY, name);
  const mp4 = path.join(VERIFY, name + '.mp4');
  const devFile = '/sdcard/motion-' + name + '.mp4';
  const res = { cmd: 'capture', at: new Date().toISOString(), name, pkg, secs, seq, fps, device: DEVICE, asserts: [], limitations: [], ok: false };
  const A = (n, pass, expected, actual, evidence) => res.asserts.push({ name: n, pass: !!pass, expected, actual, evidence });

  const scaleTarget = opt('scale', '1');
  const scales = setScales(scaleTarget);
  res.animScales = scales;
  res.animScalePolicy = {
    rule: '任何时长都必须写「在 scale=X 下测得 Y ms，折算真值 Z ms」；Z = Y / 对应 scale（lead 2026-10-22 规则 1-4）',
    divisorFor: {
      activityTransition: 'transition_animation_scale（Activity 转场 / windowAnimation）',
      propertyAndCompose: 'animator_duration_scale（ViewPropertyAnimator / ValueAnimator / Compose MotionDurationScale）',
    },
    measuredAtScale: scales.after,
    originalScaleBeforeThisRun: scales.before,
  };
  console.log('--- 动画缩放 target=' + scaleTarget + '：before=' + JSON.stringify(scales.before) + ' after=' + JSON.stringify(scales.after) + ' ---');
  console.log('--- 时长换算：真值 = 实测 / ' + scaleTarget + '（转场用 transition_animation_scale，属性/Compose 动画用 animator_duration_scale）---');
  A('动画缩放已置为 target=' + scaleTarget, scales.allEqualTarget, scaleTarget + '/' + scaleTarget + '/' + scaleTarget, scales.keyset, 'adb shell settings put/get global *_animation_scale（统一前置，否则测到的是被系统缩放后的时长）');
  const prevScales = scales.before;

  const comp = resolveLauncher(pkg);
  res.launcher = comp;
  A('对端 launcher 可解析', !!comp, pkg + '/activity', comp || 'none', 'cmd package resolve-activity --brief ' + pkg);

  /* MuMu 多屏（实测 2026-10-22）：App 落在**自己的 display** 上，且每次 am start 会分配一个新
     display（随 App 一起销毁）；`--display-id` 只接受 **SurfaceFlinger 侧那个 64 位 id**
     （dumpsys SurfaceFlinger --display-id 里的 "mumuscreen0NN"），传框架 mDisplayId 会报
     "Invalid physical display ID"；screencap / screenrecord / input 不带 -d 全落在 display 0
     = MuMu 桌面（游戏推荐流）→ 证据作废。
     因此采集顺序固定为：先 am start 把 App 拉起来 → 轮询等焦点落到它的 display → 解析 id →
     再开录。代价：录不到「App 启动之前」的帧，A1 冷启动改用 warm 重放 + res.coldStart 截图。 */
  res.display = {
    policy: 'MuMu 多屏：App 落在自己的 display（框架 mDisplayId 每次启动都会变），采集必须显式指定 -d',
    mapping: 'mCurrentFocus 所在 Display 块的 mDisplayId（input -d）→ dumpsys display mViewports 的 uniqueId=local:<SFID>（screencap/screenrecord -d）',
    note: 'screenrecord --display-id 只接受 SF 的 64 位 id；传框架 id 会报 Invalid physical display ID',
  };
  let disp = null;
  if (comp) {
    /* 先 force-stop：否则上一轮残留的 App 实例还在旧 display 上（窗口未聚焦），
       dumpsys 里所有 Display 块的 mCurrentFocus 都是 null，解析必失败（实测踩到过）。 */
    adbShell('am force-stop ' + pkg);
    sleepMs(600);
    const s0 = adbShell('am start -W -n ' + comp);
    res.display.startOut = tail(s0.out, 6);
    for (let i = 0; i < 10 && (!disp || disp.mDisplayId === null || !disp.sfId); i += 1) {
      sleepMs(300);
      disp = resolveAppDisplay(pkg);
    }
  }
  res.display.acquired = disp;
  const mDisp = disp ? disp.mDisplayId : null;
  const sDisp = disp ? disp.sfId : null;
  res.display.usedForInput = mDisp;
  res.display.usedForRecord = sDisp;
  A('已解析 App 所在 display（非 display 0）', mDisp !== null && mDisp !== 0 && !!sDisp, 'mDisplayId != 0 且 SFID 非空', 'mDisplayId=' + mDisp + ' sfId=' + sDisp, 'am start 后轮询 resolveAppDisplay(' + pkg + ')，上限 10×300ms');

  /* lead 要求：采集原语统一走 tools/cap.sh；两套解析必须一致，否则事件与画面可能不在同一块屏上 */
  const capD = comp ? capDisp(pkg) : null;
  const capU = comp ? capUid(pkg) : null;
  const capLat = [];
  for (let i = 0; i < 3; i += 1) { const t = Date.now(); capRun(['disp', pkg]); capLat.push(Date.now() - t); }
  res.capsSh = {
    dispId: capD, uid: capU,
    agree: capD !== null && capU !== null && String(capD) === String(mDisp) && String(capU) === String(sDisp),
    resolveLatencyMs: capLat,
    note: 'cap.sh 的 disp/uid 每次调用都会重新解析（焦点方块 → dumpsys display mViewports 的 uniqueId），因此每个 input 多一次 dumpsys 往返：这就是 step 的 issuedAtMs 会晚于 at 的原因',
  };
  A('cap.sh 解析出的 display 与脚本自带解析一致', res.capsSh.agree, 'disp=' + mDisp + ' uid=' + sDisp, 'disp=' + capD + ' uid=' + capU, 'tools/cap.sh disp|uid ' + pkg);
  if (!res.capsSh.agree) res.limitations.push('cap.sh 与脚本自带解析不一致：本轮 input 与截图都走 cap.sh（以它为准），若它解析错则事件落错屏');
  const modeOpt = opt('mode', null);
  if (modeOpt) { capMode(modeOpt); res.uiModeForced = modeOpt; }
  res.display.factsBefore = displayFacts();
  res.ui_mode = res.display.factsBefore.uiModeNight;
  res.display_size = res.display.factsBefore.wmSize;
  res.density = res.display.factsBefore.wmDensity;
  console.log('--- 屏幕事实：ui_mode(night)=' + res.ui_mode + ' size=' + res.display_size + ' density=' + res.density + (modeOpt ? '（已按 --mode ' + modeOpt + ' 切换）' : '') + ' ---');
  console.log('--- cap.sh 解析延迟 ' + JSON.stringify(capLat) + 'ms ---');

  const protoId = opt('id', null);
  res.protocolId = protoId;
  res.protocolName = protoId && PROTO[protoId] ? PROTO[protoId].name : null;
  if (protoId && !PROTO[protoId]) { res.limitations.push('未知协议 id ' + protoId + '：已按空脚本采集'); }
  let steps = protoId && PROTO[protoId] ? PROTO[protoId].steps.slice() : (STEPS[seq] || []);
  const override = opt('steps', null);
  if (override) { try { steps = JSON.parse(override); res.limitations.push('steps 被 --steps 覆盖：' + override); } catch (e) { res.limitations.push('--steps 解析失败，改用默认脚本'); } }
  const tapXY = opt('tap', null);
  if (tapXY) { const p = tapXY.split(',').map(Number); steps = [{ at: 1200, act: 'tap', a: p }]; res.limitations.push('脚本被 --tap 覆盖为 (' + p + ')'); }
  if (protoId) res.limitations.push('协议脚本坐标是按 1080x2460 暂定的值（协议写 1080x2400）；App 实际渲染在自己的 display 上，实测 1080x1920 —— 坐标须按 1080x1920 重定，否则点在屏幕外');
  /* A1（冷启动）在 MuMu 上录不到「启动前」：App 的 display 随启动才创建。改为 warm 重放——
     App 已在它自己的 display 上，再由 am start 重放 SplashActivity（620ms 停留 + 转场到主页）。 */
  if (protoId === 'A1' && comp && !flag('no-warm-splash')) {
    steps = [{ at: 1200, act: 'amstart', a: [comp] }];
    res.limitations.push('A1 为 warm 重放（am start .SplashActivity 触发启动页→主页转场）：冷启动本身录不到，见 res.coldStart 的首帧截图与 am start -W 时长');
  }
  res.steps = steps;
  adbShell('dumpsys gfxinfo ' + pkg + ' reset');
  const recordSecs = Math.max(secs, 3);
  const sr = startScreenrecord(recordSecs, devFile, opt('size', null), sDisp);
  sleepMs(700);
  const t0 = Date.now();
  res.stepLog = doSteps(steps, t0, pkg);
  if (comp) {
    sleepMs(300);
    res.display.afterRecord = resolveAppDisplay(pkg);
    const same = !!res.display.afterRecord && res.display.afterRecord.sfId === sDisp;
    A('录制期间 App display 未漂移', same, 'sfId=' + sDisp, res.display.afterRecord ? 'sfId=' + res.display.afterRecord.sfId : 'unknown', '录制后重解析：漂移=本轮录到别的 display，证据无效');
    if (!same) res.limitations.push('display 在录制期间漂移：本轮画面可能不是被测 App，需作废重录');
  }
  const remaining = Math.max(0, recordSecs * 1000 - (Date.now() - t0) + 700);
  if (remaining > 0) sleepMs(remaining);
  const srRes = awaitScreenrecordDone(sr, devFile, recordSecs);
  res.screenrecord = { code: srRes ? srRes.code : null, tail: tail((srRes ? srRes.out + srRes.err : ''), 4) };
  console.log('--- screenrecord exit=' + res.screenrecord.code + ' ---' + NL + res.screenrecord.tail);

  const pull = adb('pull', devFile, mp4);
  res.pull = { code: pull.code, tail: tail(pull.out + pull.err, 3) };
  A('录制文件已 pull 回本地', fs.existsSync(mp4) && fs.statSync(mp4).size > 20000, '>20KB mp4', fs.existsSync(mp4) ? fs.statSync(mp4).size + ' bytes' : 'missing', mp4);
  adbShell('rm -f ' + devFile);

  /* 冷启动（A1 语义）：录不到的「启动前」部分用两路证据补：
     ① am start -W 的 TotalTime/WaitTime（scale=1 下的真实冷启动时长，里程碑有 Internal/Termination 定义）
     ② 启动后立刻解析它新建的 display 并连拍若干首帧截图（带 atMsAfterLaunch 时间戳） */
  if (flag('cold') || protoId === 'A1') {
    adbShell('am force-stop ' + pkg);
    sleepMs(700);
    adb('logcat', '-c');
    const cs0 = Date.now();
    const cstart = comp ? adbShell('am start -W -n ' + comp) : { out: '', code: 1 };
    res.coldStart = {
      startOut: tail(cstart.out, 10), wallMs: Date.now() - cs0,
      evidence: 'am start -W 报告（LaunchState/TotalTime/WaitTime），scale=' + scaleTarget,
    };
    res.coldStart.totalMs = Number((String(res.coldStart.startOut).match(/TotalTime: (\d+)/) || [])[1]);
    res.coldStart.launchState = (String(res.coldStart.startOut).match(/LaunchState: (\w+)/) || [])[1] || null;
    res.coldStart.limitation = 'App 的 display 随 App 启动才创建：screenrecord 无法录到「启动之前」；冷启动的连续转场证据在 res.burst（该通道对 A1 会先 force-stop 再真实 am start），' +
      '并且 App 已在首页时再 am start .SplashActivity 是「intent has been delivered to currently running top-most instance」= 画面完全不动（实测 8 帧 md5 全同），所以不存在 warm 重放这条路';
    res.limitations.push(res.coldStart.limitation);
    console.log('--- coldStart TotalTime=' + res.coldStart.totalMs + 'ms LaunchState=' + res.coldStart.launchState + ' ---');
  }

  if (fs.existsSync(mp4)) {
    res.mp4 = { path: mp4, bytes: fs.statSync(mp4).size, md5: md5File(mp4) };
    if (p.ffprobe) {
      const pr = sh(p.ffprobe.bin, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration', '-count_frames', '-of', 'json', mp4]);
      try { const j = JSON.parse(pr.out); res.video = j.streams ? j.streams[0] : null; } catch (e) { res.video = { parseError: tail(pr.err, 3) }; }
      if (res.video && res.video.nb_read_frames) A('抽帧源有效（帧数>0）', Number(res.video.nb_read_frames) > 0, '>0', res.video.nb_read_frames, 'ffprobe -count_frames ' + mp4);
      if (res.video && res.video.height) {
        A('录制分辨率 = App display（非 display 0 的 2460 高）', Number(res.video.height) !== 2460, '1080x1920（App display）', res.video.width + 'x' + res.video.height, 'ffprobe stream=width,height：display 0 被 wm size override 成 1080x2460，App display 实测 1080x1920');
      }
    } else { res.limitations.push('ffprobe 不可用：无法给出精确帧率/帧数'); }
    res.frames = extractFrames(mp4, outDir, fps);
    if (res.frames.method === 'none') { res.frames = captureScreencapSequence(outDir, recordSecs, 10, sDisp); res.limitations.push(res.frames.limitation); }
    delete res.frames.timestamps;
    console.log('--- 抽帧 ' + res.frames.method + ' frames=' + res.frames.frames + ' pts=' + res.frames.ptsCount + ' 平均帧间隔=' + res.frames.avgIntervalMs + 'ms 跨度=' + res.frames.spanSec + 's -> ' + outDir + ' ---');
    if (res.frames.avgIntervalMs && res.frames.avgIntervalMs > 25) res.limitations.push('模拟器 screenrecord 为变帧率，平均帧间隔 ' + res.frames.avgIntervalMs + 'ms（约 ' + Math.round(1000 / res.frames.avgIntervalMs) + 'fps）：测 200ms 级动效只有 ' + Math.round(200 / res.frames.avgIntervalMs) + ' 个采样点；短时长必须用 --scale 5 慢放再除以 5 交叉验证');
    A('抽帧成功', res.frames.frames > 0, '>0 frames', res.frames.frames, outDir);
    if (res.frames.frames < 5) res.limitations.push('screenrecord 通道只拿到 ' + res.frames.frames + ' 帧（MuMu 虚拟屏空闲即收尾：实测同一命令有时 39 帧/766ms、有时只 1 帧）：compare 的逐帧曲线应以 res.burst 为准');
  }

  /* 兜底通道：screencap 突发（约 5fps，确定性；会把交互脚本重放一遍） */
  const maxAt = steps.reduce((m, s) => Math.max(m, s.at || 0), 0);
  /* A1 的 warm 重放实测是 no-op（splash 已是 top-most，intent 被投递给现有实例）→ 这一路改成
     「先 force-stop 再真实冷启动」，才能在同一 display 上连续抓到 splash→主页转场 */
  /* A1 专用的 burst 步骤：把 amstart 移到 t=0，让整个窗口都花在「启动后」的帧上
     （协议里 A1 的 warm 重放（at=1200ms）实测是 no-op，见 coldStart.limitation） */
  const burstSteps = steps.some((s) => s.act === 'amstart') ? [{ at: 0, act: 'amstart', a: [steps.filter((s) => s.act === 'amstart')[0].a[0]] }] : steps;
  res.burstSteps = burstSteps;
  res.burst = captureBurstWithSteps(pkg, name, burstSteps, Math.min(8, Math.max(3, maxAt / 1000 + 2.5)),
    { forceStopFirst: burstSteps.some((s) => s.act === 'amstart') });
  console.log('--- screencap 突发 frames=' + res.burst.frames + ' fps=' + res.burst.fps + ' dims=' + JSON.stringify(res.burst.dims) + ' uidResolves=' + res.burst.uidResolves + ' -> ' + res.burst.dir + ' ---');
  A('screencap 突发拿到帧且尺寸=App display（1080x1920，非 display 0 的 1080x2460）',
    res.burst.frames > 0 && Object.keys(res.burst.dims || {}).includes('1080x1920'),
    'frames>0 且 dims 含 1080x1920', 'frames=' + res.burst.frames + ' dims=' + JSON.stringify(res.burst.dims),
    res.burst.dir + ' 的 PNG IHDR（16..24 字节）');

  /* 收尾复位：lead 规则 5 —— 测完把 scale 复位成 1，别把共用机器留在 5 倍上 */
  for (const k of SCALE_KEYS) adbShell('settings put global ' + k + ' 1');
  const finalScales = readScales();
  res.animScalesFinal = finalScales;
  res.animScalesRestoredTo1 = SCALE_KEYS.every((k) => finalScales[k] === '1');
  console.log('--- 收尾 scale=' + JSON.stringify(finalScales) + ' ---');

  /* 协议 §3：gfxinfo framestats 逐帧时序（权威），与 screenrecord 交叉校验 */
  const gfx = adbShell('dumpsys gfxinfo ' + pkg + ' framestats');
  const gfxPath = path.join(VERIFY, name + '-gfxinfo.txt');
  if (gfx.out) fs.writeFileSync(gfxPath, gfx.out, 'utf8');
  res.gfxinfo = parseGfxinfo(gfx.out);
  res.gfxinfo.path = gfxPath;
  console.log('--- gfxinfo framestats: rows=' + res.gfxinfo.rows + ' completed=' + (res.gfxinfo.completedFrames || 0) + ' busyWindow=' + res.gfxinfo.busyWindowMs + 'ms jank(>33ms)=' + (res.gfxinfo.jankFramesGt33ms || 0) + ' -> ' + gfxPath + ' ---');
  A('gfxinfo framestats 已落盘', !!gfx.out && gfx.out.length > 0, 'non-empty', (gfx.out || '').length + ' bytes', 'dumpsys gfxinfo ' + pkg + ' framestats');

  res.screens = {};
  try {
    const shot = path.join(VERIFY, name + '-final.png');
    const r0 = capShot(pkg, shot);
    if (r0.code === 0 && fs.existsSync(shot)) { res.screens.final = shot; res.screens.finalBytes = fs.statSync(shot).size; res.screens.finalDisplayUsed = sDisp; }
    res.screens.via = 'tools/cap.sh shot ' + pkg + ' ' + shot;
    res.screens.code = r0.code;
  } catch (e) { res.screens.err = String(e.message); }

  /* lead 要求的前置自检：抓到的是不是目标 App。
     本机焦点匹配会串台（lead 实测 3 次抓到别的 app），所以宁可报 false 也不写假通过；
     人眼复核入口 = res.screens.final（本地 PNG）。 */
  const front = capFront(pkg);
  res.capture_verified = {
    front, via: 'tools/cap.sh front ' + pkg + '（exit 0 = 该包在前台）',
    videoHeight: res.video ? Number(res.video.height) : null,
    videoIsAppDisplay: !!res.video && Number(res.video.height) === 1920,
    frames: res.frames ? res.frames.frames : 0,
    capAgree: !!res.capsSh && res.capsSh.agree,
    value: front && !!res.video && Number(res.video.height) === 1920 && !!(res.frames && res.frames.frames > 0) && !!res.capsSh && res.capsSh.agree,
    humanCheck: res.screens.final || null,
  };
  A('capture_verified：抓到的确实是目标 App', res.capture_verified.value, 'true', String(res.capture_verified.value), 'front(cap.sh)=' + front + ' + 视频高=' + (res.video ? res.video.height : '?') + '（App display=1080x1920；display 0 桌面=1080x2460） + frames>0 + cap.sh 与 dumpsys 解析一致；最终截图见 ' + (res.screens.final || '-'));

  res.ok = res.asserts.every((a) => a.pass);
  writeJson(path.join(VERIFY, name + '.json'), res);
  console.log('capture ' + (res.ok ? 'PASS' : 'FAIL') + ' -> ' + path.join(VERIFY, name + '.json'));
  return res;
}

/* ---------- probe-display：MuMu 多屏映射体检（只读；--launch 才动设备） ---------- */
function cmdProbeDisplay() {
  ensureDir(VERIFY); ensureDir(path.join(ROOT, 'tools'));
  if (flag('launch')) {
    const comp = resolveLauncher(opt('pkg', LOCAL_PKG));
    if (comp) { adbShell('am start -W -n ' + comp); sleepMs(2400); }
  }
  const win = adbShell('dumpsys window displays').out || '';
  const dsp = adbShell('dumpsys display').out || '';
  const pairs = [];
  const re = /displayId=(\d+),\s*uniqueId='local:(\d+)'/g; let m;
  while ((m = re.exec(dsp))) pairs.push({ mDisplayId: Number(m[1]), sfId: m[2] });
  const focus = []; let cur = null;
  for (const l of win.split(NL)) {
    const mm = l.match(/Display:\s*mDisplayId=(\d+)/);
    if (mm) { cur = Number(mm[1]); continue; }
    if (cur !== null && l.indexOf('mCurrentFocus=') >= 0) focus.push({ mDisplayId: cur, focus: (l.split('mCurrentFocus=')[1] || '').trim().replace(/\}$/, '') });
  }
  const pkgs = (opt('pkgs', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const resolved = (pkgs.length ? pkgs : [opt('pkg', LOCAL_PKG)]).map((p) => resolveAppDisplay(p));
  const res = {
    cmd: 'probe-display', at: new Date().toISOString(), device: DEVICE, readOnly: !flag('launch'),
    wmSize: (adbShell('wm size').out || '').trim(), wmDensity: (adbShell('wm density').out || '').trim(),
    displaysFromDumpsysDisplay: pairs, focusPerDisplay: focus, resolved,
    pitfall: 'screencap/screenrecord 不带 -d 时抓 display 0（MuMu 桌面），不是被测 App；App 在自己的 display 上',
  };
  writeJson(path.join(ROOT, 'tools', 'motion-verify-display.json'), res);
  console.log(JSON.stringify(res, null, 2));
  console.log('probe-display -> tools/motion-verify-display.json');
  return res;
}

/* ---------- main ---------- */
/* 设备锁纪律：任何 adb input / screenrecord / am start / force-stop / install 都必须在锁里。
   不想依赖人记得加锁 —— install 与 capture 若发现没在锁内，就把自己重新包进
   tools/device-lock.sh run verify-harness -- <自己 + 原参数>，用 MOTION_LOCKED 防递归。 */
function lockWrap() {
  if (process.env.MOTION_LOCKED === '1') return { wrapped: false, reason: 'already inside lock' };
  const needsLock = cmd === 'install' || cmd === 'capture' || (cmd === 'probe-display' && flag('launch'));
  if (!needsLock) return { wrapped: false, reason: 'read-only command' };
  const lock = path.join(ROOT, 'tools', 'device-lock.sh');
  if (!fs.existsSync(lock)) return { wrapped: false, reason: 'tools/device-lock.sh not found' };
  const p = probeEnv();
  if (!p.bash) return { wrapped: false, reason: 'no bash' };
  process.env.MOTION_LOCKED = '1';
  const self = path.join(ROOT, 'tools', 'motion-verify.mjs');
  const r = sh(p.bash.bin, [lock, 'run', 'verify-harness', '--', process.execPath, self].concat(argv), { cwd: ROOT });
  if (r.out) process.stdout.write(r.out);
  if (r.err) process.stderr.write(r.err);
  return { wrapped: true, code: r.code === null ? 1 : r.code, reason: 'ran under tools/device-lock.sh' };
}

/* ============================================================================
   compare：把两侧同 id 的采集逐帧对齐，输出「位移/缩放/透明度/时长/缓动」数值差表 +
   并排图 + 机器可读 JSON。像素比较用纯 node（自带 PNG 解码/编码，零新依赖）。
   证据纪律：每个数字都带 source（哪个 JSON 字段 / 哪个帧文件 / 哪条阈值）。
   ============================================================================ */
const THRESH_PATH = path.join(ROOT, "tools", "motion-verify-thresholds.json");
const DEFAULT_THRESHOLDS = {
  _note: "PASS/FAIL 阈值的唯一来源：改这个文件即可调阈值，不必动脚本。每项 basis 写依据。",
  state: {
    requireVerified: true, requireSameGeometry: true, requireSameMode: true, requireSameScales: true,
    basis: "状态指纹门：两侧必须都通过「抓到的是目标 App」(res.capture_verified.value)、ui_mode/display_size/density 与三个动画 scale 相同、burst 帧尺寸一致；不满足判 INVALID（屏幕状态不一致），不是 FAIL。依据 shots/verify/noise-floor-idle.json 与 idle-ab-diff-montage.png：同一 App 两次静止采集的内容本身就会不同，跨采集像素比较必须先过这道门。",
  },
  duration: {
    absMs: 220, ratioLo: 0.6, ratioHi: 1.7, minSamples: 3,
    basis: "screencap 突发通道实测 5.7-6.8fps（帧间隔约 147-175ms），窗口起止各带 ±1 帧量化误差 → 容差取 1.5×最大帧间隔 ≈ 220ms；比例区间 0.6-1.7 让两侧采样率略有差异时仍可比。更细的交叉校验用 gfxinfo framestats（纳秒精度），但它是「这段时间内持续出帧」的证据，不是动画时长直接读数（见 shots/verify/A1-*-gfxinfo.txt）。",
  },
  visual: {
    sameApp: { meanMax: 6.0, pct8Max: 2.0, basis: "同一 App（基线 vs 新版）的稳定帧差异：噪声底实测 mean=0.541/255、动态像素 0.21%（shots/verify/dynmask-idle-a.json，单次采集内静止重复帧）；留 10 倍余量取 mean<=6、变化像素(>8/255)<=2%。" },
    crossApp: { informational: true, basis: "跨 App（参考 DeepSeek vs 本项目）整屏像素差没有可比基准——两侧主题/文案/图标本就不同（实测两侧 home 稳定帧内容差异远超噪声底），因此只作为参考值打印，不参与 PASS/FAIL。" },
  },
  easing: {
    minSamples: 5, r2Min: 0.85,
    basis: "缓动形状拟合至少要 5 个采样点：6.6fps 下 200ms 动效只有 1-2 点，结论标 confidence:low 且不参与 PASS/FAIL；320 帧慢放（--scale 5）或 screenrecord 通道拿到 >=5 帧时才启用该判定。",
  },
};
function loadThresholds() {
  if (!fs.existsSync(THRESH_PATH)) {
    writeJson(THRESH_PATH, DEFAULT_THRESHOLDS);
    return { values: DEFAULT_THRESHOLDS, source: THRESH_PATH, created: true };
  }
  const j = JSON.parse(fs.readFileSync(THRESH_PATH, "utf8"));
  const merged = JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS));
  for (const k of Object.keys(j)) {
    const v = j[k];
    if (v && typeof v === "object" && !Array.isArray(v) && merged[k] && typeof merged[k] === "object") merged[k] = Object.assign({}, merged[k], v);
    else merged[k] = v;
  }
  return { values: merged, source: THRESH_PATH, created: false };
}

/* ---- 最小 PNG 解码（bmp/bit-depth 8/非隔行，覆盖 screencap 的 RGBA 与常见 RGB/灰/调色板） ---- */
function pngDecode(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not png: " + file);
  let off = 8, w = 0, h = 0, bd = 0, ct = 0, il = 0; const idat = []; let plte = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString("latin1", off + 4, off + 8);
    const d = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; il = d[12]; }
    else if (type === "PLTE") plte = Buffer.from(d);
    else if (type === "IDAT") idat.push(Buffer.from(d));
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (bd !== 8 || il !== 0) throw new Error("unsupported png bd=" + bd + " il=" + il + " (" + file + ")");
  const chan = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : (ct === 0 || ct === 3) ? 1 : 0;
  if (!chan) throw new Error("unsupported png ct=" + ct + " (" + file + ")");
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * chan;
  const out = Buffer.alloc(w * h * 4, 255);
  const prev = Buffer.alloc(stride, 0); const cur = Buffer.alloc(stride, 0);
  let p = 0;
  for (let y = 0; y < h; y += 1) {
    const f = raw[p]; p += 1;
    raw.copy(cur, 0, p, p + stride); p += stride;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= chan ? cur[i - chan] : 0, b = prev[i], c = i >= chan ? prev[i - chan] : 0;
      let v = cur[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x += 1) {
      const s = x * chan, o = (y * w + x) * 4;
      if (chan === 4) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = cur[s + 3]; }
      else if (chan === 3) { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = 255; }
      else if (chan === 2) { const g = cur[s]; out[o] = g; out[o + 1] = g; out[o + 2] = g; out[o + 3] = cur[s + 1]; }
      else if (ct === 3 && plte && cur[s] * 3 + 2 < plte.length) { const ix = cur[s] * 3; out[o] = plte[ix]; out[o + 1] = plte[ix + 1]; out[o + 2] = plte[ix + 2]; out[o + 3] = 255; }
      else { const g = cur[s]; out[o] = g; out[o + 1] = g; out[o + 2] = g; out[o + 3] = 255; }
    }
    prev.set(cur);
  }
  return { w: w, h: h, rgba: out, file: file };
}
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) { CRC_TABLE = new Int32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c; } }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngEncode(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  function chunk(type, data) {
    const t = Buffer.from(type, "latin1"); const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const stride = w * 4; const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y += 1) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}

/* ---- 像素差：mean / 变化像素占比 / 最大差 / 变化包围盒 / 变化重心 / 亮度 ---- */
function diffPixels(A, B, opt) {
  const o = opt || {};
  const t8 = o.t8 || 8, t32 = o.t32 || 32;
  const w = Math.min(A.w, B.w), h = Math.min(A.h, B.h);
  const hist = new Int32Array(256);
  let sum = 0, n = 0, gt8 = 0, gt32 = 0, max = 0, bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1, sx = 0, sy = 0, lum = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const oo = (y * w + x) * 4;
      const d0 = Math.abs(A.rgba[oo] - B.rgba[oo]);
      const d1 = Math.abs(A.rgba[oo + 1] - B.rgba[oo + 1]);
      const d2 = Math.abs(A.rgba[oo + 2] - B.rgba[oo + 2]);
      const d = d0 > d1 ? (d0 > d2 ? d0 : d2) : (d1 > d2 ? d1 : d2);
      sum += d; n += 1; hist[d] += 1;
      if (d > max) max = d;
      if (d > t8) { gt8 += 1; if (x < bx0) bx0 = x; if (y < by0) by0 = y; if (x > bx1) bx1 = x; if (y > by1) by1 = y; sx += x; sy += y; }
      if (d > t32) gt32 += 1;
      lum += (B.rgba[oo] + B.rgba[oo + 1] + B.rgba[oo + 2]) / 3;
    }
  }
  let acc = 0, p99 = 0;
  for (let v = 0; v < 256; v += 1) { acc += hist[v]; if (acc >= n * 0.99) { p99 = v; break; } }
  const ch = gt8 || 1;
  return {
    w: w, h: h, pixels: n, mean: sum / n, max: max, p99: p99,
    pct_gt8: (100 * gt8) / n, pct_gt32: (100 * gt32) / n,
    bbox_gt8: bx1 < 0 ? null : [bx0, by0, bx1, by1],
    centroid_gt8: bx1 < 0 ? null : { x: Math.round(sx / ch), y: Math.round(sy / ch) },
    mean_lum_b: lum / n,
  };
}
const PNG_CACHE = new Map();
function pngCached(file) {
  if (!PNG_CACHE.has(file)) PNG_CACHE.set(file, pngDecode(file));
  return PNG_CACHE.get(file);
}

/* ---- 序列与状态分段 ---- */
function burstSeries(side) {
  const tl = (side.burst && side.burst.timeline) || [];
  const fr = tl.filter(function (x) { return x.path; });
  return fr.map(function (x, i) {
    return {
      i: i, t: x.atMs, file: x.path, name: path.basename(x.path), bytes: x.bytes,
      w: x.dims ? x.dims.w : null, h: x.dims ? x.dims.h : null,
      md5: crypto.createHash("md5").update(fs.readFileSync(x.path)).digest("hex"),
    };
  });
}
function segmentStates(series) {
  const segs = [];
  for (const f of series) {
    const last = segs.length ? segs[segs.length - 1] : null;
    if (last && last.md5 === f.md5) { last.endMs = f.t; last.count += 1; last.lastFile = f.file; last.frames.push(f.name); }
    else segs.push({ state: segs.length, md5: f.md5, startMs: f.t, endMs: f.t, count: 1, firstFile: f.file, lastFile: f.file, bytes: f.bytes, firstIndex: f.i, frames: [f.name] });
  }
  return segs;
}
/* 从状态序列推「转场窗口」：起始态 -> 有心跳的中间态 -> 稳定末态 */
function motionMetrics(series, segs, thresholds) {
  const iv = [];
  for (let i = 1; i < series.length; i += 1) iv.push(series[i].t - series[i - 1].t);
  const frameIntervalMs = iv.length ? iv.reduce(function (a, b) { return a + b; }, 0) / iv.length : null;
  const startState = segs[0], endState = segs[segs.length - 1];
  let iFirstChange = -1;
  for (let i = 0; i < series.length; i += 1) if (series[i].md5 !== startState.md5) { iFirstChange = i; break; }
  let iSettle = series.length - 1;
  for (let i = series.length - 1; i >= 0; i -= 1) if (series[i].md5 !== endState.md5) { iSettle = i + 1; break; }
  const tFirstChange = iFirstChange >= 0 ? series[iFirstChange].t : null;
  const tSettle = series[iSettle] ? series[iSettle].t : null;
  const windowMs = (tFirstChange !== null && tSettle !== null) ? tSettle - tFirstChange : null;
  const midStates = [];
  const seen = {};
  for (let i = iFirstChange; i < iSettle; i += 1) {
    if (i < 0 || !series[i]) continue;
    if (series[i].md5 === endState.md5) continue;
    if (!seen[series[i].md5]) { seen[series[i].md5] = 1; midStates.push({ t: series[i].t, file: series[i].file, name: series[i].name, md5: series[i].md5 }); }
  }
  const samples = (windowMs !== null) ? (iSettle - iFirstChange) : 0;
  return {
    frames: series.length, frameIntervalMs: frameIntervalMs ? Number(frameIntervalMs.toFixed(1)) : null,
    states: segs.length, stateList: segs.map(function (s) { return { state: s.state, startMs: s.startMs, endMs: s.endMs, count: s.count, bytes: s.bytes, firstFile: s.firstFile, frames: s.frames }; }),
    startState: { md5: startState.md5, file: startState.firstFile, t: startState.startMs },
    endState: { md5: endState.md5, file: endState.lastFile, t: endState.startMs },
    intermediateStates: midStates,
    tFirstChange: tFirstChange, tSettle: tSettle, windowMs: windowMs,
    samples: samples,
    confidence: samples >= (thresholds.easing.minSamples || 5) ? "high" : "low",
    basis: "screencap 突发通道（shots/verify/<name>-burst.json 的 timeline，帧带 wall-clock 偏移）",
  };
}

/* ---- 缓动形状拟合 ---- */
function bezierY(x, x1, y1, x2, y2) {
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 26; i += 1) {
    const bx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
    if (bx < x) lo = t; else hi = t;
    t = (lo + hi) / 2;
  }
  return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
}
const EASINGS = {
  linear: function (t) { return t; },
  accelerate_quad: function (t) { return t * t; },
  accelerate_cubic: function (t) { return t * t * t; },
  accelerate_quint: function (t) { return Math.pow(t, 5); },
  accelerate_sine: function (t) { return 1 - Math.cos(t * Math.PI / 2); },
  decelerate_quad: function (t) { return 1 - (1 - t) * (1 - t); },
  decelerate_cubic: function (t) { return 1 - Math.pow(1 - t, 3); },
  decelerate_quint: function (t) { return 1 - Math.pow(1 - t, 5); },
  decelerate_sine: function (t) { return Math.sin(t * Math.PI / 2); },
  accelerate_decelerate: function (t) { return t * t * (3 - 2 * t); },
  standard_android: function (t) { return bezierY(t, 0.4, 0, 0.2, 1); },
  emphasize_decelerate: function (t) { return bezierY(t, 0.05, 0.7, 0.1, 1); },
  overshoot_back_out: function (t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};
function fitEasing(points) {
  if (!points.length) return { best: null, ranking: [], note: "无采样点" };
  const mean = points.reduce(function (a, p) { return a + p.p; }, 0) / points.length;
  const ssTot = points.reduce(function (a, p) { return a + (p.p - mean) * (p.p - mean); }, 0) || 1e-9;
  const ranking = [];
  for (const name of Object.keys(EASINGS)) {
    const fn = EASINGS[name];
    let ssRes = 0, maxErr = 0;
    for (const p of points) { const e = fn(p.t) - p.p; ssRes += e * e; if (Math.abs(e) > maxErr) maxErr = Math.abs(e); }
    ranking.push({ family: name, r2: Number((1 - ssRes / ssTot).toFixed(4)), rmse: Number(Math.sqrt(ssRes / points.length).toFixed(4)), max_abs_err: Number(maxErr.toFixed(4)) });
  }
  ranking.sort(function (a, b) { return b.r2 - a.r2; });
  return { best: ranking[0], ranking: ranking.slice(0, 6), n: points.length };
}

/* ---- 并排图：左 A 右 B，中间 6px 品红分隔 ---- */
function composePair(aFile, bFile, outPath, label) {
  const A = pngCached(aFile), B = pngCached(bFile);
  const w = A.w + 6 + B.w, h = Math.max(A.h, B.h);
  const out = Buffer.alloc(w * h * 4, 255);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let src = null, sx = 0;
      if (x < A.w) { src = A; sx = x; }
      else if (x >= A.w + 6) { src = B; sx = x - A.w - 6; }
      const o = (y * w + x) * 4;
      if (!src) { out[o] = 255; out[o + 1] = 0; out[o + 2] = 255; out[o + 3] = 255; }
      else if (y < src.h && sx < src.w) { const so = (y * src.w + sx) * 4; out[o] = src.rgba[so]; out[o + 1] = src.rgba[so + 1]; out[o + 2] = src.rgba[so + 2]; out[o + 3] = 255; }
      else { out[o] = 32; out[o + 1] = 32; out[o + 2] = 32; out[o + 3] = 255; }
    }
  }
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, pngEncode(w, h, out));
  return { path: outPath, w: w, h: h, a: aFile, b: bFile, label: label || null };
}

/* ---- 时间轴对齐：按「转场窗口内的归一化进度」取 N 个采样点，各自找最近帧 ---- */
function alignSeries(seriesA, mA, seriesB, mB, n) {
  const out = [];
  const pick = function (series, m, tt) {
    let best = null;
    for (const f of series) { const d = Math.abs(f.t - tt); if (!best || d < best.d) best = { d: d, f: f }; }
    return best;
  };
  const samples = n || 12;
  /* 两侧都有可测窗口 → 按「窗口内归一化进度」对齐；任一侧没有窗口
     （在采样分辨率下 1 帧内完成、windowMs=0）→ 退化为「尾部索引对齐」：
     两条序列都收敛到各自的稳定末态，从末尾往前对应最可比。 */
  const hasWindow = (mA.tFirstChange !== null && mA.windowMs && mB.tFirstChange !== null && mB.windowMs);
  const mode = hasWindow ? "progress" : "tail";
  for (let k = 0; k < samples; k += 1) {
    const frac = samples === 1 ? 0 : k / (samples - 1);
    let pa = null, pb = null;
    if (mode === "progress") {
      pa = pick(seriesA, mA, mA.tFirstChange + frac * mA.windowMs);
      pb = pick(seriesB, mB, mB.tFirstChange + frac * mB.windowMs);
    } else {
      const ia = Math.max(0, seriesA.length - samples + k), ib = Math.max(0, seriesB.length - samples + k);
      pa = seriesA[ia] ? { f: seriesA[ia] } : null;
      pb = seriesB[ib] ? { f: seriesB[ib] } : null;
    }
    if (!pa || !pb) continue;
    out.push({ k: k, frac: mode === "progress" ? Number(frac.toFixed(3)) : null, tA: pa.f.t, tB: pb.f.t, a: pa.f, b: pb.f });
  }
  return { list: out, mode: mode };
}
/* ---- 逐帧像素级估计：进度/覆盖/包围盒/重心/中间灰带占比（用来区分 fade 与位移/缩放） ---- */
function estimateFrame(Astart, Aend, frame) {
  const w = Math.min(Astart.w, Aend.w, frame.w), h = Math.min(Astart.h, Aend.h, frame.h);
  let s0 = 0, s1 = 0, sE = 0, n = 0, mid = 0, cov = 0;
  let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1, sx = 0, sy = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      const dS = Math.max(Math.abs(Astart.rgba[o] - frame.rgba[o]), Math.abs(Astart.rgba[o + 1] - frame.rgba[o + 1]), Math.abs(Astart.rgba[o + 2] - frame.rgba[o + 2]));
      const dE = Math.max(Math.abs(Aend.rgba[o] - frame.rgba[o]), Math.abs(Aend.rgba[o + 1] - frame.rgba[o + 1]), Math.abs(Aend.rgba[o + 2] - frame.rgba[o + 2]));
      const dSE = Math.max(Math.abs(Astart.rgba[o] - Aend.rgba[o]), Math.abs(Astart.rgba[o + 1] - Aend.rgba[o + 1]), Math.abs(Astart.rgba[o + 2] - Aend.rgba[o + 2]));
      s0 += dS; s1 += dE; sE += dSE; n += 1;
      if (dSE > 8) {
        cov += 1;
        const r = (dS + dE) > 0 ? dS / (dS + dE) : 0.5;
        if (r > 0.15 && r < 0.85) mid += 1;
        if (dS > 8) { if (x < bx0) bx0 = x; if (y < by0) by0 = y; if (x > bx1) bx1 = x; if (y > by1) by1 = y; sx += x; sy += y; }
      }
    }
  }
  return {
    progress: sE > 0 ? Number((s0 / sE).toFixed(4)) : null,
    cov_pct: Number(((100 * cov) / n).toFixed(3)),
    mid_frac: cov > 0 ? Number((mid / cov).toFixed(3)) : null,
    bbox: bx1 < 0 ? null : [bx0, by0, bx1, by1],
    centroid: bx1 < 0 ? null : { x: Math.round(sx / (cov || 1)), y: Math.round(sy / (cov || 1)) },
    mean_abs_to_start: Number((s0 / n).toFixed(3)),
    mean_abs_to_end: Number((s1 / n).toFixed(3)),
  };
}
function classifyRows(rows) {
  if (rows.length < 2) return { class: "unknown", dx_px: 0, dy_px: 0, area_growth: null, mid_frac_avg: null, cov_pct_avg: rows.length ? rows[0].cov_pct : null, why: "转场窗口内采样点不足（<2）：画面在采样分辨率下没有可分辨的中间态" };
  const cx = rows.filter(function (r) { return r.centroid; });
  const dx = cx.length >= 2 ? cx[cx.length - 1].centroid.x - cx[0].centroid.x : 0;
  const dy = cx.length >= 2 ? cx[cx.length - 1].centroid.y - cx[0].centroid.y : 0;
  const withBox = rows.filter(function (r) { return r.bbox; });
  const b0 = withBox.length ? withBox[0].bbox : null, b1 = withBox.length ? withBox[withBox.length - 1].bbox : null;
  const area0 = b0 ? (b0[2] - b0[0]) * (b0[3] - b0[1]) : 0;
  const area1 = b1 ? (b1[2] - b1[0]) * (b1[3] - b1[1]) : 0;
  const areaGrowth = area0 > 0 ? Number((area1 / area0).toFixed(3)) : null;
  const midAvg = rows.reduce(function (a, r) { return a + (r.mid_frac || 0); }, 0) / rows.length;
  const covAvg = rows.reduce(function (a, r) { return a + r.cov_pct; }, 0) / rows.length;
  const cand = [];
  if (midAvg > 0.45) cand.push("fade_or_blend");
  if (Math.abs(dx) + Math.abs(dy) > 6) cand.push("translate");
  if (areaGrowth !== null && areaGrowth > 1.15) cand.push("scale_in");
  if (areaGrowth !== null && areaGrowth < 0.85) cand.push("scale_out");
  return {
    class: cand.length ? cand.join("+") : "static_or_step",
    dx_px: dx, dy_px: dy, area_growth: areaGrowth,
    mid_frac_avg: Number(midAvg.toFixed(3)), cov_pct_avg: Number(covAvg.toFixed(3)),
    why: "class 由三个可复核的像素统计推出：位移=变化掩码重心漂移(>6px)、缩放=变化包围盒面积比(>1.15 或 <0.85)、淡入淡出=中间灰带像素占比(mid_frac>0.45，即像素既不等于起始帧也不等于结束帧)。低采样率下它是「推定」，不是真值。",
  };
}
/* 从进度曲线插值出「动效真正在动」的区间：prog 从 0.1 到 0.9 的跨越时间（t10→t90）。
   为什么不用状态分段的首末：启动页会先「静止保持」再转场（实测 splash HOLD_MS=620ms，
   见 android/src/com/lc/phoneharness/SplashActivity.java:21），状态分段会把静止保持也算进去
   （A1 实测 windowMs=642ms，扣掉保持段后真实动效约 350ms）。 */
function progressSpan(rows) {
  const rs = rows.filter(function (r) { return r.progress !== null && typeof r.t === "number"; }).sort(function (a, b) { return a.t - b.t; });
  if (rs.length < 2) return { spanMs: null, reason: "窗口内可用采样点<2" };
  function crossing(target) {
    for (let i = 1; i < rs.length; i += 1) {
      const p0 = rs[i - 1].progress, p1 = rs[i].progress;
      if (p0 < target && p1 >= target) {
        const f = (target - p0) / ((p1 - p0) || 1e-9);
        return rs[i - 1].t + f * (rs[i].t - rs[i - 1].t);
      }
    }
    return null;
  }
  const t10 = crossing(0.1), t90 = crossing(0.9);
  return {
    t10_ms: t10 === null ? null : Number(t10.toFixed(1)),
    t90_ms: t90 === null ? null : Number(t90.toFixed(1)),
    spanMs: (t10 !== null && t90 !== null) ? Number((t90 - t10).toFixed(1)) : null,
    samples: rs.length,
    method: "对每帧像素进度（相对起始帧的像素差 / 起止帧像素差）线性插值求 10%/90% 跨越点",
    note: "t10→t90 排除了动效前后的静止保持段；5.7-6.8fps 下该值的单帧量化误差约 ±1 帧",
  };
}
function sideMotion(side, thresholds, source) {
  const series = source === "frames" ? framesSeries(side) : burstSeries(side);
  if (series.length < 2) return { ok: false, why: "可用帧不足（" + series.length + "）", series: series };
  const segs = segmentStates(series);
  const m = motionMetrics(series, segs, thresholds);
  const Start = pngCached(m.startState.file), End = pngCached(m.endState.file);
  const rows = [];
  const inWindow = series.filter(function (f) { return m.tFirstChange !== null && f.t >= m.tFirstChange && f.t <= m.tSettle; });
  for (const f of inWindow) {
    const e = estimateFrame(Start, End, pngCached(f.file));
    rows.push(Object.assign({ t: f.t, frac: m.windowMs ? Number(((f.t - m.tFirstChange) / m.windowMs).toFixed(3)) : null, file: f.file, name: f.name }, e));
  }
  let rowsBasis = "转场窗口内的每一帧（首次变化→稳定末态）";
  if (rows.length < 2) {
    /* 窗口太短（对端 App 可能就是「采样分辨率下 1 帧内完成」）：退化成「每个不同画面状态取一个代表帧」 */
    const reps = segs.map(function (s) { return { file: s.lastFile, t: s.endMs }; });
    rows.length = 0;
    for (const r of reps) {
      rows.push(Object.assign({ t: r.t, frac: null, file: r.file, name: path.basename(r.file) }, estimateFrame(Start, End, pngCached(r.file))));
    }
    rowsBasis = "窗口内不足 2 帧：改用「每个不同画面状态的代表帧」估类别（时间分辨率更低）";
  }
  const span = progressSpan(rows);
  if (rowsBasis.indexOf("代表帧") >= 0) { span.reliable = false; span.note = "本侧窗口内不足 2 帧（画面在采样分辨率下 1 帧内完成），span 由「状态代表帧」的时间差推出，只能证明该侧变化很快，不是动效时长读数"; }
  else span.reliable = true;
  const pts = rows.filter(function (r) { return r.progress !== null && r.frac !== null && r.frac > 0 && r.frac < 1; })
    .map(function (r) { return { t: r.frac, p: r.progress }; });
  const fit = fitEasing(pts);
  const cls = classifyRows(rows);
  const settledDiff = diffPixels(pngCached(series[series.length - 1].file), End);
  return {
    ok: true, source: source || "burst", series: series, segments: segs, metrics: m,
    rows: rows, rows_basis: rowsBasis, progress_span: span, progress_points: pts, easing_fit: fit, classification: cls,
    settled_frame_diff: settledDiff,
  };
}
function framesSeries(side) {
  const jp = path.join(VERIFY, side.name + ".frames.json");
  if (!fs.existsSync(jp)) return [];
  const j = JSON.parse(fs.readFileSync(jp, "utf8"));
  const dir = path.join(VERIFY, side.name);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(function (f) { return f.endsWith(".png"); }).sort();
  const out = [];
  for (let i = 0; i < files.length; i += 1) {
    const t = j.pts && j.pts[i] !== undefined ? Math.round(j.pts[i] * 1000) : i * 33;
    const file = path.join(dir, files[i]);
    out.push({ i: i, t: t, file: file, name: files[i], bytes: fs.statSync(file).size, w: null, h: null, md5: crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex") });
  }
  return out;
}
function readJsonSafe(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; } }
function keysOf(m) { const k = Object.keys(m || {}).sort(); return k.length ? k.join("+") : null; }

/* ---- compare 主流程 ---- */
function cmdCompare() {
  const aPath = opt("a"), bPath = opt("b");
  if (!aPath || !bPath) { console.log("用法：compare --a shots/verify/A1-local.json --b shots/verify/A1-ref.json [--samples 12] [--source burst|frames] [--pair NAME]"); return { ok: false }; }
  const th = loadThresholds();
  const T = th.values;
  const A = readJsonSafe(path.resolve(ROOT, aPath)) || readJsonSafe(aPath);
  const B = readJsonSafe(path.resolve(ROOT, bPath)) || readJsonSafe(bPath);
  if (!A || !B) { console.log("读不到采集 JSON：" + aPath + " / " + bPath); return { ok: false }; }
  const source = opt("source") || "burst";
  const pairName = opt("pair") || (A.name + "__vs__" + B.name);
  const samples = Number(opt("samples") || 12);
  /* 对比模式：同 App（改版前后，同一应用）= 时长/视觉/缓动都可判 PASS/FAIL；
     跨 App（本项目 vs 参考 APK）= 两个不同应用，时长/主题/结构本就不同，
     那些指标只作 INFO 记录，只有「状态指纹门」与「两侧是否都测到了转场」才定性。 */
  const sameApp = A.pkg === B.pkg;
  const reqMode = opt("mode") || "auto";
  const effMode = reqMode === "auto" ? (sameApp ? "same-app" : "cross-app") : reqMode;
  const cross = effMode === "cross-app";
  console.log("对比模式：" + effMode + "（--mode " + reqMode + "；A=" + A.pkg + " B=" + B.pkg + "）");
  console.log("阈值来源：" + th.source + (th.created ? "（本次由脚本写入默认值）" : ""));
  const checks = [];
  function ck(id, level, metric, a, b, threshold, evidence, basis) {
    checks.push({ id: id, level: level, metric: metric, a: a, b: b, delta: (typeof a === "number" && typeof b === "number") ? Number((b - a).toFixed(2)) : null, threshold: threshold, evidence: evidence, basis: basis });
  }
  /* ① 状态指纹门 */
  const vA = !!(A.capture_verified && A.capture_verified.value), vB = !!(B.capture_verified && B.capture_verified.value);
  ck("state.capture_verified", T.state.requireVerified ? (vA && vB ? "PASS" : "INVALID") : "INFO", "capture_verified.value", vA, vB,
    "两侧均 true", aPath + " / " + bPath, T.state.basis);
  ck("state.geometry", T.state.requireSameGeometry ? ((A.display_size === B.display_size && A.density === B.density) ? "PASS" : "INVALID") : "INFO", "display_size+density", A.display_size + " / " + A.density, B.display_size + " / " + B.density, "相等", "采集 JSON 的 display_size/density 字段（来自 wm size / wm density）", T.state.basis);
  ck("state.ui_mode", T.state.requireSameMode ? (A.ui_mode === B.ui_mode ? "PASS" : "INVALID") : "INFO", "ui_mode", A.ui_mode, B.ui_mode, "相等", "采集 JSON 的 ui_mode（来自 cmd uimode night）", T.state.basis);
  ck("state.anim_scales", T.state.requireSameScales ? (JSON.stringify(A.animScales.after) === JSON.stringify(B.animScales.after) ? "PASS" : "INVALID") : "INFO", "animScales.after", A.animScales.keyset, B.animScales.keyset, "相等", "采集 JSON 的 animScales.after（settings get global *_animation_scale）", T.state.basis);
  /* ② 两侧运动估计 */
  const sA = sideMotion(A, T, source), sB = sideMotion(B, T, source);
  if (!sA.ok || !sB.ok) {
    ck("motion.series", "INVALID", "可用帧数", sA.series.length, sB.series.length, ">=2", aPath + " / " + bPath, "compare 的当前通道：" + source);
  } else {
    const mA = sA.metrics, mB = sB.metrics;
    const dimsA = {}; for (const f of sA.series) { const k = f.w + "x" + f.h; dimsA[k] = (dimsA[k] || 0) + 1; }
    const dimsB = {}; for (const f of sB.series) { const k = f.w + "x" + f.h; dimsB[k] = (dimsB[k] || 0) + 1; }
    ck("state.frame_dims", T.state.requireSameGeometry ? (keysOf(dimsA) === keysOf(dimsB) ? "PASS" : "INVALID") : "INFO", "帧尺寸种类（键集合，不比计数）", keysOf(dimsA) || "(none)", keysOf(dimsB) || "(none)", "键集合相等", "每帧 PNG IHDR 宽高（burst JSON 的 dims），只比尺寸种类：两侧帧数不同属正常", T.state.basis);
    /* 时长 */
    const wA = mA.windowMs, wB = mB.windowMs;
    const dDur = (wA !== null && wB !== null) ? wB - wA : null;
    const ratio = (wA && wB !== null) ? Number((wB / wA).toFixed(3)) : null;
    let durLevel = "INFO";
    if (dDur !== null) {
      const okAbs = Math.abs(dDur) <= T.duration.absMs;
      const okRatio = ratio !== null && ratio >= T.duration.ratioLo && ratio <= T.duration.ratioHi;
      durLevel = (okAbs && okRatio) ? "PASS" : "FAIL";
    }
    if (cross) durLevel = "INFO";
    /* 真正参与判定的是「动效在动的区间」：排除动效前后的静止保持段（启动页 HOLD_MS=620ms） */
    const pA = sA.progress_span, pB = sB.progress_span;
    const spA = pA ? pA.spanMs : null, spB = pB ? pB.spanMs : null;
    let spLevel = "INFO";
    if (pA && pB && (pA.reliable === false || pB.reliable === false)) spLevel = "INFO";
    else if (!cross && spA !== null && spB !== null) {
      const dSp = Math.abs(spB - spA);
      const rSp = spA > 0 ? spB / spA : null;
      const okS = dSp <= T.duration.absMs && (rSp === null || (rSp >= T.duration.ratioLo && rSp <= T.duration.ratioHi));
      spLevel = okS ? "PASS" : "FAIL";
    }
    ck("duration.progress_span", spLevel, "动效区间 ms（进度 10%→90%，排除静止保持段）", spA, spB,
      "同 App 时 |Δ|<=" + T.duration.absMs + "ms 且 ratio∈[" + T.duration.ratioLo + "," + T.duration.ratioHi + "]",
      "progressSpan() 对逐帧像素进度插值求 t10/t90；依据=A1 实测 windowMs=642ms 含 splash HOLD_MS=620ms 静止段，" +
      "扣掉后约 350ms（android/src/com/lc/phoneharness/SplashActivity.java:21）",
      cross ? "跨 App：两侧是不同应用，时长差异只记录不定性" : T.duration.basis);
    ck("duration.window", durLevel, "转场窗口 ms（首次变化→稳定）", wA, wB, "|Δ|<=" + T.duration.absMs + "ms 且 ratio∈[" + T.duration.ratioLo + "," + T.duration.ratioHi + "]",
      "burst timeline 的状态分段（startState→endState）：" + aPath + " / " + bPath, T.duration.basis);
    ck("duration.sampling", "INFO", "平均帧间隔 ms / 窗口内采样点", mA.frameIntervalMs, mB.frameIntervalMs, "只作分辨率说明", "burst timeline 相邻帧时间差", "screencap 突发通道实测 5.7-6.8fps：窗口边界的量化误差约 1 帧，即 ±" + Math.round((mA.frameIntervalMs || 150)) + "ms");
    const gA = (A.gfxinfo && A.gfxinfo.busyWindowMs) || null, gB = (B.gfxinfo && B.gfxinfo.busyWindowMs) || null;
    ck("duration.gfxinfo_crosscheck", "INFO", "gfxinfo busyWindow ms（纳秒 framestats，非动画时长）", gA, gB, "分歧>16.7ms 需注明", A.name + "-gfxinfo.txt / " + B.name + "-gfxinfo.txt", "framestats 只能证明「这段时间内持续出帧」，与逐帧图像测得的时长不是同一量；仅作交叉校验");
    /* 状态数 / 中间态 */
    ck("motion.states", "INFO", "不同画面状态数", mA.states, mB.states, "两侧都应 >=2（有转场）", "burst 帧 md5 分段", "状态数=转场过程中画面内容的离散变化次数；缺帧/被系统缩放都会改变它");
    /* 可测性：两侧都必须至少能分辨出 1 次画面变化，否则这条对比的时长结论无效 */
    const measLevel = (mA.states >= 2 && mB.states >= 2) ? "PASS" : (sameApp ? "FAIL" : "INFO");
    ck("motion.measurable_transition", measLevel, "两侧是否都测到了转场（状态数>=2）", "states=" + mA.states, "states=" + mB.states, ">=2",
      "md5 状态分段：" + (mA.states < 2 ? "A 侧 1 帧内完成/无变化；" : "") + (mB.states < 2 ? "B 侧 1 帧内完成/无变化；" : "") + "采集 JSON=" + aPath + " / " + bPath,
      "6.6fps 采样下若某侧在 1 帧内完成，则该侧时长只能给上限（<1 帧间隔），不能与对侧逐毫秒比较；跨 App 时这属正常（参考 App 无启动页动效）");
    ck("motion.classification", "INFO", "推定动效类别", sA.classification.class, sB.classification.class, "类别一致=动机一致", "classifyRows() 的三项像素统计", sA.classification.why);
    ck("motion.displacement_px", "INFO", "变化掩码重心漂移 px", "dx=" + sA.classification.dx_px + ",dy=" + sA.classification.dy_px, "dx=" + sB.classification.dx_px + ",dy=" + sB.classification.dy_px, "同号同量级", "estimateFrame() 逐帧重心", "位移是「变化区域重心」的漂移，不是元素真实位移；低采样率下只作方向性判据");
    ck("motion.area_growth", "INFO", "变化包围盒面积比（末/首）", sA.classification.area_growth, sB.classification.area_growth, "接近 1 = 无缩放", "estimateFrame() 包围盒", "缩放推定：面积比 >1.15 视为放大入场，<0.85 视为缩小出场");
    ck("motion.mid_blend_frac", "INFO", "中间灰带像素占比（淡入淡出证据）", sA.classification.mid_frac_avg, sB.classification.mid_frac_avg, "越高越像交叉淡化", "estimateFrame() 的 mid_frac", ">0.45 表示大量像素既不等于起始帧也不等于结束帧 → 交叉淡化/混合而非硬位移");
    /* 缓动 */
    const fA = sA.easing_fit.best, fB = sB.easing_fit.best;
    const enough = (sA.progress_points.length >= T.easing.minSamples && sB.progress_points.length >= T.easing.minSamples);
    let easLevel = (enough && !cross) ? ((fA && fB && fA.family === fB.family) ? "PASS" : "FAIL") : "INFO";
    if (enough && !cross && !(fA && fB)) easLevel = "FAIL";
    ck("easing.family", easLevel, "最佳拟合缓动族", fA ? fA.family + "(R2=" + fA.r2 + ")" : "n/a", fB ? fB.family + "(R2=" + fB.r2 + ")" : "n/a",
      "两侧采样点>=" + T.easing.minSamples + " 且 R2>=" + T.easing.r2Min + " 时才判定",
      "progress_points（窗口内每帧相对起始/结束帧的像素进度）→ fitEasing() 对 13 个缓动族最小二乘排序", T.easing.basis);
    ck("easing.samples", "INFO", "进度采样点数（窗口内、不含端点）", sA.progress_points.length, sB.progress_points.length, ">=" + T.easing.minSamples + " 才有形状结论", "progress_points.length", "6.6fps 下 200ms 动效只有 1-2 点：此时 best family 只是「最不离谱的猜测」，结论标 confidence:low");
    /* 视觉：同 App 才参与判定 */
    const settled = diffPixels(pngCached(sA.series[sA.series.length - 1].file), pngCached(sB.series[sB.series.length - 1].file));
    if (sameApp) {
      const ok = settled.mean <= T.visual.sameApp.meanMax && settled.pct_gt8 <= T.visual.sameApp.pct8Max;
      ck("visual.settled_same_app", ok ? "PASS" : "FAIL", "稳定帧像素差 mean/pct>8", "mean=" + settled.mean.toFixed(3) + ",pct=" + settled.pct_gt8.toFixed(3) + "%", "(同 App 判定)", "mean<=" + T.visual.sameApp.meanMax + " 且 pct>8<=" + T.visual.sameApp.pct8Max + "%",
        "两侧稳定帧实际像素：左=右两侧末帧 PNG", T.visual.sameApp.basis);
    } else {
      ck("visual.cross_app", "INFO", "跨 App 稳定帧像素差（仅参考）", "mean=" + settled.mean.toFixed(3) + ",pct>8=" + settled.pct_gt8.toFixed(3) + "%", "src=" + B.pkg, "不做 PASS/FAIL", "两侧末帧 PNG", T.visual.crossApp.basis);
    }
    /* ③ 并排图 */
    const pairs = [];
    const pairDir = path.join(VERIFY, "pairs");
    ensureDir(pairDir);
    const aligned = alignSeries(sA.series, mA, sB.series, mB, samples);
    for (let i = 0; i < aligned.list.length; i += 1) {
      const p = aligned.list[i];
      const out = path.join(pairDir, pairName + "-p" + String(i + 1).padStart(2, "0") + ".png");
      const d = diffPixels(pngCached(p.a.file), pngCached(p.b.file));
      const img = composePair(p.a.file, p.b.file, out, (p.frac === null ? "idx=" + (p.k + 1) + " (tail)" : "frac=" + p.frac));
      pairs.push({ k: i, frac: p.frac, tA: p.tA, tB: p.tB, a: path.relative(ROOT, p.a.file), b: path.relative(ROOT, p.b.file), pair: path.relative(ROOT, out), mean: Number(d.mean.toFixed(3)), pct_gt8: Number(d.pct_gt8.toFixed(3)), pairW: img.w, pairH: img.h });
    }
    const settledPair = composePair(sA.series[sA.series.length - 1].file, sB.series[sB.series.length - 1].file, path.join(pairDir, pairName + "-settled.png"), "settled");
    const startPair = composePair(sA.series[0].file, sB.series[0].file, path.join(pairDir, pairName + "-start.png"), "start");
    const result = {
      cmd: "compare", at: new Date().toISOString(), pair: pairName, source: source, samples: samples,
      a: { file: aPath, name: A.name, pkg: A.pkg, protoId: A.protocolId, ui_mode: A.ui_mode, display_size: A.display_size, density: A.density, animScales: A.animScales, capture_verified: A.capture_verified.value },
      b: { file: bPath, name: B.name, pkg: B.pkg, protoId: B.protocolId, ui_mode: B.ui_mode, display_size: B.display_size, density: B.density, animScales: B.animScales, capture_verified: B.capture_verified.value },
      thresholds: { source: th.source, values: T },
      sideA: { metrics: mA, progress_span: sA.progress_span, rows_basis: sA.rows_basis, easing_fit: sA.easing_fit, classification: sA.classification, progress_points: sA.progress_points, rows: sA.rows, settled_frame_diff: sA.settled_frame_diff },
      sideB: { metrics: mB, progress_span: sB.progress_span, rows_basis: sB.rows_basis, easing_fit: sB.easing_fit, classification: sB.classification, progress_points: sB.progress_points, rows: sB.rows, settled_frame_diff: sB.settled_frame_diff },
      mode: effMode, align_mode: aligned.mode,
      aligned_pairs: pairs, settled_pair: path.relative(ROOT, settledPair.path), start_pair: path.relative(ROOT, startPair.path),
      checks: checks,
      verdict: checks.some(function (c) { return c.level === "INVALID"; }) ? "INVALID" : (checks.some(function (c) { return c.level === "FAIL"; }) ? "FAIL" : "PASS"),
    };
    writeJson(path.join(VERIFY, "motion-compare.json"), result);
    writeJson(path.join(ROOT, "tools", "motion-verify-compare.json"), { at: result.at, pair: pairName, verdict: result.verdict, checks: checks, pairs: pairs.length, thresholds: th.source });
    console.log("--- compare " + pairName + " -> " + result.verdict + " ---");
    for (const c of checks) console.log("  [" + c.level + "] " + c.id + " | " + c.metric + " | A=" + c.a + " B=" + c.b + (c.delta !== null ? (" Δ=" + c.delta) : "") + " | " + (c.threshold || ""));
    console.log("--- 并排图 " + pairs.length + " 张（对齐方式 " + aligned.mode + "）-> " + path.relative(ROOT, pairDir) + " ; 汇总 shots/verify/motion-compare.json ---");
    return { ok: result.verdict === "PASS" || result.verdict === "INVALID", verdict: result.verdict, checks: checks, pairs: pairs, result: result };
  }
  const result = { cmd: "compare", at: new Date().toISOString(), pair: pairName, a: aPath, b: bPath, checks: checks, verdict: "INVALID", thresholds: { source: th.source, values: T } };
  writeJson(path.join(VERIFY, "motion-compare.json"), result);
  writeJson(path.join(ROOT, "tools", "motion-verify-compare.json"), { at: result.at, pair: pairName, verdict: "INVALID", checks: checks, thresholds: th.source });
  for (const c of checks) console.log("  [" + c.level + "] " + c.id + " | " + c.metric + " | A=" + c.a + " B=" + c.b);
  return { ok: false, verdict: "INVALID", checks: checks };
}


/* ============================================================================
   regression：基线 APK vs 新版 APK，跑同一组脚本化动作，逐步比对
   「行为签名」——Activity 栈 / App 私有数据（files+shared_prefs 的全文件 md5）/ 逐页截图 /
   logcat 消息集合。不看动画，只看数据与状态。证据纪律：每个数字给采集文件与字段名。
   ============================================================================ */
const REG_THRESH_PATH = path.join(ROOT, "tools", "motion-verify-regression-steps.json");
const DEFAULT_REGRESSION_STEPS = {
  _note: "regression 的动作脚本：两侧跑同一份。act: force-stop|amstart|tap|swipe|key|text|wait|shot。shot_volatile=true 的步骤截图差异只作 INFO（内容来自网络/宿主，可能不稳定）。",
  device: { size: "1080x1920", density: 480, note: "坐标基于 App 所在 display 1080x1920（不是 display 0 的 2460 高）" },
  steps: [
    { id: "R1", note: "冷启动到首页稳定态", actions: [{ act: "force-stop" }, { act: "amstart" }, { act: "wait", ms: 3000 }] },
    { id: "R2", note: "打开抽屉（会话列表）", shot_volatile: true, actions: [{ act: "tap", x: 72, y: 70 }, { act: "wait", ms: 2500 }] },
    { id: "R3", note: "账号菜单弹层", actions: [{ act: "tap", x: 795, y: 1742 }, { act: "wait", ms: 1200 }] },
    { id: "R4", note: "在线主机页", shot_volatile: true, actions: [{ act: "tap", x: 540, y: 739 }, { act: "wait", ms: 1800 }] },
    { id: "R5", note: "返回", actions: [{ act: "key", code: 4 }, { act: "wait", ms: 900 }] },
    { id: "R6", note: "返回首页", actions: [{ act: "key", code: 4 }, { act: "wait", ms: 1200 }] },
    { id: "R7", note: "新建会话（首页 + 按钮）", actions: [{ act: "tap", x: 995, y: 72 }, { act: "wait", ms: 1500 }] },
    { id: "R8", note: "附件面板（弹层）", actions: [{ act: "tap", x: 820, y: 1712 }, { act: "wait", ms: 900 }] },
  ],
};
function loadRegressionSteps() {
  if (!fs.existsSync(REG_THRESH_PATH)) { writeJson(REG_THRESH_PATH, DEFAULT_REGRESSION_STEPS); return { cfg: DEFAULT_REGRESSION_STEPS, source: REG_THRESH_PATH, created: true }; }
  const j = JSON.parse(fs.readFileSync(REG_THRESH_PATH, "utf8"));
  return { cfg: j, source: REG_THRESH_PATH, created: false };
}
/* App 私有数据的全文件摘要：路径 -> md5。用设备端 sh 循环（无本地 shell 参与，避免引号/MSYS 问题） */
function regDataFiles(pkg) {
  const script = "cd /data/data/" + pkg + " 2>/dev/null; for d in files shared_prefs databases; do [ -d $d ] && find $d -type f | sort | while read f; do echo $f $(md5sum $f | cut -d' ' -f1); done; done";
  const r = adbShell(script);
  const map = {};
  for (const line of String(r).split(/\r?\n/)) {
    const m = line.trim().match(/^(\S+) ([0-9a-f]{32})$/);
    if (m) map[m[1]] = m[2];
  }
  const keys = Object.keys(map).sort();
  const digest = keys.length ? crypto.createHash("md5").update(keys.map(function (k) { return k + " " + map[k]; }).join("\n")).digest("hex") : null;
  return { map: map, digest: digest, files: keys.length };
}
function regActivity(pkg) {
  const d = adbShell("dumpsys activity activities");
  const hits = String(d).split(/\r?\n/).filter(function (l) { return l.indexOf(pkg) >= 0 && /ResumedActivity|mResumedActivity|topResumedActivity|ResumedDialog/.test(l); })
    .map(function (l) { return l.replace(/^\s+/, "").replace(/\s+/g, " ").replace(/\{[^}]*\}/g, "{}").replace(/t\d+ /g, ""); });
  return hits.length ? Array.from(new Set(hits)).join(" | ") : null;
}
function regLogs(pkg) {
  const d = adbShell("logcat -d -v brief -t 600");
  const msgs = String(d).split(/\r?\n/).filter(function (l) { return l.indexOf(pkg) >= 0 || /lc\.phoneharness/.test(l); })
    .map(function (l) { return l.replace(/^\d\d-\d\d \d\d:\d\d:\d\d\.\d+\s+\d+\s+\d+\s+/, "").replace(/\s+/g, " ").trim(); });
  return Array.from(new Set(msgs)).sort();
}
function regDoActions(pkg, actions) {
  const log = [];
  for (const a of actions) {
    const t = Date.now();
    if (a.act === "force-stop") adbShell("am force-stop " + pkg);
    else if (a.act === "amstart") { const comp = a.comp && a.comp.length ? a.comp : resolveLauncher(pkg); adbShell("am start -W -n " + (comp.indexOf(".") === 0 ? pkg + "/" + comp : comp)); }
    else if (a.act === "tap") capRun(["tap", pkg, String(a.x), String(a.y)]);
    else if (a.act === "swipe") capRun(["swipe", pkg, String(a.x1), String(a.y1), String(a.x2), String(a.y2), String(a.ms || 300)]);
    else if (a.act === "key") capRun(["key", pkg, String(a.code)]);
    else if (a.act === "text") capRun(["text", pkg, String(a.text || "")]);
    else if (a.act === "wait") sleepMs(a.ms || 500);
    log.push({ act: a.act, arg: a.x !== undefined ? a.x + "," + a.y : (a.code || a.text || (a.ms || "")), ms: Date.now() - t });
  }
  return log;
}
function regSide(side, apkPath, steps, tag) {
  const PKG = "com.lc.phoneharness";
  const out = { side: side, apk: apkPath, pkg: PKG, at: new Date().toISOString(), steps: [], env: {} };
  out.apkMd5 = fs.existsSync(apkPath) ? crypto.createHash("md5").update(fs.readFileSync(apkPath)).digest("hex") : null;
  out.apkBytes = fs.existsSync(apkPath) ? fs.statSync(apkPath).size : null;
  const inst = sh(ADB, ["-s", DEVICE, "install", "-r", "-t", apkPath], { timeout: 180000 });
  out.install = { code: inst.code, out: String(inst.out).trim().slice(0, 300) };
  if (inst.code !== 0) { out.ok = false; out.error = "install 失败"; return out; }
  const pk = pkgInfo(PKG);
  out.version = { versionName: pk.versionName, versionCode: pk.versionCode };
  adbShell("pm clear " + PKG);
  sleepMs(300);
  setScales(1);
  out.env.animScales = readScales();
  out.env.display_size = displayFacts().size;
  out.env.density = displayFacts().density;
  const shotDir = path.join(VERIFY, "regression", tag + "-" + side);
  ensureDir(shotDir);
  for (const st of steps) {
    const actLog = regDoActions(PKG, st.actions || []);
    const shotPath = path.join(shotDir, st.id + ".png");
    let shot = null;
    try { capShot(PKG, shotPath); const img = pngCached(shotPath); shot = { path: path.relative(ROOT, shotPath), w: img.w, h: img.h, bytes: fs.statSync(shotPath).size }; }
    catch (e) { shot = { path: null, error: String(e && e.message || e) }; }
    const rec = { id: st.id, note: st.note || null, shot_volatile: !!st.shot_volatile, actions: actLog, shot: shot, activity: regActivity(PKG), data: regDataFiles(PKG), logs: regLogs(PKG) };
    out.steps.push(rec);
    console.log("  [" + side + "] " + st.id + " " + (st.note || "") + " | activity=" + (rec.activity || "null") + " | data=" + (rec.data.digest || "null").slice(0, 12) + " files=" + rec.data.files + " | shot=" + (shot && shot.w ? shot.w + "x" + shot.h : "n/a") + " | logs=" + rec.logs.length);
  }
  out.ok = true;
  return out;
}
function cmdRegression() {
  const th = loadThresholds().values;
  const stepsRes = loadRegressionSteps();
  const steps = stepsRes.cfg.steps || [];
  console.log("动作脚本：" + stepsRes.source + (stepsRes.created ? "（本次写入默认值，可直接编辑改坐标/追加步骤）" : "") + " steps=" + steps.length);
  const baseDir = path.join(VERIFY, "baseline");
  ensureDir(baseDir);
  const baseApk = opt("baseline") || path.join(baseDir, "dsh-phone-baseline.apk");
  const newApk = opt("new") || path.join(ROOT, "android", "bin", "dsh-phone.apk");
  if (!fs.existsSync(baseApk)) { console.log("基线 APK 不存在：" + baseApk + "\n  提示：把改版前的 android/bin/dsh-phone.apk 复制为 " + baseApk + " 即可（lead 标注的基线：0.6.13 / code 29 / 616266 B / md5 041ac4ca597e73c199315922027e92d7）"); return { ok: false }; }
  if (!fs.existsSync(newApk)) { console.log("新版 APK 不存在：" + newApk); return { ok: false }; }
  const tag = opt("tag") || "baseline-vs-new";
  console.log("基线 APK=" + baseApk + "\n新版 APK=" + newApk);
  const b = regSide("baseline", baseApk, steps, tag);
  const n = regSide("new", newApk, steps, tag);
  if (!b.ok || !n.ok) { console.log("任一侧安装/采集失败，无法比较"); return { ok: false, why: "side failed", baseline: b, new: n }; }
  const checks = [];
  const byId = function (s) { const m = {}; for (const x of s.steps) m[x.id] = x; return m; };
  const bm = byId(b), nm = byId(n);
  const pairs = [];
  for (const st of steps) {
    const x = bm[st.id], y = nm[st.id];
    if (!x || !y) { checks.push({ id: st.id, level: "INVALID", metric: "步骤存在性", a: !!x, b: !!y, threshold: "两侧都有", evidence: "regression JSON", basis: "同一步骤两侧都必须采到" }); continue; }
    checks.push({ id: st.id + ".activity", level: x.activity === y.activity ? "PASS" : (x.activity === null || y.activity === null ? "INVALID" : "FAIL"), metric: "Activity 栈 ResumedActivity", a: x.activity, b: y.activity, threshold: "相等", evidence: "regression-*.json steps[].activity（dumpsys activity activities）", basis: "路由/页面栈是行为等价的核心：动效改版不许改变进入的页面" });
    const dd = (x.data.digest === y.data.digest);
    const diffKeys = dd ? [] : Array.from(new Set(Object.keys(x.data.map).concat(Object.keys(y.data.map)))).filter(function (k) { return x.data.map[k] !== y.data.map[k]; });
    checks.push({ id: st.id + ".data", level: dd ? "PASS" : "FAIL", metric: "App 私有数据摘要（files+shared_prefs+databases 全文件 md5）", a: (x.data.digest || "null").slice(0, 12) + " (" + x.data.files + " 文件)", b: (y.data.digest || "null").slice(0, 12) + " (" + y.data.files + " 文件)", threshold: "摘要相等", evidence: "regression-*.json steps[].data.map（设备端 md5sum，" + (diffKeys.length ? "差异文件：" + diffKeys.slice(0, 5).join(", ") : "无差异文件") + "）", basis: "状态/数据结构/接口返回处理是否一致，最终体现为落盘状态一致" });
    let shotLevel = "INFO", shotDetail = "n/a";
    if (x.shot && x.shot.path && y.shot && y.shot.path) {
      const d = diffPixels(pngCached(path.resolve(ROOT, x.shot.path)), pngCached(path.resolve(ROOT, y.shot.path)));
      shotDetail = "mean=" + d.mean.toFixed(3) + ",pct>8=" + d.pct_gt8.toFixed(3) + "%";
      const ok = d.mean <= th.visual.sameApp.meanMax && d.pct_gt8 <= th.visual.sameApp.pct8Max;
      shotLevel = st.shot_volatile ? (ok ? "PASS" : "INFO") : (ok ? "PASS" : "FAIL");
      const out = path.join(VERIFY, "regression", tag + "-" + st.id + "-pair.png");
      const img = composePair(path.resolve(ROOT, x.shot.path), path.resolve(ROOT, y.shot.path), out, st.id);
      pairs.push({ id: st.id, pair: path.relative(ROOT, out), mean: d.mean, pct_gt8: d.pct_gt8, w: img.w, h: img.h });
    }
    checks.push({ id: st.id + ".screen", level: shotLevel, metric: "稳定截图像素差（左基线右新版）", a: x.shot && x.shot.path || "n/a", b: y.shot && y.shot.path || "n/a", threshold: "mean<=" + th.visual.sameApp.meanMax + " 且 pct>8<=" + th.visual.sameApp.pct8Max + "%" + (st.shot_volatile ? "（本步内容来自网络/宿主，超阈值降为 INFO）" : ""), evidence: "并排图 " + (pairs.length ? pairs[pairs.length - 1].pair : "n/a") + " ; " + shotDetail, basis: th.visual.sameApp.basis });
    const onlyB = x.logs.filter(function (l) { return y.logs.indexOf(l) < 0; });
    const onlyN = y.logs.filter(function (l) { return x.logs.indexOf(l) < 0; });
    checks.push({ id: st.id + ".logs", level: (onlyB.length === 0 && onlyN.length === 0) ? "PASS" : "INFO", metric: "logcat 消息集合差（去时间戳/pid）", a: x.logs.length + " 条", b: y.logs.length + " 条", threshold: "集合相等（差异只作 INFO，可能是日志措辞/顺序）", evidence: "regression-*.json steps[].logs；仅基线有 " + onlyB.length + " 条，仅新版有 " + onlyN.length + " 条" + (onlyN.length ? "，例：" + onlyN[0].slice(0, 90) : ""), basis: "日志不是行为契约；真正的契约是 activity 与落盘数据" });
  }
  const verdict = checks.some(function (c) { return c.level === "INVALID"; }) ? "INVALID" : (checks.some(function (c) { return c.level === "FAIL"; }) ? "FAIL" : "PASS");
  const result = {
    cmd: "regression", at: new Date().toISOString(), tag: tag, stepsSource: stepsRes.source, steps: steps.length,
    baseline: { apk: baseApk, md5: b.apkMd5, bytes: b.apkBytes, version: b.version, env: b.env, steps: b.steps },
    new: { apk: newApk, md5: n.apkMd5, bytes: n.apkBytes, version: n.version, env: n.env, steps: n.steps },
    checks: checks, pairs: pairs, verdict: verdict,
    thresholds: { source: loadThresholds().source, values: th },
  };
  writeJson(path.join(VERIFY, "regression-report.json"), result);
  writeJson(path.join(ROOT, "tools", "motion-verify-regression.json"), { at: result.at, tag: tag, verdict: verdict, baseline: { md5: b.apkMd5, version: b.version }, new: { md5: n.apkMd5, version: n.version }, checks: checks, pairs: pairs });
  writeJson(path.join(VERIFY, "regression-" + tag + "-baseline.json"), b);
  writeJson(path.join(VERIFY, "regression-" + tag + "-new.json"), n);
  console.log("--- regression " + tag + " -> " + verdict + " ---");
  for (const c of checks) console.log("  [" + c.level + "] " + c.id + " | " + c.metric + " | A=" + c.a + " B=" + c.b);
  console.log("--- 并排图 " + pairs.length + " 张；汇总 shots/verify/regression-report.json ---");
  return { ok: verdict === "PASS", verdict: verdict, checks: checks, pairs: pairs };
}

function main() {
  const lw = lockWrap();
  if (lw.wrapped) return lw.code;
  if (!cmd || flag('help') || cmd === 'help') {
    console.log(['用法：',
      '  node tools/motion-verify.mjs build                  # 跑 android/build.sh + 断言产物与版本号',
      '  node tools/motion-verify.mjs install [--apk PATH]   # 装到 <DEVICE> + 断言可启动无 crash',
      '  node tools/motion-verify.mjs capture --name NAME --pkg PKG --secs N [--id A1..A12] [--scale 1|5] [--size WxH] [--tap x,y] [--steps JSON] [--fps 30]',
      '',
      '  --id A1..A12  按 docs/motion-capture-protocol.md §4 的标准交互脚本采集（两侧必须同 id 同参数）',
      '  --scale N     采集前把三个动画缩放都设为 N（1=测时长真值，5/10=慢放提高曲线分辨率）；收尾一律复位为 1',
      '  --seq          等价替代：launch | idle | drawer | back',
      '  node tools/motion-verify.mjs compare --a A.json --b B.json [--samples 12] [--pair NAME]   # 逐帧对齐两侧序列 + 并排图 + 数值差表',
      '  node tools/motion-verify.mjs regression [--baseline APK] [--new APK] [--tag NAME]   # 基线 vs 新版：同动作脚本 → 行为签名逐步比对',
      '  node tools/motion-verify.mjs probe-display [--pkgs A,B] [--pkg X] [--launch]   # MuMu 多屏映射体检（-d 该填什么）',
      '',
      '产物：shots/verify/<name>.mp4 + <name>.frames.json（每帧 PTS）+ <name>/*.png（全帧）',
      '      + <name>.json（断言/缩放/时长证据）+ <name>-gfxinfo.txt（framestats 原始）+ <name>-final.png',
      '      汇总 JSON 同时写 tools/motion-verify-capture.json',
      '',
      '退出码：0 全通过，1 有 FAIL。'].join(NL));
    return 0;
  }
  const t = probeEnv();
  console.log('== motion-verify ' + cmd + ' ==');
  console.log('adb=' + t.adb.version + ' | device=' + DEVICE + ' sdk=' + t.device.sdk + ' | ffmpeg=' + (t.ffmpeg ? t.ffmpeg.version.split(' ')[0] : 'MISSING') + ' | python=' + (t.python ? t.python.version + ' PIL=' + t.python.pillow : 'MISSING'));
  let r = null;
  if (cmd === 'build') r = cmdBuild();
  else if (cmd === 'install') r = cmdInstall();
  else if (cmd === 'capture') r = cmdCapture();
  else if (cmd === 'probe-display') r = cmdProbeDisplay();
  else if (cmd === 'compare') r = cmdCompare();
  else if (cmd === 'regression') r = cmdRegression();
  else { console.log('未知子命令：' + cmd); return 2; }
  return r && r.ok ? 0 : 1;
}
process.exit(main());

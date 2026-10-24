#!/usr/bin/env node
// npm run verify —— 发版前的守门脚本，零依赖。
//   1) node --check 全部 .js/.mjs
//   2) 解析 cordis.patch.yml 的关键字段（不引入 yaml 依赖，用最小校验）
//   3) npm pack --dry-run 检查打包清单里有没有 APK 与入口文件
//   4) 扫描文档里的相对链接是否都存在
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const problems = []
const ok = (message) => console.log('  ok   ' + message)
const bad = (message) => { problems.push(message); console.log('  FAIL ' + message) }

/* 1) 语法检查 ------------------------------------------------------------- */
console.log('[1/4] node --check')
const jsFiles = ['index.js', 'client.js']
  .concat(readdirSync(join(root, 'lib')).filter((name) => name.endsWith('.js')).map((name) => 'lib/' + name))
  .concat(existsSync(join(root, 'scripts')) ? readdirSync(join(root, 'scripts')).filter((n) => n.endsWith('.mjs')).map((n) => 'scripts/' + n) : [])
for (const file of jsFiles) {
  try { execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'pipe' }) } catch (error) {
    bad(file + ': ' + String(error.stderr || error.message).split('\n').slice(0, 4).join(' '))
  }
}
if (!problems.length) ok(jsFiles.length + ' files')

/* 2) cordis patch --------------------------------------------------------- */
console.log('[2/4] cordis.patch.yml')
try {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  for (const needle of ['- id: dsh-phoneharness', 'name: dsh-phoneharness', 'port:', 'bind:']) {
    if (!patch.includes(needle)) bad('cordis.patch.yml 缺少 ' + needle)
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (pkg.name !== 'dsh-phoneharness') bad('package.json name 应为 dsh-phoneharness，实际 ' + pkg.name)
  if (!pkg.version) bad('package.json 缺 version')
  if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') bad('package.json dsh.bundle.patch 指向不对')
  if (!problems.length) ok('id / name / port / bind / version ' + pkg.version)
} catch (error) { bad('cordis.patch.yml: ' + error.message) }

/* 3) 打包清单 ------------------------------------------------------------ */
console.log('[3/4] npm pack --dry-run')
try {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: root, stdio: 'pipe', shell: process.platform === 'win32' })
  const info = JSON.parse(String(out))[0]
  const files = new Set(info.files.map((entry) => entry.path))
  // APK 是发版时注入的构建产物（不进 git）：有就检查，没有只提示，不算失败。
  const hasApk = existsSync(join(root, 'assets', 'dsh-phone.apk'))
  const required = ['index.js', 'client.js', 'cordis.patch.yml', 'README.md']
  if (hasApk) required.push('assets/dsh-phone.apk')
  for (const name of required) {
    if (!files.has(name)) bad('打包缺文件：' + name)
  }
  if (hasApk) {
    if (!files.has('assets/dsh-phone.apk.json')) bad('打包缺 assets/dsh-phone.apk.json（面板靠它显示 APK 版本）')
  } else {
    console.log('  warn 没找到 assets/dsh-phone.apk（发版前把 android/bin/dsh-phone.apk 拷进来），跳过 APK 两项打包检查')
  }
  if (!problems.length) ok(info.files.length + ' files, ' + Math.round(info.size / 1024) + ' KB')
} catch (error) { bad('npm pack 失败：' + String(error.stderr || error.message).split('\n')[0]) }

/* 4) 文档链接 ------------------------------------------------------------ */
console.log('[4/4] 文档相对链接')
const mdFiles = ['README.md'].concat(
  existsSync(join(root, 'docs')) ? readdirSync(join(root, 'docs')).filter((n) => n.endsWith('.md')).map((n) => 'docs/' + n) : [],
)
let linkCount = 0
for (const file of mdFiles) {
  const base = file.includes('/') ? dirname(join(root, file)) : root
  const text = readFileSync(join(root, file), 'utf8')
  for (const match of text.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
    const target = match[1]
    if (/^(https?:|mailto:|data:)/.test(target)) continue
    linkCount++
    const resolved = resolve(base, target)
    if (!existsSync(resolved) || (existsSync(resolved) && statSync(resolved).isDirectory() && !existsSync(join(resolved, 'README.md')))) {
      bad(file + ' → ' + target)
    }
  }
}
if (!problems.length) ok(linkCount + ' links')

if (problems.length) {
  console.log('\n' + problems.length + ' 项未通过')
  process.exit(1)
}
console.log('\nverify 通过')
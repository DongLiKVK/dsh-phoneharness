/**
 * dsh-phoneharness — client half.
 *
 * 一个设置页面板：显示手机要填的地址、当前配对码、已配对设备。
 * 不在前端做任何状态管理，只是轮询 /dsh-phone/api/status 并渲染。
 *
 * 用 --dsw-alias-* 主题变量，跟随浅色/深色。
 */
window.__ModuleLoader__.load({
  id: 'dsh-phoneharness',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'dsh-phoneharness'
    const API = '/dsh-phone/api'

    const zh = {
      nav: '手机远程',
      title: '手机远程控制',
      subtitle: '手机装一个 APK，就能在局域网里接管这台电脑上的 DSH 会话，包括批准工具调用。',
      running: '服务已启动',
      stopped: '服务未启动',
      port: '端口',
      bind: '监听',
      code: '配对码',
      codeHint: '在手机 APK 里输入这 6 位数字。有效期 {m} 分 {s} 秒，用过一次就换。',
      codeExpired: '已过期，点「换一个」生成新的',
      refresh: '换一个',
      addresses: '手机里填这个地址',
      addrHint: '每条地址是一种接入方式，挑一条填就行。没装 Tailscale 也能用：手机和电脑连同一个 WiFi，填「局域网」那条。',
      pick: '怎么选',
      pickSame: '手机和电脑在同一个 WiFi → 用「局域网」那条。不用装任何东西，这是最常见的情况。',
      pickRemote: '手机用 4G / 不在同一个网络 → 用「Tailscale」那条。电脑和手机登录同一个免费账号即可，异地也能连。',
      pickLocal: '只想在这台电脑上自测 → 127.0.0.1。手机连不上是正常的。',
      noTailscale: '这台电脑没有 Tailscale 网卡（可选组件）。不装也能在同一个 WiFi 里用；装了才能在外网连回来。',
      lanOff: '想让手机在局域网里连：把插件配置的 bind 改成 lan,loopback（或 0.0.0.0），重启宿主。',
      remoteTitle: '外网接入（可选 · Tailscale）',
      remoteReady: '已就绪',
      remoteInstalled: '已安装 · 未生效',
      remoteMissing: '未安装',
      remoteWhy: '手机不在这条 WiFi 上（用 4G、出差、公司网络）时想连回这台电脑，用 Tailscale：它把手机和电脑放进同一条私有网络，两端各拿到一个 100.x 地址，设备之间加密传输。不用在路由器上开端口，也不用把 8737 暴露到公网。',
      remoteStep1: '① 电脑：打开 tailscale.com/download 安装，用你的账号登录（Windows / macOS / Linux 都有）。',
      remoteStep2: '② 手机：装 Tailscale（应用商店搜「Tailscale」，或 tailscale.com/download/android），登录同一个账号。',
      remoteStep3: '③ 回到这个面板：地址列表会多出「Tailscale」那行，点「复制」，填进手机 APK 的配对页。',
      remoteReadyHint: '已经装好并在监听：上面那条「Tailscale」就是外网可用的地址。',
      remoteInstalledHint: '本机已有 Tailscale 网卡，但没有被插件监听 —— 把 bind 改成 loopback,lan,tailscale 并重启宿主。',
      remoteDlDesktop: '下载电脑版',
      remoteDlPhone: '下载安卓版',
      remoteDlIos: 'iOS',
      remoteFree: '免费个人版够用（最多 100 台设备）。流量在两台设备之间加密，我们不接触内容，也不经过我们的服务器中转明文。',
      remotePhoneHint: '手机端还没装？装上并登录同一个账号，才能用这条地址。',
      remoteAuto: '面板每 5 秒自动刷新一次，装完等几秒即可看到新地址。',
      noAddress: '没找到可用的网卡地址，确认这台电脑连着 WiFi 或网线。',
      kindTailscale: 'Tailscale',
      kindLan: '局域网',
      kindVirtual: '虚拟网卡',
      kindOther: '其他',
      sceneTailscale: '手机登录同一 Tailscale 账号时可用：异地、4G、换 WiFi 都能连，链路端到端加密。',
      sceneLan: '手机和这台电脑在同一个 WiFi / 同一交换机下才可用；手机切到 4G 或换网络就失效。',
      sceneVirtual: 'OPPO 互联、VMware、Docker、WSL 这类虚拟网卡，只服务它们自己的设备直连，手机浏览器连不上。',
      sceneOther: '不属于上面三类，来自 bind 里手工配置的地址。',
      sceneLoopback: '只在本机内部有效，手机永远连不到（给本机调试用）。',
      badgeRecommend: '推荐',
      badgeListening: '监听中',
      badgeNotListening: '未监听',
      notListeningHint: '这条地址不在当前 bind 里，手机填了会连不上；要开放请改插件配置的 bind。',
      about: '关于 / 更新',
      aboutVersion: '插件版本',
      aboutApk: '随包 APK',
      aboutRepo: '开源仓库',
      aboutLicense: '许可证',
      aboutDocs: '文档',
      aboutDocsValue: 'docs/：安装、配置、地址、更新、架构',
      aboutDev: '二次开发',
      aboutDevValue: 'docs/architecture.md 有模块划分与 6 类扩展点；docs/api.md 是完整协议。',
      aboutContrib: '贡献 / 安全',
      aboutContribValue: 'CONTRIBUTING.md · SECURITY.md（漏洞请走 Security Advisory）',
      aboutUpdate: '怎么更新',
      aboutUpdatePlugin: '插件：npm pack 出 tgz，再 dsh plugin --profile <profile> add file:<tgz>，重启宿主后新版本生效。',
      aboutUpdateApk: 'APK：新包随插件 assets/ 一起发；手机重装覆盖，versionCode 必须递增。',
      aboutSafe: '升级前先备份 ~/.dsh/phone-harness/（设备令牌）与插件目录，回滚只需把旧 tgz 再 add 一次。',
      updateTitle: '更新',
      updateAuto: '自动检查更新',
      updateAutoOn: '已开启',
      updateAutoOff: '已关闭',
      updateCheck: '立即检查',
      updateChecking: '检查中…',
      updateCurrent: '当前版本',
      updateLatest: '最新版本',
      updateChecked: '上次检查',
      updateNever: '还没检查过',
      updateBadgeNew: '有新版 {v}',
      updateBadgeOk: '已是最新',
      updateBadgeAhead: '本地版更新',
      updateBadgeUnknown: '无法检测',
      updateUpgrade: '升级：npm pack 出 tgz 后 dsh plugin --profile <profile> add <tgz 绝对路径>，再重启宿主。',
      updateHint: '宿主每 {h} 小时自动查一次（启动约 8 秒后查首次），结果缓存在 update.json；关掉开关就不再联网。',
      updateNoSource: '暂时没有可用的发布源：npm 上还没有这个包，GitHub 仓库地址也是占位（OWNER）。发布后这里会自动亮；也可以配 updateFeed 指向自建地址。',
      updateFeedHint: '自建检查源：插件配置里写 updateFeed: "https://…/latest.json"，返回 {"version":"0.5.0"} 就会参与版本比较。',
      updateSourcesTitle: '来源',
      updateSourceOk: '正常',
      updateSourceMissing: '未发布',
      updateSourceUnconfigured: '占位地址',
      updateSourceError: '失败',
      updateSourceSkipped: '未配置',
      updateAheadHint: '本地装的版本比发布源还新（自己构建的包），不需要升级。',
      updateErrorHint: '最近一次检查有问题',
      copied: '已复制',
      copy: '复制',
      devices: '已配对的手机',
      noDevices: '还没有手机配对过。',
      revoke: '移除',
      lastSeen: '最后活跃',
      never: '还没连过',
      steps: '怎么连',
      step1: '手机和电脑连同一个 WiFi。',
      step2: '手机装 dsh-phone.apk（从项目 Releases 下载，或电脑直接把包发给手机），打开。',
      step3: '填上面的地址和配对码，点「配对并连接」。',
      approval: '审批转发',
      approvalOn: '可用（手机能批准工具调用）',
      approvalOff: '不可用（这个 DSH 版本没有 approval/request 事件）',
      approvalStats: '已收到 {asked} · 已回答 {answered} · 挂起 {pending}',
      streams: '正在连的手机',
      dataRoot: '数据目录',
      error: '启动错误',
      loading: '读取中…',
    }
    const en = {
      nav: 'Phone',
      title: 'Remote control from your phone',
      subtitle: 'Install the APK on your phone to drive this machine\u2019s DSH sessions over the LAN, including approving tool calls.',
      running: 'Server is up',
      stopped: 'Server is not running',
      port: 'Port',
      bind: 'Bind',
      code: 'Pairing code',
      codeHint: 'Type these 6 digits into the phone app. Valid for {m}m {s}s, and it changes after one use.',
      codeExpired: 'Expired — press "New code"',
      refresh: 'New code',
      addresses: 'Enter this address on the phone',
      addrHint: 'Each row is one way a phone can reach this machine — pick one. No Tailscale needed: if the phone is on the same WiFi, use the LAN row.',
      pick: 'Which one?',
      pickSame: 'Phone and computer on the same WiFi -> use the LAN row. Nothing else to install; this is the common case.',
      pickRemote: 'Phone on 4G / a different network -> use the Tailscale row. Sign both devices into the same free account.',
      pickLocal: 'Testing on this computer only -> 127.0.0.1. The phone cannot reach it, which is expected.',
      noTailscale: 'No Tailscale interface on this machine (optional). Same-WiFi use works without it; install it to reach this host from outside.',
      lanOff: 'To allow phones on the LAN, set the plugin bind to lan,loopback (or 0.0.0.0) and restart the host.',
      remoteTitle: 'Remote access (optional - Tailscale)',
      remoteReady: 'ready',
      remoteInstalled: 'installed, inactive',
      remoteMissing: 'not installed',
      remoteWhy: 'To reach this machine while the phone is on 4G or another network, use Tailscale: it puts the phone and this computer on one private network, each with a 100.x address, encrypted end to end. No router port forwarding and no 8737 exposed to the internet.',
      remoteStep1: '1) Computer: install from tailscale.com/download and sign in (Windows / macOS / Linux).',
      remoteStep2: '2) Phone: install Tailscale (store search, or tailscale.com/download/android) and sign in to the same account.',
      remoteStep3: '3) Back here: a Tailscale row appears in the address list; copy it into the phone pairing screen.',
      remoteReadyHint: 'Installed and listening: the Tailscale row above is your remote address.',
      remoteInstalledHint: 'A Tailscale interface exists but is not bound - set bind to loopback,lan,tailscale and restart the host.',
      remoteDlDesktop: 'Desktop download',
      remoteDlPhone: 'Android',
      remoteDlIos: 'iOS',
      remoteFree: 'The free personal plan is plenty (up to 100 devices). Traffic is encrypted between your devices; we never see it and it is not relayed in plaintext by us.',
      remotePhoneHint: 'Phone app not installed yet? Install it and sign in to the same account to use this address.',
      remoteAuto: 'The panel refreshes every 5 seconds, so new addresses show up shortly after installing.',
      noAddress: 'No usable address found. Check that this machine is on Wi-Fi or Ethernet.',
      kindTailscale: 'Tailscale',
      kindLan: 'LAN',
      kindVirtual: 'Virtual NIC',
      kindOther: 'Other',
      sceneTailscale: 'Works whenever the phone is signed in to the same Tailscale account: remote networks, 4G, any Wi-Fi, end-to-end encrypted.',
      sceneLan: 'Works only while the phone and this machine are on the same Wi-Fi or switch; it stops working on 4G.',
      sceneVirtual: 'Virtual adapters (OPPO Connect, VMware, Docker, WSL) only serve their own device links; a phone browser cannot reach them.',
      sceneOther: 'Not one of the categories above — an address configured by hand in bind.',
      sceneLoopback: 'Loopback only. The phone can never reach it; it is for local debugging.',
      badgeRecommend: 'Use this',
      badgeListening: 'listening',
      badgeNotListening: 'not listening',
      notListeningHint: 'This address is outside the current bind, so the phone cannot connect. Add it to bind to open it.',
      about: 'About & updates',
      aboutVersion: 'Plugin version',
      aboutApk: 'Bundled APK',
      aboutRepo: 'Repository',
      aboutLicense: 'License',
      aboutDocs: 'Docs',
      aboutDocsValue: 'docs/: install, configure, addresses, update, architecture',
      aboutDev: 'Extending',
      aboutDevValue: 'docs/architecture.md maps the modules and six extension points; docs/api.md is the full protocol.',
      aboutContrib: 'Contributing / security',
      aboutContribValue: 'CONTRIBUTING.md · SECURITY.md (report vulnerabilities via Security Advisory)',
      aboutUpdate: 'How to update',
      aboutUpdatePlugin: 'Plugin: npm pack into a tgz, then dsh plugin --profile <profile> add file:<tgz>; restart the host to activate.',
      aboutUpdateApk: 'APK: ships inside plugin assets; reinstall over the old one and bump versionCode.',
      aboutSafe: 'Back up ~/.dsh/phone-harness/ and the plugin folder first; to roll back, add the previous tgz again.',
      updateTitle: 'Updates',
      updateAuto: 'Check automatically',
      updateAutoOn: 'on',
      updateAutoOff: 'off',
      updateCheck: 'Check now',
      updateChecking: 'Checking…',
      updateCurrent: 'Installed',
      updateLatest: 'Latest',
      updateChecked: 'Last check',
      updateNever: 'never',
      updateBadgeNew: '{v} available',
      updateBadgeOk: 'Up to date',
      updateBadgeAhead: 'Local build newer',
      updateBadgeUnknown: 'No source',
      updateUpgrade: 'Upgrade: npm pack to a tgz, then dsh plugin --profile <profile> add <absolute tgz path> and restart the host.',
      updateHint: 'The host checks every {h}h (first check ~8s after start) and caches the result in update.json. Turn the switch off to stop all network checks.',
      updateNoSource: 'No release source yet: the package is not on npm and the GitHub repo is still a placeholder (OWNER). It lights up after publishing, or point updateFeed at your own endpoint.',
      updateFeedHint: 'Custom source: set updateFeed: "https://…/latest.json" in the plugin config; it just needs to return {"version":"0.5.0"}.',
      updateSourcesTitle: 'Sources',
      updateSourceOk: 'ok',
      updateSourceMissing: 'not published',
      updateSourceUnconfigured: 'placeholder',
      updateSourceError: 'error',
      updateSourceSkipped: 'not set',
      updateAheadHint: 'The installed build is newer than every release source (self-built tgz), so there is nothing to upgrade.',
      updateErrorHint: 'Last check reported a problem',
      copied: 'Copied',
      copy: 'Copy',
      devices: 'Paired phones',
      noDevices: 'No phone has paired yet.',
      revoke: 'Remove',
      lastSeen: 'Last seen',
      never: 'never',
      steps: 'How to connect',
      step1: 'Put the phone and this machine on the same Wi-Fi.',
      step2: 'Install dsh-phone.apk (from the project Releases page, or copy it from your computer) and open it.',
      step3: 'Enter the address and pairing code above, then tap Connect.',
      approval: 'Approval relay',
      approvalOn: 'available (the phone can approve tool calls)',
      approvalOff: 'unavailable (this DSH build emits no approval/request event)',
      approvalStats: '{asked} asked · {answered} answered · {pending} pending',
      streams: 'Connected phones',
      dataRoot: 'Data directory',
      error: 'Startup error',
      loading: 'Loading…',
    }

    const S = {
      page: { display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 2px 28px', minWidth: 0 },
      hero: { display: 'flex', flexDirection: 'column', gap: 6 },
      title: { fontSize: 17, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      subtitle: { fontSize: 12.5, lineHeight: '19px', color: 'var(--dsw-alias-label-secondary)' },
      card: {
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        borderRadius: 10,
        padding: '13px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        minWidth: 0,
      },
      cardTitle: { fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', letterSpacing: '.02em' },
      row: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' },
      gap: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
      dot: (color) => ({ width: 7, height: 7, borderRadius: '50%', background: color, flex: '0 0 auto' }),
      mono: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12.5,
        color: 'var(--dsw-alias-label-primary)',
        wordBreak: 'break-all',
      },
      code: {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 30,
        fontWeight: 600,
        letterSpacing: '.18em',
        color: 'var(--dsw-alias-label-primary)',
        lineHeight: '36px',
      },
      muted: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', lineHeight: '18px' },
      btn: {
        appearance: 'none',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        borderRadius: 8,
        padding: '5px 10px',
        fontSize: 12,
        lineHeight: '17px',
        fontFamily: 'inherit',
        cursor: 'pointer',
      },
      addr: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'space-between',
        padding: '7px 9px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l2)',
        minWidth: 0,
      },
      deviceRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'space-between',
        padding: '6px 0',
        borderTop: '1px solid var(--dsw-alias-border-l2)',
        minWidth: 0,
      },
      tag: {
        fontSize: 11,
        lineHeight: '16px',
        padding: '1px 7px',
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l2)',
        color: 'var(--dsw-alias-label-secondary)',
        flex: '0 0 auto',
      },
      tagAccent: {
        fontSize: 11,
        lineHeight: '16px',
        padding: '1px 7px',
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-state-success-primary, #2fbf71)',
        color: 'var(--dsw-alias-state-success-primary, #2fbf71)',
        flex: '0 0 auto',
      },
      tagWarn: {
        fontSize: 11,
        lineHeight: '16px',
        padding: '1px 7px',
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-state-warning-primary, #c08a2e)',
        color: 'var(--dsw-alias-state-warning-primary, #c08a2e)',
        flex: '0 0 auto',
      },
      link: { color: 'var(--dsw-alias-label-primary)', textDecoration: 'underline', wordBreak: 'break-all' },
      kv: { display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0, justifyContent: 'space-between' },
      step: { display: 'flex', gap: 9, minWidth: 0, alignItems: 'flex-start' },
      stepNo: {
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: 'var(--dsw-alias-bg-layer-2)',
        border: '1px solid var(--dsw-alias-border-l2)',
        fontSize: 11,
        lineHeight: '17px',
        textAlign: 'center',
        flex: '0 0 auto',
        color: 'var(--dsw-alias-label-secondary)',
      },
    }

    function readJson(response) {
      return response.text().then((text) => {
        try {
          return text === '' ? {} : JSON.parse(text)
        } catch {
          throw new Error('HTTP ' + String(response.status))
        }
      })
    }

    function left(ms) {
      if (!Number.isFinite(ms)) return null
      const total = Math.max(0, Math.floor((ms - Date.now()) / 1000))
      return { m: Math.floor(total / 60), s: total % 60, total }
    }

    function when(value) {
      if (!value) return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      const diff = Date.now() - date.getTime()
      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
      if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'
      return date.toLocaleDateString()
    }

    function useStatus() {
      const [state, setState] = React.useState({ status: null, failed: null })
      React.useEffect(() => {
        let alive = true
        const load = () => {
          fetch(API + '/status', { cache: 'no-store' })
            .then(readJson)
            .then((payload) => { if (alive) setState({ status: payload, failed: null }) })
            .catch((error) => { if (alive) setState({ status: null, failed: String(error && error.message ? error.message : error) }) })
        }
        load()
        const timer = setInterval(load, 5000)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [])
      return state
    }

    function copyText(text) {
      const nav = typeof navigator === 'undefined' ? null : navigator
      if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
        return nav.clipboard.writeText(text).catch(() => undefined)
      }
      return Promise.resolve(undefined)
    }

    const KIND_ORDER = { tailscale: 0, lan: 1, virtual: 2, other: 3, loopback: 4 }

    function kindLabel(t, kind) {
      if (kind === 'tailscale') return t('kindTailscale')
      if (kind === 'lan') return t('kindLan')
      if (kind === 'virtual') return t('kindVirtual')
      return t('kindOther')
    }

    function kindScene(t, kind) {
      if (kind === 'tailscale') return t('sceneTailscale')
      if (kind === 'lan') return t('sceneLan')
      if (kind === 'virtual') return t('sceneVirtual')
      if (kind === 'loopback') return t('sceneLoopback')
      return t('sceneOther')
    }

    /** 排序分：正在监听的排在前面，其次 tailscale > lan > virtual > other。 */
    function addressScore(entry) {
      const kind = KIND_ORDER[entry.kind] === undefined ? 3 : KIND_ORDER[entry.kind]
      return (entry.listening ? 10 : 0) + (4 - Math.min(kind, 4))
    }

    function Address(props) {
      const [done, setDone] = React.useState(false)
      const t = props.t
      const entry = props.entry || {}
      const kind = String(entry.kind || 'other')
      const listening = props.listening !== false
      return h('div', {
        style: { ...S.addr, flexDirection: 'column', alignItems: 'stretch', gap: 5, opacity: listening ? 1 : 0.6 },
      },
        h('div', { style: S.row },
          h('span', { style: S.tag }, kindLabel(t, kind)),
          props.recommend ? h('span', { style: S.tagAccent }, t('badgeRecommend')) : null,
          listening ? null : h('span', { style: S.tagWarn }, t('badgeNotListening')),
          h('div', { style: { flex: 1 } }),
          h('button', {
            type: 'button',
            style: S.btn,
            onClick: () => {
              void copyText(props.value)
              setDone(true)
              setTimeout(() => setDone(false), 1400)
            },
          }, done ? t('copied') : t('copy')),
        ),
        h('span', { style: S.mono }, props.value),
        h('div', { style: S.muted }, kindScene(t, kind)),
        listening ? null : h('div', {
          style: { ...S.muted, color: 'var(--dsw-alias-state-warning-primary, #c08a2e)' },
        }, t('notListeningHint')),
        listening || kind !== 'lan' ? null : h('div', { style: S.muted }, t('lanOff')),
      )
    }

    /** 外网接入引导：解释 Tailscale 是什么、怎么装、装完在哪看地址。状态跟着 rows 走。 */
    function RemoteCard(props) {
      const t = props.t
      const rows = Array.isArray(props.rows) ? props.rows : []
      const tail = rows.filter((entry) => entry.kind === 'tailscale')
      const ready = tail.some((entry) => entry.listening)
      const installed = tail.length > 0
      const badge = ready ? S.tagAccent : (installed ? S.tagWarn : S.tag)
      return h('div', { style: { ...S.card, gap: 7 } },
        h('div', { style: S.row },
          h('span', { style: S.cardTitle }, t('remoteTitle')),
          h('div', { style: { flex: 1 } }),
          h('span', { style: badge }, ready ? t('remoteReady') : (installed ? t('remoteInstalled') : t('remoteMissing'))),
        ),
        h('div', { style: S.muted }, t('remoteWhy')),
        ready ? h('div', { style: S.muted }, t('remoteReadyHint')) : null,
        installed && !ready ? h('div', { style: { ...S.muted, color: 'var(--dsw-alias-state-warning-primary, #c08a2e)' } }, t('remoteInstalledHint')) : null,
        installed ? null : h('div', { style: S.gap },
          h('div', { style: S.muted }, t('remoteStep1')),
          h('div', { style: S.muted }, t('remoteStep2')),
          h('div', { style: S.muted }, t('remoteStep3')),
        ),
        installed ? null : h('div', { style: S.row },
          h('a', {
            href: 'https://tailscale.com/download',
            target: '_blank',
            rel: 'noreferrer',
            style: { ...S.btn, textDecoration: 'none', display: 'inline-block' },
          }, t('remoteDlDesktop')),
          h('a', {
            href: 'https://tailscale.com/download/android',
            target: '_blank',
            rel: 'noreferrer',
            style: { ...S.btn, textDecoration: 'none', display: 'inline-block' },
          }, t('remoteDlPhone')),
        ),
        h('div', { style: S.muted }, t('remoteFree')),
        ready ? h('div', { style: S.gap },
          h('div', { style: S.muted }, t('remotePhoneHint')),
          h('div', { style: S.row },
            h('a', {
              href: 'https://tailscale.com/download/android',
              target: '_blank',
              rel: 'noreferrer',
              style: { ...S.btn, textDecoration: 'none', display: 'inline-block' },
            }, t('remoteDlPhone')),
            h('a', {
              href: 'https://tailscale.com/download/ios',
              target: '_blank',
              rel: 'noreferrer',
              style: { ...S.btn, textDecoration: 'none', display: 'inline-block' },
            }, t('remoteDlIos')),
          ),
        ) : null,
        ready ? null : h('div', { style: S.muted }, t('remoteAuto')),
      )
    }

    function sourceLabel(t, status) {
      if (status === 'ok') return t('updateSourceOk')
      if (status === 'missing') return t('updateSourceMissing')
      if (status === 'unconfigured') return t('updateSourceUnconfigured')
      if (status === 'skipped') return t('updateSourceSkipped')
      return t('updateSourceError')
    }

    /**
     * 更新卡片：当前版本 / 最新版本 / 上次检查 / 三个来源的状态，外加「立即检查」与自动检查开关。
     * 数据全部来自 /status（服务端缓存），点「立即检查」才走 POST /update/check 强制联网。
     */
    function UpdateCard(props) {
      const t = props.t
      const snap = props.snap !== null && typeof props.snap === 'object' ? props.snap : {}
      const checking = props.checking === true
      const sources = Array.isArray(snap.sources) ? snap.sources : []
      const hours = Math.max(1, Math.round((Number(snap.intervalMs) || 21600000) / 3600000))
      const badge = snap.updateAvailable ? S.tagWarn : (snap.latest ? (snap.ahead ? S.tag : S.tagAccent) : S.tag)
      const badgeText = snap.updateAvailable
        ? t('updateBadgeNew').replace('{v}', String(snap.latest || ''))
        : (snap.latest ? (snap.ahead ? t('updateBadgeAhead') : t('updateBadgeOk')) : t('updateBadgeUnknown'))
      const checked = snap.checkedAt ? when(new Date(Number(snap.checkedAt)).toISOString()) : t('updateNever')
      return h('div', { style: { ...S.card, gap: 7 } },
        h('div', { style: S.row },
          h('span', { style: S.cardTitle }, t('updateTitle')),
          h('div', { style: { flex: 1 } }),
          h('span', { style: badge }, badgeText),
        ),
        h('div', { style: S.kv },
          h('span', { style: S.muted }, t('updateCurrent')),
          h('span', { style: S.mono }, String(snap.current || '—'))),
        h('div', { style: S.kv },
          h('span', { style: S.muted }, t('updateLatest')),
          h('span', { style: S.mono }, snap.latest ? String(snap.latest) : '—')),
        h('div', { style: S.kv },
          h('span', { style: S.muted }, t('updateChecked')),
          h('span', { style: S.muted }, checked)),
        snap.updateAvailable ? h('div', { style: S.muted }, t('updateUpgrade')) : null,
        snap.ahead ? h('div', { style: S.muted }, t('updateAheadHint')) : null,
        snap.latest ? null : h('div', { style: S.muted }, t('updateNoSource')),
        snap.latest && snap.error
          ? h('div', { style: { ...S.muted, color: 'var(--dsw-alias-state-warning-primary, #c08a2e)' } },
            t('updateErrorHint') + '：' + String(snap.error))
          : null,
        sources.length ? h('div', { style: S.row },
          h('span', { style: S.muted }, t('updateSourcesTitle')),
          sources.map((entry) => h('span', {
            key: 'src-' + String(entry.id),
            style: entry.status === 'ok' ? S.tagAccent : (entry.status === 'missing' || entry.status === 'unconfigured' ? S.tag : S.tagWarn),
            title: String(entry.message || ''),
          }, String(entry.id) + ' · ' + sourceLabel(t, entry.status)))) : null,
        h('div', { style: S.row },
          h('button', { type: 'button', style: S.btn, disabled: checking || props.busy === true, onClick: props.onCheck },
            checking ? t('updateChecking') : t('updateCheck')),
          h('button', {
            type: 'button',
            style: { ...S.btn, borderColor: snap.auto ? 'var(--dsw-alias-state-success-primary, #2fbf71)' : undefined },
            disabled: checking || props.busy === true,
            onClick: props.onToggle,
          }, t('updateAuto') + ':' + ' ' + (snap.auto ? t('updateAutoOn') : t('updateAutoOff'))),
        ),
        h('div', { style: S.muted }, t('updateHint').replace('{h}', String(hours))),
        snap.latest ? null : h('div', { style: S.muted }, t('updateFeedHint')),
      )
    }

    function Panel(props) {
      const t = props.t
      const { status, failed } = useStatus()
      const [busy, setBusy] = React.useState(false)
      const [tick, setTick] = React.useState(0)
      // 更新卡片：liveUpdate 只存「我们主动发起的检查/开关」的结果，其余时间用 /status 里的快照。
      const [liveUpdate, setLiveUpdate] = React.useState(null)
      const [checking, setChecking] = React.useState(false)

      React.useEffect(() => {
        const timer = setInterval(() => setTick((value) => value + 1), 1000)
        return () => clearInterval(timer)
      }, [])

      const rotate = () => {
        setBusy(true)
        fetch(API + '/pairing', { method: 'POST', cache: 'no-store' })
          .catch(() => undefined)
          .then(() => setBusy(false))
      }

      const checkUpdate = () => {
        setChecking(true)
        fetch(API + '/update/check', { method: 'POST', cache: 'no-store' })
          .then(readJson)
          .then((payload) => { if (payload && payload.update) setLiveUpdate(payload.update) })
          .catch(() => undefined)
          .then(() => setChecking(false))
      }

      const toggleAuto = () => {
        const snapshot = liveUpdate || (status && status.update) || {}
        fetch(API + '/update/auto', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ auto: snapshot.auto !== true }),
        })
          .then(readJson)
          .then((payload) => { if (payload && payload.update) setLiveUpdate(payload.update) })
          .catch(() => undefined)
      }
      const revoke = (id) => {
        setBusy(true)
        fetch(API + '/devices/revoke', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id }),
        })
          .catch(() => undefined)
          .then(() => setBusy(false))
      }

      if (!status) {
        return h('div', { style: S.page },
          h('div', { style: S.hero },
            h('div', { style: S.title }, t('title')),
            h('div', { style: S.subtitle }, failed ? t('error') + '：' + failed : t('loading')),
          ),
        )
      }

      const alive = status.running === true
      const expires = left(Number(status.pairing && status.pairing.expiresAt))
      const code = status.pairing && status.pairing.code ? String(status.pairing.code) : ''
      const lan = Array.isArray(status.lan) ? status.lan : []
      const binds = Array.isArray(status.binds) ? status.binds : []
      const open = binds.length === 0 || binds.includes('0.0.0.0') || binds.includes('::')
      // 老宿主不返回 kind/listening：kind 缺省按 other，listening 缺省按 bind 推断，页面不炸。
      const rows = lan
        .map((entry) => ({
          name: entry && entry.name ? String(entry.name) : '',
          address: String((entry && entry.address) || ''),
          kind: entry && entry.kind ? String(entry.kind) : 'other',
          listening: entry && typeof entry.listening === 'boolean'
            ? entry.listening
            : (open || binds.includes(String((entry && entry.address) || ''))),
        }))
        .filter((entry) => entry.address)
        .sort((x, y) => addressScore(y) - addressScore(x))
      const shown = rows
      const best = rows.find((entry) => entry.listening) || rows[0] || null
      const apkMeta = status.apkMeta || null
      // 优先用主动检查拿到的最新快照，否则退回 /status 里的缓存快照。
      const updateSnap = liveUpdate && (!status.update || Number(liveUpdate.checkedAt || 0) >= Number(status.update.checkedAt || 0))
        ? liveUpdate
        : (status.update || null)
      const devices = Array.isArray(status.devices) ? status.devices : []
      const port = status.port || ''

      return h('div', { style: S.page },
        h('div', { style: S.hero },
          h('div', { style: S.title }, t('title')),
          h('div', { style: S.subtitle }, t('subtitle')),
        ),

        h('div', { style: S.card },
          h('div', { style: S.row },
            h('span', { style: S.dot(alive ? 'var(--dsw-alias-state-success-primary, #2fbf71)' : 'var(--dsw-alias-state-error-primary)') }),
            h('span', { style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' } }, alive ? t('running') : t('stopped')),
            alive ? h('span', { style: S.muted }, t('bind') + ' ' + (binds.length ? binds.join(', ') : String(status.bind || '')) + ' · ' + t('port') + ' ' + String(port)) : null,
          ),
          !alive && status.error ? h('div', { style: { ...S.muted, color: 'var(--dsw-alias-state-error-primary)' } }, t('error') + '：' + String(status.error)) : null,

          h('div', { style: { ...S.row, marginTop: 4 } },
            h('span', { style: S.cardTitle }, t('code')),
            h('div', { style: { flex: 1 } }),
            h('button', { type: 'button', style: S.btn, disabled: busy, onClick: rotate }, t('refresh')),
          ),
          code
            ? h('div', { style: S.code }, code)
            : h('div', { style: S.muted }, t('codeExpired')),
          code
            ? h('div', { style: S.muted },
              expires && expires.total > 0
                ? t('codeHint').replace('{m}', String(expires.m)).replace('{s}', String(expires.s))
                : t('codeExpired'))
            : null,

          h('div', { style: { ...S.cardTitle, marginTop: 6 } }, t('addresses')),
          h('div', { style: S.muted }, t('addrHint')),
          h('div', { style: { ...S.card, background: 'var(--dsw-alias-bg-tertiary, rgba(127,127,127,.06))', marginTop: 6, gap: 4 } },
            h('div', { style: S.cardTitle }, t('pick')),
            h('div', { style: S.muted }, t('pickSame')),
            h('div', { style: S.muted }, t('pickRemote')),
            h('div', { style: S.muted }, t('pickLocal')),
          ),
          rows.some((entry) => entry.kind === 'tailscale')
            ? null
            : h('div', { style: S.muted, marginTop: 2 }, t('noTailscale')),
          shown.length === 0
            ? h('div', { style: S.muted }, t('noAddress'))
            : h('div', { style: S.gap }, shown.map((entry, index) =>
              h(Address, {
                key: entry.address || String(index),
                t,
                entry,
                listening: entry.listening,
                // 只有真的在监听才配得上「推荐」：不然会出现「推荐 + 未监听」这种自相矛盾。
                recommend: entry.listening && best !== null && best.address === entry.address,
                value: 'http://' + String(entry.address) + ':' + String(port),
              }))),
        ),

        h(RemoteCard, { t, rows }),

        h('div', { style: S.card },
          h('div', { style: S.cardTitle }, t('devices')),
          devices.length === 0
            ? h('div', { style: S.muted }, t('noDevices'))
            : h('div', { style: S.gap }, devices.map((device) =>
              h('div', { key: String(device.id), style: S.deviceRow },
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
                  h('span', { style: { fontSize: 13, color: 'var(--dsw-alias-label-primary)' } }, String(device.name || device.id || '')),
                  h('span', { style: S.muted }, t('lastSeen') + ' ' + (device.lastSeenAt ? when(device.lastSeenAt) : t('never'))),
                ),
                h('button', { type: 'button', style: S.btn, disabled: busy, onClick: () => revoke(device.id) }, t('revoke')),
              ))),
        ),


        h('div', { style: S.card },
          h('div', { style: S.cardTitle }, t('steps')),
          h('div', { style: S.gap },
            [t('step1'), t('step2'), t('step3')].map((text, index) =>
              h('div', { key: String(index), style: S.step },
                h('span', { style: S.stepNo }, String(index + 1)),
                h('span', { style: S.muted }, text)))),
        ),

        h('div', { style: { ...S.card, gap: 5 } },
          h('div', { style: S.row },
            h('span', { style: S.cardTitle }, t('approval')),
            h('span', { style: S.muted }, status.approvals && status.approvals.available ? t('approvalOn') : t('approvalOff')),
          ),
          h('div', { style: S.row },
            h('span', { style: S.cardTitle }, t('streams')),
            h('span', { style: S.muted }, String(status.streamClients || 0)),
          ),
          h('div', { style: S.muted },
            t('approvalStats')
              .replace('{asked}', String((status.approvals && status.approvals.stats && status.approvals.stats.asked) || 0))
              .replace('{answered}', String((status.approvals && status.approvals.stats && status.approvals.stats.answered) || 0))
              .replace('{pending}', String((status.approvals && status.approvals.pending && status.approvals.pending.length) || 0))),
          h('div', { style: S.row },
            h('span', { style: S.cardTitle }, t('dataRoot')),
            h('span', { style: S.mono }, String(status.dataRoot || '')),
          ),
        ),

        h(UpdateCard, {
          t,
          snap: updateSnap,
          checking,
          busy,
          onCheck: checkUpdate,
          onToggle: toggleAuto,
        }),

        h('div', { style: { ...S.card, gap: 7 } },
          h('div', { style: S.cardTitle }, t('about')),
          h('div', { style: S.kv },
            h('span', { style: S.muted }, t('aboutVersion')),
            h('span', { style: S.mono }, status.version ? String(status.version) : '—')),
          h('div', { style: S.kv },
            h('span', { style: S.muted }, t('aboutApk')),
            h('span', { style: S.mono }, apkMeta && apkMeta.versionName
              ? 'v' + String(apkMeta.versionName) + ' (' + String(apkMeta.versionCode || '') + ')'
              : (status.apk ? 'included' : '—'))),
          status.repo
            ? h('div', { style: S.kv },
              h('span', { style: S.muted }, t('aboutRepo')),
              h('a', {
                href: String(status.repo),
                target: '_blank',
                rel: 'noreferrer',
                style: { ...S.link, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 },
              }, String(status.repo)))
            : null,
          h('div', { style: S.kv },
            h('span', { style: S.muted }, t('aboutLicense')),
            h('span', { style: S.mono }, 'MIT')),
          h('div', { style: S.kv },
            h('span', { style: S.muted }, t('aboutDocs')),
            h('span', { style: S.muted }, t('aboutDocsValue'))),
          h('div', { style: S.kv },
            h('span', { style: S.muted }, t('aboutDev')),
            h('span', { style: S.muted }, t('aboutDevValue'))),
          h('div', { style: S.kv },
            h('span', { style: S.muted }, t('aboutContrib')),
            h('span', { style: S.muted }, t('aboutContribValue'))),
          h('div', { style: { ...S.cardTitle, marginTop: 4 } }, t('aboutUpdate')),
          h('div', { style: S.muted }, t('aboutUpdatePlugin')),
          h('div', { style: S.muted }, t('aboutUpdateApk')),
          h('div', { style: S.muted }, t('aboutSafe')),
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-phoneharness: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'dsh-phoneharness',
          order: 55,
          label: () => t('nav'),
          locale: NS,
        }, (ownerProps) => h(Panel, {
          ...(ownerProps !== null && typeof ownerProps === 'object' ? ownerProps : {}),
          t,
        })))
      },
    }
  },
})

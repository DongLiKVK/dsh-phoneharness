
/* ================= 鲸域 · 前端交互 ================= */
(function () {
  const BR = window.BRAND;
  const D = window.DATA;
  const users = D.users, plugins = D.plugins, posts = D.posts, threads = D.threads;
  const floors = D.floors, visitors = D.visitors, notices = D.notices;
  const hotTopics = D.hotTopics, boards = D.boards, profileFields = D.profileFields;
  /* v6：条目库与作者授权分发用到的数据 */
  const claimMethods = D.claimMethods, grantTerms = D.grantTerms, reportTypes = D.reportTypes;
  const licenseRows = D.licenseRows, pkgStats = D.pkgStats;
  /* 插件分类只有一份真源：市场筛选、左栏「插件分类」、发布页下拉都读它 */
  const pluginCats = D.pluginCats;
  /* 社群分类与主标签的同义映射（公告 / 经验 / 求助），用于去重 */
  const catTagAlias = D.catTagAlias || {};
  /* v7：编辑资料页的选项表（性别 / 省市 / 职业 / 标签 / 头像预设 / 封面预设） */
  const profileOptions = D.profileOptions;

  const app = document.getElementById('app');
  const qs = (s, r) => (r || document).querySelector(s);
  const qsa = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => n >= 10000 ? (n / 10000).toFixed(1) + 'w' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  const num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  /* ---------- 鲸尾标志 ----------
     由用户手绘线稿矢量化而来（见 shots/_trace.py）：单条开放路径，56 个锚点。
     路径按「未旋转」形态归一化到 64×64（包围盒 5.71~58.29 / 6.22~57.78，四周留白 2、几何中心即 32,32），
     顺时针 9° 由内层 <g transform="rotate(9 32 32)"> 施加 —— 旋转原点即图形中心，要调角度只改这一个数字。
     线稿只描边不填充：fill:none + stroke-width 才是它本来的样子，小尺寸下也比填充版清楚得多。
     颜色走 currentColor（由 CSS 的 color 决定），线宽按显示尺寸逐处给：导航 5.2 / 页脚 6.8 / 头图 2.3。 */
  const TAIL_D = 'M27.1 57.8 C27.3 57.4 28.1 56.2 28.6 55.4 C29.0 54.6 29.4 53.9 29.8 52.9 C30.1 52.0 30.3 51.5 30.8 49.9 C31.2 48.3 32.1 44.8 32.5 43.4 C32.9 42.0 33.0 42.1 33.3 41.6 C33.6 41.0 33.9 40.6 34.2 40.2 C34.6 39.7 35.0 39.3 35.4 39.0 C35.9 38.6 35.1 38.8 36.8 38.0 C38.6 37.3 44.0 35.4 46.0 34.5 C48.0 33.6 48.1 33.4 49.0 32.8 C50.0 32.1 50.7 31.6 51.6 30.8 C52.6 29.9 53.7 28.8 54.6 27.8 C55.4 26.7 56.1 25.7 56.7 24.6 C57.3 23.6 57.8 22.2 58.1 21.5 C58.3 20.7 58.3 20.6 58.3 20.2 C58.3 19.9 58.3 19.5 58.2 19.2 C58.1 19.0 58.0 18.8 57.9 18.7 C57.7 18.5 58.2 18.4 57.1 18.4 C56.1 18.4 53.7 19.0 51.6 18.9 C49.5 18.8 46.2 18.1 44.6 17.9 C42.9 17.7 42.6 17.7 41.6 17.8 C40.6 17.8 40.0 17.8 38.6 18.1 C37.3 18.4 34.8 19.4 33.7 19.7 C32.7 20.0 32.7 19.8 32.3 19.7 C31.8 19.6 31.8 19.6 31.2 19.1 C30.5 18.5 29.2 17.1 28.4 16.4 C27.7 15.8 27.3 15.5 26.5 15.1 C25.8 14.7 25.3 14.4 23.9 13.9 C22.5 13.4 19.5 12.7 18.0 12.3 C16.6 11.8 16.2 11.6 15.3 11.2 C14.5 10.7 13.8 10.4 12.9 9.6 C12.0 8.9 10.5 7.4 9.7 6.8 C9.0 6.3 8.7 6.3 8.4 6.2 C8.0 6.1 7.8 6.2 7.5 6.4 C7.2 6.6 6.9 6.9 6.6 7.3 C6.4 7.7 6.2 8.1 6.1 8.7 C5.9 9.3 5.8 10.0 5.7 10.7 C5.7 11.4 5.7 12.3 5.7 13.1 C5.8 14.0 5.9 15.0 6.0 15.8 C6.1 16.6 6.3 17.3 6.5 18.1 C6.7 18.9 6.9 19.5 7.4 20.5 C7.8 21.5 8.6 23.0 9.3 24.1 C10.1 25.3 11.0 26.4 11.9 27.4 C12.7 28.4 13.2 28.9 14.5 30.0 C15.7 31.0 18.3 32.9 19.4 33.8 C20.5 34.7 20.6 34.8 21.0 35.4 C21.5 36.0 21.9 36.7 22.1 37.4 C22.4 38.0 22.5 38.6 22.5 39.3 C22.6 39.9 22.5 40.5 22.4 41.2 C22.3 41.9 22.1 42.7 21.8 43.4 C21.5 44.2 21.1 45.0 20.7 45.8 C20.3 46.6 19.8 47.3 19.3 48.0 C18.8 48.8 18.2 49.5 17.6 50.1 C17.0 50.8 16.8 51.1 15.6 52.0 C14.5 53.0 11.5 55.2 10.6 55.8';
  const TAIL_SW = 5.2;
  const tail = (size, sw, cls) => '<svg class="' + (cls || '') + '" viewBox="0 0 64 64" width="' + size +
    '" height="' + size + '" aria-hidden="true" focusable="false"><g transform="rotate(9 32 32)"><path d="' + TAIL_D +
    '" fill="none" stroke="currentColor" stroke-width="' + (sw || TAIL_SW) + '" stroke-linecap="round" stroke-linejoin="round"/></g></svg>';

  const S = {
    route: 'feed', spaceUser: '', tab: '全部', cat: '全部', sort: '热度',
    q: '', fsort: '最新', ftag: '全部', scat: '全部', threadId: 't1', reacts: new Set(),
    liked: new Set(['s2']), floorLiked: new Set(), installed: new Set(['p1']),
    fav: new Set(), cmtLiked: new Set(),
    comments: {}, expand: new Set(), noticesRead: false, lb: null, pop: null,
    follow: false, published: [],
    /* v6 · 授权与下载的瞬时状态。
       claimed / mirror 只装「这一次访问里改过的」条目，初始值仍来自 data.js：
       作者在认领页关掉镜像，列表与条目页立刻降到「仅条目」；刷新回到演示数据的原状。 */
    pid: 'p1', claimed: new Set(), mirror: {}, dl: null, rep: null, repT: {},
    vs: {}, vt: 'readme', tier: '全部',
    up: { file: null, compat: [], breaking: '', note: '', agreed: [], stage: '' },
    withdraw: new Set(),
    /* P0：新帖 / 新楼层 / 空间留言 / 发帖面板 */
    newThreads: [], newFloors: {}, msgs: {}, composerOpen: false,
    /* 发帖配图：两个队列分开存，避免日志草稿的图串到社群发帖里。
       只放内存不落盘 —— dataURL 动辄几百 KB，写进 localStorage 会撑爆存档。 */
    pendingImages: [], ntImages: [], pendingPlugin: '', pendingPluginVer: '', pickerOpen: false,
    /* 回复框「引用」要带进正文的那段楼层原文（只存内存，切楼层就丢） */
    quoteText: '',
    /* v15 · 多账号：资料 / 头像 / 封面都按账号存在 S.accounts[uid]，
       S.account 是「当前登录的是谁」，发言、发布、编辑资料全挂在它名下。
       draft 只属于当前账号，一换账号就丢掉，避免把 A 的草稿存进 B 的资料。 */
    account: 'u1', accounts: {}, draft: null, proPanel: '', fileErr: '',
    /* v17 · 登录：页面级临时状态。authTab 决定登录页停在哪一半，authErr 是面板顶部那条提示
       （带「去注册 / 去登录 / 退出」之类下一步动作），phone* 是手机号认证的中间态。
       全部只放内存：刷新就重来，一次失败不会把用户永久卡在错误里。 */
    authTab: 'login', authForm: null, authErr: null, authForce: false,
    oauthPending: '', phone: '', phoneDev: '', phoneCool: 0, setPanel: 'set-acc',
    /* v8 · 发布插件（仿 GitHub 新建仓库）：表单全在内存里，提交后进 com 审核态 */
    pub: { name: '', desc: '', owner: '', visibility: 'public', cat: '创作', license: 'MIT', ver: '0.1.0', init: ['readme'], agreed: [], file: null, stage: '' }
  };

  /* 一条动态最多四张图：和 .imgs 的四格栅格一一对应，超出就直接拒收而不是静默丢掉。
     前端先拦一道，后端 post_images 才不会因为图片数量把整条动态拖成半成品。 */
  const IMG_MAX = 4;
  const IMG_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const IMG_MAX_BYTES = 5 * 1024 * 1024;

  /* P1 · 刷新恢复常驻状态（白名单；Set→数组往返） */
  const STATE_KEY = 'dsh-forum-state-v1';
  (function restoreState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.liked)) S.liked = new Set(saved.liked);
      if (Array.isArray(saved.reacts)) S.reacts = new Set(saved.reacts);
      if (Array.isArray(saved.floorLiked)) S.floorLiked = new Set(saved.floorLiked);
      if (Array.isArray(saved.installed)) S.installed = new Set(saved.installed);
      if (Array.isArray(saved.fav)) S.fav = new Set(saved.fav);
      if (Array.isArray(saved.cmtLiked)) S.cmtLiked = new Set(saved.cmtLiked);
      if (saved.comments && typeof saved.comments === 'object') S.comments = saved.comments;
      if (typeof saved.noticesRead === 'boolean') S.noticesRead = saved.noticesRead;
      if (Array.isArray(saved.newThreads)) S.newThreads = saved.newThreads;
      if (saved.newFloors && typeof saved.newFloors === 'object') S.newFloors = saved.newFloors;
      if (saved.msgs && typeof saved.msgs === 'object') S.msgs = saved.msgs;
      if (saved.accounts && typeof saved.accounts === 'object') {
        Object.keys(saved.accounts).forEach(function (k) {
          const a = saved.accounts[k];
          if (!a || typeof a !== 'object' || !users[k]) return;
          const t = acct(k);
          if (a.profile && typeof a.profile === 'object') t.profile = a.profile;
          if (a.avatar && typeof a.avatar === 'object') t.avatar = a.avatar;
          if (typeof a.cover === 'string') t.cover = a.cover;
        });
      }
      /* 旧存档（单账号时代）只有 profile/avatar/cover 三键，全部归到 u1，不丢用户改过的东西 */
      if (saved.profile && typeof saved.profile === 'object') acct('u1').profile = saved.profile;
      if (saved.avatar && typeof saved.avatar === 'object') acct('u1').avatar = saved.avatar;
      if (typeof saved.cover === 'string') acct('u1').cover = saved.cover;
      if (typeof saved.account === 'string' && users[saved.account]) S.account = saved.account;
    } catch (err) {}
  })();

  /* 动效编排用的瞬时状态：pageSig 判断是否整页切换；lbOpen 控制灯箱退场 */
  let pageSig = null;
  let enterNext = true;
  let seeded = false; /* 首次进入用 replaceState，之后导航用 pushState（保后退键） */
  let lastHashShown = '';

  /* 平滑滚动是 JS 参数，媒体查询管不到：统一走这里，reduced-motion 下直接跳 */
  const RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const scrollMode = function () { return (RM && RM.matches) ? 'auto' : 'smooth'; };

  const PALETTE = {
    u1: ['#7aa2ff', '#a46bff'], u2: ['#ffb36b', '#ff6b9d'], u3: ['#5ad1c8', '#3f8bff'],
    u4: ['#c084fc', '#f472b6'], u5: ['#fde68a', '#f59e0b'], u6: ['#94a3b8', '#334155'],
    u7: ['#86efac', '#22c55e'], u8: ['#93c5fd', '#6366f1']
  };

  /* ---------- 头像：画布生成，免外部资源 ----------
     三种来源共用一个出口 avatarURL()：
       1) 内置：PALETTE 双色渐变 + emoji，和以前一样；
       2) 自选：编辑资料里挑的渐变 + emoji；
       3) 上传：直接返回图片 dataURL，不再过画布。
     缓存键是「渐变 + emoji」而不是 uid —— 换了头像，同一个 uid 也不会拿到旧图。 */
  const AV = {};
  function gradPair(str, fb) {
    const m = String(str || '').match(/#[0-9a-fA-F]{3,8}/g);
    if (m && m.length >= 2) return [m[0], m[1]];
    if (m && m.length === 1) return [m[0], m[0]];
    return fb;
  }
  function avatarURL(ava, fbEmoji, fbGrad) {
    const a = ava || {};
    if (a.img) return a.img;
    const pair = gradPair(a.grad, fbGrad || ['#9db8d2', '#6b8fb5']);
    const emoji = a.emoji || fbEmoji || '🙂';
    const key = 'k|' + pair[0] + '|' + pair[1] + '|' + emoji;
    if (AV[key]) return AV[key];
    const c = document.createElement('canvas');
    c.width = c.height = 132;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(8, 8, 124, 124);
    gr.addColorStop(0, pair[0]); gr.addColorStop(1, pair[1]);
    g.fillStyle = gr;
    g.beginPath(); g.arc(66, 66, 66, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.22; g.fillStyle = '#fff';
    g.beginPath(); g.arc(48, 40, 40, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    g.font = '62px "Segoe UI Emoji","Apple Color Emoji",system-ui';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(emoji, 66, 72);
    const url = c.toDataURL('image/png');
    AV[key] = url; return url;
  }
  /* 每个账号各有自己的头像：改过就用账号里的，没改过走 data.js 的 emoji + 渐变 */
  function avaOf(uid) {
    const k = uid || S.account;
    const a = S.accounts[k];
    return (a && a.avatar) ? a.avatar : ((users[k] && users[k].ava) || null);
  }
  function avURL(uid) {
    const u = users[uid] || {};
    return avatarURL(avaOf(uid), u.emoji, PALETTE[uid] || ['#9db8d2', '#6b8fb5']);
  }
  function av(uid, size, cls) {
    return '<img class="av ' + (cls || '') + '" src="' + avURL(uid) + '" width="' + size + '" height="' + size +
      '" style="width:' + size + 'px;height:' + size + 'px" alt="' + esc(users[uid] ? users[uid].name : '') + '">';
  }
  /* ---------- v15 · 多账号 ----------
     S.account 是当前账号；每个账号有自己的 profile / avatar / cover。
     全站所有「我」都从这里取，不再把 u1 写死在代码里。 */
  function ME() { return S.account; }
  function acct(uid) {
    const k = uid || S.account;
    if (!S.accounts[k]) S.accounts[k] = { profile: null, avatar: null, cover: '' };
    return S.accounts[k];
  }
  function meAva() { return acct(ME()).avatar; }
  function meCover() { return acct(ME()).cover; }
  /* 账号 ↔ 登录内核的桥。
     js/auth.js 管「谁能登录、登录后能不能换号、手机号认证过没过」；
     这一个函数把它翻译成页面要的东西，页面不自己判断身份。
     内核没加载（比如老缓存只引了 app.js）时退化成「已登录 + 已认证」的演示态，
     不让整站因为少一个脚本白屏。 */
  function authState() {
    if (window.AUTH && window.AUTH.state) {
      try { return window.AUTH.state(); } catch (err) {}
    }
    return { mode: 'authed', uid: S.account, email: '', name: profileOf().nick, sid: '', at: 0, ua: '', phoneOk: true, phone: '' };
  }
  function isGuest() { return authState().mode !== 'authed'; }
  function isLocked() { return !isGuest() && !authState().phoneOk; }
  /* 登录 / 认证通过之后，把「当前账号」切到内核认的那个人。
     演示账号（u1..u8）走 data.js 的资料；第三方账号没有底稿，用内核给的名字补一条。 */
  function adoptAccount(uid, name) {
    if (!uid) return;
    if (!users[uid]) {
      users[uid] = Object.assign({}, users.u1, {
        name: name || '新用户', emoji: '🫧', level: 1, badge: '', sig: '刚刚加入鲸域',
        city: '', fans: 0, follows: 0, visits: 0
      });
    }
    S.account = uid; S.spaceUser = uid; S.draft = null; S.fileErr = '';
  }
  /* users 表只存城市没有省；从省市表反查，保证每个人的资料卡一进来就带地区 */
  function provOfCity(city) {
    const pv = profileOptions.provinces, keys = Object.keys(pv);
    for (let i = 0; i < keys.length; i++) if (pv[keys[i]].indexOf(city) >= 0) return keys[i];
    return keys[0] || '';
  }
  function badgeCls(b) { return b === '版主' ? 'mod' : b === '内测组' ? 'beta' : ''; }
  function userTags(u) {
    let h = '<span class="lv">Lv.' + u.level + '</span>';
    if (u.badge) h += '<span class="tag-badge ' + badgeCls(u.badge) + '">' + u.badge + '</span>';
    return h;
  }

  /* ---------- toast ----------
     live region 必须在首次播报之前就存在于 DOM 里：
     懒建的话第一条消息是「创建节点 + 同时写入文本」，屏读多半会漏掉。 */
  const toastWrap = document.createElement('div');
  toastWrap.className = 'toast-wrap';
  toastWrap.setAttribute('aria-live', 'polite');
  toastWrap.setAttribute('role', 'status');
  toastWrap.setAttribute('aria-atomic', 'false');
  document.body.appendChild(toastWrap);
  function toast(msg, icon) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<span>' + (icon || '✅') + '</span><span>' + esc(msg) + '</span>';
    toastWrap.appendChild(t);
    /* 下一帧再上 .in，让 transition 从初始态起步（可重复触发也不会重播关键帧） */
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('in')));
    setTimeout(() => {
      t.classList.add('out');
      t.classList.remove('in');
      setTimeout(() => t.remove(), 260);
    }, 1900);
  }

  /* 复制：只有真的写进剪贴板才播「已复制」，被拒就播失败。
     旧写法 try{writeText()}catch{} 后无条件 toast —— Promise 不会被 try 捕获，
     于是「没复制成功」也会报成功。 */
  function copyText(v, okMsg, failMsg) {
    const fallback = function () {
      try {
        const ta = document.createElement('textarea');
        ta.value = v; ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        toast(ok ? okMsg : failMsg, ok ? '📋' : '⚠️');
      } catch (err) { toast(failMsg, '⚠️'); }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(v).then(function () { toast(okMsg, '📋'); }, fallback);
      } else { fallback(); }
    } catch (err) { fallback(); }
  }

  /* ---------- 顶栏 ---------- */
  /* P1 · 智能搜索：用户/插件/话题按命中优先级路由 */
  function smartSearch(q0) {
    const q = (q0 || '').trim().toLowerCase();
    if (!q) { toast('输入关键词再搜索', '🔍'); return; }
    for (const id in users) {
      if ((users[id].name || '').toLowerCase().indexOf(q) >= 0) {
        S.spaceUser = id; S.route = 'space'; S.tab = '日志'; S.pop = null; S.q = ''; render(false); return;
      }
    }
    const plugHit = plugins.some(function (p) {
      return ((p.name || '') + ' ' + (p.desc || '')).toLowerCase().indexOf(q) >= 0;
    });
    if (plugHit) { S.route = 'market'; S.q = q; S.cat = '全部'; S.sort = '热度'; S.pop = null; render(false); return; }
    const threadHit = S.newThreads.concat(threads).some(function (t) {
      return ((t.title || '') + ' ' + (t.excerpt || '')).toLowerCase().indexOf(q) >= 0;
    });
    if (threadHit) { S.route = 'forum'; S.q = q; S.ftag = '全部'; S.pop = null; render(false); return; }
    S.route = 'forum'; S.q = q; S.ftag = '全部'; S.pop = null; render(false);
  }

  function navHTML() {
    const SUB = ['entry', 'claim', 'upload'];
    const links = [['feed', '首页'], ['market', '插件库'], ['forum', '社群'], ['space', '我的空间']];
    return '<div class="nav"><div class="nav-in">' +
      '<div class="logo" data-act="go" data-route="feed"><span class="mark">' + tail(22, 5.2) + '</span>' + BR.name + '<small>' + BR.en + '</small></div>' +
      '<nav class="nav-links" aria-label="主导航">' + links.map(function (l) {
        const on = S.route === l[0] || (l[0] === 'market' && SUB.indexOf(S.route) >= 0);
        return '<a class="' + (on ? 'on' : '') + '" data-act="go" data-route="' + l[0] + '"' +
          (on ? ' aria-current="page"' : '') + '>' + l[1] + '</a>';
      }).join('') +
      '</nav>' +
      '<div class="nav-right">' +
        '<div class="nav-search"><span style="font-size:12px;opacity:.85">🔍</span>' +
          '<input id="navq" type="search" aria-label="搜索插件、帖子或用户" placeholder="搜插件 / 帖子 / 用户" value="' + esc(S.q) + '"></div>' +
        '<button class="icon-btn" data-act="theme" type="button" title="切换白天 / 夜间" aria-label="切换白天 / 夜间模式">' + (document.documentElement.dataset.theme === 'night' ? '🌙' : '☀️') + '</button>' +
        navUserHTML() +
      '</div></div>' +
      (S.pop === 'notice' ? noticePop() : '') + (S.pop === 'me' ? mePop() : '') + '</div>';
  }

  /* 顶栏右上角两项，按 B 站的做法排：左边是「图标 + 文字」的胶囊（消息），
     右边是头像 + 昵称的账号入口。未登录时右边换成「登录」按钮 —— 站内所有需要身份的
     动作都从这里开始，而不是先让你点开一个空头像。 */
  function navUserHTML() {
    const st = authState();
    const bell = '<button class="nav-act" data-act="pop" data-pop="notice" type="button"' +
      ' title="消息" aria-label="消息' + (S.noticesRead ? '' : '，3 条未读') + '" aria-expanded="' + (S.pop === 'notice' ? 'true' : 'false') + '">' +
      '<span class="na-ic" aria-hidden="true">🔔</span><span class="na-tx">消息</span>' +
      (S.noticesRead ? '' : '<i class="dot-badge" aria-hidden="true">3</i>') + '</button>';
    if (st.mode !== 'authed') {
      return bell + '<button class="nav-act nav-act-key" type="button" data-act="go" data-route="login" title="登录 / 注册">' +
        '<span class="na-ic" aria-hidden="true">→</span><span class="na-tx">登录</span></button>';
    }
    const locked = !st.phoneOk;
    return bell +
      '<div class="avatar-btn' + (locked ? ' locked' : '') + '" data-act="pop" data-pop="me" role="button" tabindex="0"' +
      ' aria-label="我的账号菜单' + (locked ? '，手机号未认证' : '') + '" aria-expanded="' + (S.pop === 'me' ? 'true' : 'false') + '">' +
      av(ME(), 30) + '<span>' + esc(profileOf().nick) + '</span>' +
      (locked ? '<i class="na-lock" aria-hidden="true">🔒</i>' : '') + '</div>';
  }

  function noticePop() {
    return '<div class="pop" style="right:96px;top:52px">' +
      '<div class="pop-hd"><span>消息中心</span><button class="mini" type="button" data-act="readall" aria-label="把全部消息标记为已读">全部已读</button></div>' +
      notices.map(n => '<div class="notice"' + (n.to ? ' data-act="go" data-route="' + n.to.route + '"' : '') + '><div class="ni ' + n.tone + '">' + n.icon + '</div>' +
        '<div style="flex:1;min-width:0"><b class="' + (n.unread && !S.noticesRead ? 'unread' : '') + '">' + esc(n.title) + '</b>' +
        '<p>' + esc(n.desc) + '</p></div><time>' + esc(n.time) + '</time></div>').join('') + '</div>';
  }

  /* 账号弹层：v15 的「八格切号」撤掉了 —— 现在登录态由 AUTH 会话决定，
     同一时间只能有一个账户，换号必须先退出。这里只留「我是谁 / 去哪 / 怎么退出」。 */
  function mePop() {
    const pf = profileOf(ME());
    const u = users[ME()] || users.u1;
    const st = authState();
    const head = '<div class="pop-me-hd">' + av(ME(), 42) +
      '<div style="min-width:0"><b style="font-size:13.5px">' + esc(pf.nick) + '</b>' +
      '<div style="font-size:11.5px;color:var(--txt-3)">Lv.' + u.level + ' · ' + esc(pf.job) + ' · ' + esc(pf.province + ' ' + pf.city) + '</div>' +
      (st.mode === 'authed' && st.email ? '<div style="font-size:11px;color:var(--txt-3);margin-top:2px;overflow:hidden;text-overflow:ellipsis">' + esc(st.email) + '</div>' : '') +
      '</div></div>';
    /* 手机号没认证时，把这一步顶到弹层最上面，而不是藏在设置里 */
    const need = (st.mode === 'authed' && !st.phoneOk)
      ? '<div class="pop-note"><span aria-hidden="true">📱</span><div><b>还差手机号认证</b><p>认证后才能发帖、评论和发布插件。</p></div>' +
        '<button type="button" class="btn sm blue" data-act="go" data-route="verify">去认证</button></div>'
      : '';
    return '<div class="pop" style="right:0;top:52px;width:272px">' + head + need +
      [['我的空间', 'space'], ['我的插件', 'publish'], ['我的收藏', 'forum'], ['设置', 'settings']].map(x =>
        '<div class="notice" data-act="go" data-route="' + x[1] + '"><div class="ni blue">›</div><div style="flex:1"><b>' + x[0] + '</b></div></div>').join('') +
      '<div class="notice" data-act="theme"><div class="ni amber">◐</div><div style="flex:1"><b>切换夜间模式</b></div></div>' +
      '<div class="notice" data-act="logout"><div class="ni rose">⏻</div><div style="flex:1"><b>退出登录</b>' +
      '<p style="margin:2px 0 0;font-size:11px;color:var(--txt-3);font-weight:500">退出后才能换个账号登录</p></div></div></div>';
  }

  /* ---------- 首页 ---------- */
  function heroHTML() {
    const pf = profileOf();
    return '<div class="cover">' +
      '<span class="cloud cl1"></span><span class="cloud cl2"></span><span class="cloud cl3"></span>' +
      '<span class="tail-wm">' + tail('100%', 2.3) + '</span>' +
      '<div class="cover-txt"><h1>' + BR.full + '</h1><p>' + BR.slogan + ' · 今日 386 条更新</p>' +
      '<div class="cover-sub">零依赖演示 · 350 项自动化测试通过 · 桌面 / 平板 / 移动三端一致</div></div>' +
      '<div class="me"><div class="nm">' + esc(pf.nick) + '<small>' + esc(pf.sig) + '</small></div>' + av(ME(), 78) + '</div></div>';
  }

  /* 配图预览条：待发布的图先在这里排队，publish 时才随正文一起交给后端。
     dataURL 只活在内存里（S.pendingImages），刷新即失效 —— 否则几百 KB 会撑爆 localStorage。 */
  function imgPrevHTML(id, list) {
    if (!list || !list.length) return '';
    return '<div class="imgprev" id="' + id + '">' +
      list.map(function (im, i) {
        return '<figure class="ipv"><img src="' + im.src + '" alt="待发布图片 ' + (i + 1) + '" loading="lazy" decoding="async">' +
          '<button class="ipv-x" type="button" data-act="imgdel" data-i="' + i + '" aria-label="移除第 ' + (i + 1) + ' 张图片">✕</button></figure>';
      }).join('') +
      '<span class="ipv-n">' + list.length + ' / ' + IMG_MAX + '</span></div>';
  }

  /* 关联插件面板：只在点开时渲染，选中后收起，正文旁边留一个可撤销的 chip */
  function pluginPickerHTML(sel) {
    return '<div class="plug-pick" role="group" aria-label="选择要关联的插件">' +
      plugins.slice(0, 6).map(function (p) {
        const on = sel && sel.name === p.name;
        return '<button type="button" class="pp-item' + (on ? ' on' : '') + '" data-act="pluginset" data-name="' + esc(p.name) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
          '<span class="pp-ic">' + p.icon + '</span><span class="pp-tx"><b>' + esc(p.name) + '</b><em>v' + esc(p.ver) + ' · ' + num(p.installs) + ' 次安装</em></span></button>';
      }).join('') + '</div>';
  }

  function composerHTML() {
    const pimg = S.pendingImages || [];
    const sel = S.pendingPlugin ? (plugins.filter(function (p) { return p.name === S.pendingPlugin; })[0] || null) : null;
    return '<div class="card"><div class="tabs">' +
      [['全部', '全部日志'], ['关注', '我关注的'], ['插件', '插件更新'], ['问答', '求助问答']].map(t =>
        '<button class="tab ' + (S.tab === t[0] ? 'on' : '') + '" data-act="feedtab" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') +
      '<span class="spacer"></span><span class="sort">按时间</span></div>' +
      '<div class="composer">' + av(ME(), 44) + '<div class="box">' +
      '<textarea id="composer" placeholder="写下这次更新了什么：版本、改动、踩到的坑……（可以直接粘贴或拖入图片）"></textarea>' +
      imgPrevHTML('imgprev', pimg) +
      '<div class="composer-tools"><div class="tool-row">' +
      '<button class="tool" type="button" data-act="imgpick" title="选择本地图片，也可以直接把图片粘贴或拖进来">🖼️ 图片' +
      (pimg.length ? '<i class="tool-n">' + pimg.length + '</i>' : '') + '</button>' +
      '<button class="tool' + (sel ? ' on' : '') + '" type="button" data-act="pluginpick" aria-expanded="' + (S.pickerOpen ? 'true' : 'false') + '">🧩 关联插件</button>' +
      '<button class="tool" type="button" data-act="topictag" title="插入一个话题标记">#️⃣ 话题</button>' +
      '<button class="tool" type="button" data-act="attach">📎 附件</button>' +
      '<input type="file" id="cmt-file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden>' +
      '</div><div style="display:flex;align-items:center;gap:10px">' +
      '<span style="font-size:11.5px;color:var(--txt-3)" id="ccount">0 / 500</span>' +
      '<button class="btn" data-act="publish">发表</button></div></div>' +
      (sel ? '<div class="plug-picked">已关联 <b>' + esc(sel.name) + '</b><em>v' + esc(sel.ver) + '</em>' +
        '<button type="button" data-act="pluginclear" aria-label="取消关联插件">✕</button></div>' : '') +
      (S.pickerOpen ? pluginPickerHTML(sel) : '') +
      '</div></div></div>';
  }

  /* ---------- 配图：读取 / 校验 / 入队 ---------- */
  /* 文件 -> dataURL。用 FileReader 而不是 canvas 转码：GIF 才会动，
     canvas 一过手就只剩第一帧。真正压缩交给 API.uploadImage（上传前才压）。 */
  function readImage(file) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () {
        const img = new Image();
        img.onload = function () {
          resolve({ src: fr.result, file: file, w: img.naturalWidth, h: img.naturalHeight, type: file.type });
        };
        img.onerror = function () { resolve({ src: fr.result, file: file, w: 0, h: 0, type: file.type }); };
        img.src = fr.result;
      };
      fr.onerror = function () { reject(new Error('读取失败')); };
      fr.readAsDataURL(file);
    });
  }

  /* 统一的入队口：拖拽、粘贴、选择文件三条路都走这里，规则只有一份。
     queue 用 S 上的键名（日志是 pendingImages，社群发帖是 ntImages）。 */
  function addImages(files, queueKey) {
    const list = Array.prototype.slice.call(files || []);
    const box = S[queueKey] || (S[queueKey] = []);
    if (!list.length) return Promise.resolve(0);
    const room = IMG_MAX - box.length;
    if (room <= 0) { toast('一条最多 ' + IMG_MAX + ' 张图，先删一张再加', '🖼️'); return Promise.resolve(0); }
    const picked = [];
    let bad = '';
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (IMG_TYPES.indexOf(f.type) < 0) { bad = '只支持 PNG / JPG / GIF / WebP'; continue; }
      if (f.size > IMG_MAX_BYTES) { bad = '单张图片不能超过 5 MB'; continue; }
      if (picked.length >= room) { bad = '一条最多 ' + IMG_MAX + ' 张图'; break; }
      picked.push(f);
    }
    if (bad) toast(bad, '⚠️');
    if (!picked.length) return Promise.resolve(0);
    return Promise.all(picked.map(readImage)).then(function (imgs) {
      imgs.forEach(function (im) { if (box.length < IMG_MAX) box.push(im); });
      return imgs.length;
    });
  }

  /* 入队之后只重画预览条和工具按钮上的计数，不整页重绘 —— 否则草稿文字会丢焦点 */
  function repaintImgs(queueKey, prevId) {
    const box = S[queueKey] || [];
    const old = qs('#' + prevId);
    if (old) {
      const wrap = document.createElement('div');
      wrap.innerHTML = imgPrevHTML(prevId, box);
      const fresh = wrap.firstChild;
      if (fresh) old.parentNode.replaceChild(fresh, old); else old.parentNode.removeChild(old);
    } else if (box.length) {
      const ta = qs('#composer') || qs('#nt-body');
      if (ta && ta.parentNode) ta.insertAdjacentHTML('afterend', imgPrevHTML(prevId, box));
    }
    const btn = qs('[data-act="imgpick"]');
    if (btn && queueKey === 'pendingImages') {
      const n = box.length;
      btn.innerHTML = '🖼️ 图片' + (n ? '<i class="tool-n">' + n + '</i>' : '');
    }
  }

  function postHTML(p) {
    const u = users[p.user] || users.u1;
    const liked = S.liked.has(p.id);
    const mine = S.comments[p.id] || [];
    const all = p.comments.concat(mine);
    const showAll = S.expand.has(p.id);
    const shown = showAll ? all : all.slice(0, 2);
    const imgs = p.images || [];
    const n = Math.min(imgs.length, 4);
    let imgHTML = '';
    if (n) {
      imgHTML = '<div class="imgs n' + n + '">' + imgs.slice(0, 4).map((im, idx) => {
        /* 真图（后端返回带 src）：直接铺满格子，loading=lazy 省流量；
           演示图（data.js 的 kind:shot/art）：保持原来的渐变色块示意。 */
        if (im.src) {
          return '<div class="ph real" data-act="lb" data-pid="' + p.id + '" data-idx="' + idx + '" ' +
            'style="background:' + (im.grad || '#e9eef5') + '">' +
            '<img src="' + esc(im.src) + '" alt="' + esc(p.text.slice(0, 30)) + '" loading="lazy" decoding="async">' +
            '</div>';
        }
        return '<div class="ph ' + (im.kind === 'art' ? 'art' : '') + '" style="background:' + im.grad + '" ' +
          'data-act="lb" data-pid="' + p.id + '" data-idx="' + idx + '">' +
          (im.kind === 'shot' ? '<div class="fakebar"><i></i><i></i><i></i><u></u></div><span class="glyph">🖥️</span>' : '') +
          '<span class="cap">' + esc(im.title || im.label || '') + (im.note ? '<small>' + esc(im.note) + '</small>' : '') + '</span></div>';
      }).join('') + '</div>';
    }
    /* 日志里挂的插件直接链到条目页：社群与条目库不再是两个孤岛 */
    const pv = p.plugin ? pluginByName(p.plugin) : null;
    const chip = p.plugin ? '<div class="plugin-chip"' + (pv ? ' data-act="pl" data-id="' + pv.id + '" style="cursor:pointer"' : '') + '>🧩 <b>' + esc(p.plugin) + '</b><em>' + esc(p.pluginVer) + '</em>' +
      '<span style="color:var(--link);margin-left:4px">' + (pv ? '查看条目 ›' : '查看插件 ›') + '</span></div>' : '';
    const cmts = shown.map(c => {
      const cu = users[c.user] || users.u1;
      return '<div class="cmt">' + av(c.user, 24) +
        '<div class="ctx"><span class="cnm" data-act="user" data-uid="' + c.user + '">' + esc(cu.name) + '</span>' +
        '：' + esc(c.text) + '</div><span class="ct">' + esc(c.time) + '</span>' +
        '<button class="clike" type="button" data-act="clike" data-cid="' + p.id + '|' + esc(c.user) + '|' + esc(c.text.slice(0, 8)) + '" aria-label="赞这条评论" aria-pressed="false">♡</button></div>';
    }).join('');
    const more = all.length > 2 ? '<button class="cmt-more" data-act="expand" data-pid="' + p.id + '">' +
      (showAll ? '收起评论' : '查看全部 ' + all.length + ' 条评论') + '</button>' : '';

    return '<article class="post" data-post="' + p.id + '">' +
      '<div class="post-hd"><div class="av-wrap">' + av(p.user, 44) + '</div>' +
      '<div class="poster"><div class="line1"><span class="nm" data-act="user" data-uid="' + p.user + '">' + esc(u.name) + '</span>' +
      userTags(u) + (p.pinned ? '<span class="pin">置顶</span>' : '') + '</div>' +
      '<div class="meta"><span>' + esc(p.time) + '</span><span>·</span><span>' + esc(u.city) + '</span>' +
      (p.plugin ? '<span>·</span><span>更新了 ' + esc(p.plugin) + '</span>' : '') + '</div></div>' +
      '<button class="post-more" type="button" data-act="more" data-pid="' + p.id + '" title="更多操作" aria-label="更多操作">⋯</button></div>' +
      '<div class="post-body">' + esc(p.text) + '</div>' + chip + imgHTML +
      '<div class="post-actions">' +
      '<button class="act ' + (liked ? 'liked' : '') + '" type="button" data-act="like" data-pid="' + p.id + '" aria-pressed="' + (liked ? 'true' : 'false') + '" aria-label="' + (liked ? '取消赞' : '赞这条日志') + '">' +
      '<span class="ic" aria-hidden="true">' + (liked ? '❤️' : '👍') + '</span><span class="num">' + fmt(p.likes + (liked && p.id !== 's2' ? 1 : 0)) + '</span></button>' +
      '<button class="act" type="button" data-act="focuscmt" data-pid="' + p.id + '" aria-label="写评论"><span class="ic" aria-hidden="true">💬</span><span class="num">' + all.length + '</span></button>' +
      '<button class="act" type="button" data-act="share" data-pid="' + p.id + '" aria-label="分享这条日志"><span class="ic" aria-hidden="true">↗</span><span class="num">' + fmt(p.shares) + '</span></button>' +
      '<button class="act" type="button" data-act="fav" data-pid="' + p.id + '" aria-pressed="' + (S.fav.has(p.id) ? 'true' : 'false') + '" aria-label="收藏这条日志"><span class="ic" aria-hidden="true">⭐</span><span>收藏</span></button>' +
      '</div>' +
      (all.length ? '<div class="comments">' + cmts + more + '</div>' : '') +
      '<div class="cbox" style="margin-top:9px;display:flex;gap:8px;align-items:center">' +
      '<input class="cin" data-pid="' + p.id + '" placeholder="写评论…" aria-label="写评论" style="flex:1;border:1px solid var(--line);background:var(--card-2);border-radius:16px;padding:6px 12px;font-size:12.5px;color:var(--txt)">' +
      '<button class="btn sm blue" data-act="sendcmt" data-pid="' + p.id + '">发送</button></div>' +
      '</article>';
  }

  /* ---------- 深海装饰层：气泡 / 暗流 / 光斑 / 海洋生物剪影（纯 CSS 动画，装饰性，aria-hidden） ---------- */
  function seaHTML() {
    const bubs = [8, 21, 34, 48, 61, 74, 88].map(function (left, i) {
      const size = 5 + (i % 3) * 4;
      const dur = 15 + (i % 4) * 5;
      return '<i class="bub" style="left:' + left + '%;width:' + size + 'px;height:' + size + 'px;' +
        'animation-duration:' + dur + 's;animation-delay:-' + (i * 3.5).toFixed(1) + 's"></i>';
    }).join('');
    return '<div class="sea-life" aria-hidden="true">' +
      '<span class="sl-glow"></span>' +
      '<span class="sl-ray r1"></span><span class="sl-ray r2"></span><span class="sl-ray r3"></span>' +
      '<span class="sl-flow f1"></span><span class="sl-flow f2"></span>' +
      bubs +
      '<span class="swim s2" style="top:22%;left:0">' + tail(52, 6.4) + '</span>' +
      '<span class="swim s3" style="top:63%;left:0">' + tail(34, 7.2) + '</span>' +
      '<span class="swim" style="top:44%;left:0;animation-duration:64s;animation-delay:-16s">' + tail(24, 8) + '</span>' +
      '</div>';
  }

  /* ---------- 左侧分类栏（仿微博网页左栏） ----------
     每个路由只留跟自己相关的那一组，其余不渲染：
       首页          → 社群分类（单维度：全部 + 六分类，各带帖子数，点了带分类进社群）
       插件库子树    → 插件分类（条目列表就在右边；详情 / 认领 / 上传同属这块）
       社群子树      → 社群标签（帖子里按标签筛才有意义）
       空间子树      → 我的（我的空间 / 编辑资料）
       发布插件      → 完整左栏（这一页本身不属于任何一组，靠快捷入口定位）

     首页为什么不再是「快捷入口 + 社群版块」：那两张卡都是纯导航，和顶栏、中栏
     完全重复，一点信息增量都没有（社群版块那四条还都跳同一批页面）。社群分类是
     日志流里唯一没被表达过的维度（分类 × 帖子数），彩色图标 + 计数就是 Linux.do
     左栏那种单维度分类表：一条维度、可就地筛、每行都带自己的量。
  */
  function railHTML() {
    const mk = S.route === 'market' || S.route === 'entry' || S.route === 'claim' || S.route === 'upload';
    const fo = S.route === 'forum';
    const ft = fo || S.route === 'thread';
    const sp = S.route === 'space' || S.route === 'profile';
    const fd = S.route === 'feed';

    /* 插件分类只有一份真源（data.js 的 pluginCats），这里只补一个「全部」入口；
       以前这里另写一份硬编码数组，改了 market 筛选就漏掉左栏。 */
    const CATS = ['全部'].concat(pluginCats);
    const TAGS = ['全部', '公告', '经验', '求助', '讨论', '教程', '周报'];

    /* total 只影响「全部」后面那个数字：插件分类卡是条目数，社群标签卡是帖子数 */
    const dots = (arr, cur, act, key, total) => arr.map(function (t) {
      return '<div class="rail-item rail-dot ' + (cur === t ? 'on' : '') + '" data-act="' + act + '" data-' + key + '="' + esc(t) + '">' +
        '<span class="tx">' + esc(t) + '</span>' + (t === '全部' ? '<span class="rail-n">' + (total == null ? plugins.length : total) + '</span>' : '') + '</div>';
    }).join('');

    const catCard = '<div class="rail-card"><div class="rail-hd">插件分类</div>' +
      dots(CATS, mk ? S.cat : '', 'railcat', 'cat') + '</div>';
    /* 帖子详情页也高亮标签：取这一帖自己的 tag，左栏能反映「当前在哪一类里」 */
    const curTag = fo ? S.ftag : (S.route === 'thread'
      ? ((threads.filter(function (x) { return x.id === S.threadId; })[0] || {}).tag || S.ftag)
      : '');
    const tagCard = '<div class="rail-card"><div class="rail-hd">社群标签</div>' +
      dots(TAGS, curTag, 'ftag', 'tag', threadCountOf('全部')) + '</div>';
    const myCard = '<div class="rail-card"><div class="rail-hd">我的</div>' +
      '<div class="rail-item rail-dot ' + ((S.route === 'space' || S.route === 'profile') ? 'on' : '') + '" data-act="go" data-route="space"><span class="tx">我的空间</span></div>' +
      '<div class="rail-item rail-dot ' + (fd && S.tab === '全部' ? 'on' : '') + '" data-act="railtab" data-tab="全部"><span class="tx">全部日志</span></div>' +
      '<div class="rail-item rail-dot ' + (fd && S.tab === '关注' ? 'on' : '') + '" data-act="railtab" data-tab="关注"><span class="tx">我关注的</span></div>' +
      '<div class="rail-item rail-dot ' + (fd && S.tab === '插件' ? 'on' : '') + '" data-act="railtab" data-tab="插件"><span class="tx">插件更新</span></div>' +
      '<div class="rail-item rail-dot ' + (fd && S.tab === '问答' ? 'on' : '') + '" data-act="railtab" data-tab="问答"><span class="tx">求助问答</span></div>' +
      '</div>';
    const quickCard = '<div class="rail-card">' +
      '<div class="rail-item ' + (mk ? 'on' : '') + '" data-act="go" data-route="market">' +
        '<span class="ic" style="background:linear-gradient(135deg,#7fc9ff,#2f86d8)">🛒</span>' +
        '<span class="tx">插件条目库</span><span class="rail-n">' + plugins.length + '</span></div>' +
      '<div class="rail-item ' + (mk && S.sort === '安装' ? 'on' : '') + '" data-act="railsort" data-sort="安装">' +
        '<span class="ic" style="background:linear-gradient(135deg,#ffc46b,#ee7f1a)">🏆</span>' +
        '<span class="tx">安装榜</span><span class="rail-n">TOP 5</span></div>' +
      '<div class="rail-item ' + (ft ? 'on' : '') + '" data-act="go" data-route="forum">' +
        '<span class="ic" style="background:linear-gradient(135deg,#ffa2a6,#e04a68)">🔥</span>' +
        '<span class="tx">社群热帖</span><span class="rail-n">' + threadCountOf('全部') + '</span></div>' +
      '<div class="rail-item ' + (S.route === 'publish' ? 'on' : '') + '" data-act="go" data-route="publish">' +
        '<span class="ic" style="background:linear-gradient(135deg,#6ee7b7,#0f9b6c)">🚀</span>' +
        '<span class="tx">发布插件</span></div>' +
      '</div>';
    const boardCard = '<div class="rail-card"><div class="rail-hd">社群版块</div>' +
      boards.map(b => '<div class="rail-item rail-dot" data-act="board" data-b="' + esc(b.name) + '">' +
        '<span class="ic" style="background:linear-gradient(135deg,#c9b8ff,#7c6cf0)">' + b.icon + '</span>' +
        '<span class="tx">' + esc(b.name) + '</span></div>').join('') + '</div>';

    /* 首页左栏：单维度社群分类表（Linux.do 那种）——全部 + 六个分类，每行都带
       自己的帖子数。点一条不是「就地筛日志」，而是带着这个分类跳进社群，因为
       分类本来就是社群的维度；数量与社群页 fcat-bar 同源（都数 threads），点进
       去看到的数字与左栏一致。 */
    const feedCats = (function () {
      const G = {
        notice: ['#7fc9ff', '#2f86d8'],
        guide: ['#ffd27f', '#ee9b1a'],
        help: ['#ffa2a6', '#e04a68'],
        dev: ['#c9b8ff', '#7c6cf0'],
        tool: ['#8fe3c0', '#0f9b6c'],
        chat: ['#ffc9e0', '#e0538c']
      };
      const rows = [{ id: '全部', name: '全部', icon: '📋', g: ['#b9cde0', '#7f93a6'] }]
        .concat(D.categories.map(function (c) {
          return { id: c.id, name: c.name, icon: c.icon, g: G[c.id] || ['#b9cde0', '#7f93a6'] };
        }));
      return '<div class="rail-card"><div class="rail-hd">社群分类</div>' + rows.map(function (r) {
        const n = threadCountOf(r.id);
        return '<div class="rail-item" data-act="fcat" data-cat="' + esc(r.id) + '">' +
          '<span class="ic" style="background:linear-gradient(135deg,' + r.g[0] + ',' + r.g[1] + ')">' + r.icon + '</span>' +
          '<span class="tx">' + esc(r.name) + '</span><span class="rail-n">' + n + '</span></div>';
      }).join('') + '</div>';
    })();

    let cards;
    if (mk) cards = catCard;
    else if (ft) cards = tagCard;
    else if (sp) cards = myCard;
    else if (fd) cards = feedCats;
    else cards = quickCard + myCard + catCard + tagCard + boardCard;

    return '<aside class="col-rail">' + cards + '</aside>';
  }

  function feedPage() {
    let list = posts.slice();
    if (S.published.length) list = S.published.concat(list);
    if (S.tab === '插件') list = list.filter(p => p.plugin);
    if (S.tab === '问答') list = list.filter(p => !p.plugin);
    if (S.tab === '关注') list = list.filter(p => ['u3', 'u5', 'u2'].indexOf(p.user) >= 0);
    return '<div class="wrap">' + railHTML() + '<div class="col-main">' + heroHTML() + composerHTML() +
      '<div class="card"><div class="card-hd"><span class="t">更新日志</span><span class="more" data-act="go" data-route="forum">去社群看看 ›</span></div>' +
      '<div class="feed">' + (list.length ? list.map(postHTML).join('') : '<div class="empty"><span class="big">🍃</span>这里还没有更新日志</div>') + '</div></div></div>' +
      feedSide() + '</div>';
  }

  function meCard() {
    const k = ME();
    const u = users[k] || users.u1;
    const pf = profileOf(k);
    const cover = meCover();
    return '<div class="side-card me-card"><div class="banner"' +
      (cover ? ' style="background:' + cover + '"' : '') + '></div><div class="body">' + av(k, 56) +
      '<div class="nm">' + esc(pf.nick) + ' <span class="lv">Lv.' + u.level + '</span></div>' +
      '<div class="sig">' + esc(pf.sig) + '</div>' +
      '<div class="me-stats"><div><b>' + num(u.fans) + '</b><span>粉丝</span></div><div><b>' + u.follows + '</b><span>关注</span></div><div><b>' + fmt(u.visits) + '</b><span>访客</span></div></div>' +
      '<div style="display:flex;gap:7px;margin-top:11px"><button class="btn sm blue" style="flex:1" data-act="go" data-route="space">我的空间</button>' +
      '<button class="btn sm ghost" style="flex:1" data-act="go" data-route="profile">编辑资料</button></div></div></div>';
  }

  function visitorCard() {
    return '<div class="side-card"><div class="side-hd"><span class="t">最近访客</span><a href="javascript:;">全部 128 ›</a></div>' +
      '<div class="side-bd"><div class="visitors">' + visitors.slice(0, 8).map(v =>
        '<div class="v" data-act="user" data-uid="' + v.user + '" title="' + esc(v.action) + '">' + av(v.user, 42) +
        '<span>' + esc(users[v.user].name) + '</span><span class="tt">' + esc(v.time) + '</span></div>').join('') +
      '</div></div></div>';
  }

  function hotCard() {
    return '<div class="side-card"><div class="side-hd"><span class="t">热门话题</span><a href="javascript:;" data-act="go" data-route="forum">更多 ›</a></div>' +
      '<div class="side-bd" style="padding:8px 10px"><div class="hot-list">' + hotTopics.map((h, i) =>
        '<div class="hot-item" data-act="tag" data-tag="' + esc(h.tag) + '"><span class="rk">' + (i + 1) + '</span>' +
        '<span class="hx"><b>#' + esc(h.tag) + '#</b><span>' + esc(h.count) + '</span></span>' +
        '<span class="tr">' + esc(h.trend) + '</span></div>').join('') + '</div></div></div>';
  }

  function pluginSide() {
    return '<div class="side-card"><div class="side-hd"><span class="t">插件推荐</span><a href="javascript:;" data-act="go" data-route="market">市场 ›</a></div>' +
      '<div class="side-plugins">' + plugins.slice(0, 4).map(p =>
        '<div class="sp-row" data-act="go" data-route="market"><div class="sp-ico" style="background:' + p.grad + '">' + p.icon + '</div>' +
        '<div class="sx"><b>' + esc(p.name) + '</b><span>v' + p.ver + ' · ' + fmt(p.installs) + ' 次安装</span></div>' +
        '<span class="st">★ ' + fmt(p.stars) + '</span></div>').join('') + '</div></div>';
  }

  /* v14 · 空间页的“插件推荐”：仿 Minecraft 模组页的 Main File / Recent Files 分组卡 ——
     标题行 + 灰色文件块（块内是一行粗体版本行 + 一行元信息 + 右对齐日期）。
     只用在 spaceSide，首页那张还是老的四行列表（信息密度更适合动态流）。 */
  function pfBlock(p, main) {
    const t = tierOf(p);
    const date = p.collected || '';
    const title = main
      ? 'v' + esc(p.ver) + ' · ' + TIER_SHORT[t] + ' · ' + fmt(p.installs) + ' 次安装'
      : esc(p.name) + ' · v' + esc(p.ver);
    const meta = main
      ? '<span class="pf-tag ' + t + '" aria-hidden="true">' + TIER_ICON[t] + '</span>' +
        '<span class="pf-chip">' + esc(p.license || '未声明') + '</span>' +
        '<span class="pf-chip">' + esc(p.cat) + '</span>'
      : '<span class="pf-tag ' + t + '" aria-hidden="true">' + TIER_ICON[t] + '</span>' +
        '<span class="pf-chip">' + TIER_SHORT[t] + '</span>' +
        '<span class="pf-chip">★ ' + fmt(p.stars) + '</span>';
    return '<div class="pf-blk" data-act="pl" data-id="' + p.id + '">' +
      '<div class="pf-t">' + title + '</div>' +
      '<div class="pf-meta">' + meta + (date ? '<span class="pf-date">' + esc(date) + '</span>' : '') + '</div>' +
      '</div>';
  }

  function pluginFilesCard() {
    const list = plugins.slice(0, 4);
    const main = list[0];
    /* 「最近更新」按收录日期倒序，否则 p3 的 10-12 会排在 p4 的 10-15 后面 */
    const rest = list.slice(1).sort(function (x, y) { return (y.collected || '').localeCompare(x.collected || ''); });
    return '<div class="side-card plugin-files"><div class="side-hd"><span class="t">插件推荐</span>' +
      '<a href="javascript:;" data-act="go" data-route="market">市场 ›</a></div>' +
      '<div class="pf-bd">' +
        '<div class="pf-hd">主推版本</div>' +
        '<div class="pf-sub">' + esc(main.name) + '</div>' +
        pfBlock(main, true) +
        '<div class="pf-sec"><span>最近更新</span><a href="javascript:;" data-act="go" data-route="market">全部 ›</a></div>' +
        '<div class="pf-sub">本站已收录 ' + plugins.length + ' 个条目</div>' +
        rest.map(function (p) { return pfBlock(p, false); }).join('') +
        '<button type="button" class="pf-more" data-act="go" data-route="market">查看全部条目 ›</button>' +
      '</div></div>';
  }

  function noticeSide() {
    return '<div class="side-card"><div class="side-hd"><span class="t">社群公告</span></div><div class="side-bd announce">' +
      '<p>📣 插件库新增 <b>依赖树</b> 视图，可查看插件间引用关系与冲突提示。</p>' +
      '<p>🛠️ 本周维护窗口：周六 02:00 – 04:00，期间发布功能暂停。</p>' +
      '<p>🎁 <span class="k">插件作者激励计划</span> 第 3 期开放报名，详见社群置顶。</p>' +
      '<p style="margin-bottom:0">📚 文档中心已更新至 <b>v2.1</b>，新增无头通道与作业队列章节。</p></div></div>';
  }

  function feedSide() {
    return '<aside class="col-side">' + meCard() + hotCard() + pluginSide() + noticeSide() + '</aside>';
  }

  /* ---------- 插件条目库 ---------- */
  function pluginCard(p) {
    const on = S.installed.has(p.id);
    const t = tierOf(p);
    const f = p.file;
    /* 档位行：把「有没有站内包、谁给的授权」写在卡片上，不用点进去才知道 */
    const meta = t === 'pack' && f
      ? '<b>' + esc(f.size) + '</b><span style="opacity:.6">·</span>' + esc(sourceNote(p))
      : t === 'link'
        ? '只放外链' + (p.license ? '' : '<span class="none"> · 未声明许可证</span>')
        : '未收录安装包' + (p.license ? '' : '<span class="none"> · 未声明许可证</span>');
    return '<div class="pl-card" style="--grad:' + p.grad + '" data-act="pl" data-id="' + p.id + '">' +
      (p.hot ? '<span class="hot-flag">HOT</span>' : '') +
      '<div class="pl-top"><div class="pl-ico" style="background:' + p.grad + '">' + p.icon + '</div>' +
      '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px"><span class="pl-name">' + esc(p.name) + '</span></div>' +
      '<div class="pl-auth">' + av(p.author, 16) + esc(users[p.author].name) + '<span class="pl-ver">v' + esc(p.ver) + '</span>' +
      '<span style="color:var(--txt-3)">· ' + esc(p.updated) + '</span></div></div></div>' +
      '<div class="pl-desc">' + esc(p.desc) + '</div>' +
      '<div class="pl-tags">' + p.tags.map(t => '<i>#' + esc(t) + '</i>').join('') + '</div>' +
      '<div class="pl-stats"><span>★ <b>' + fmt(p.stars) + '</b></span>' +
      '<span class="install">⤓ ' + num(p.installs) + '</span>' +
      '<button class="pl-install ' + (on ? 'done' : '') + '" data-act="install" data-pid="' + p.id + '">' + (on ? '已安装' : '安装') + '</button></div>' +
      '<div class="pl-tier">' + tierBadge(p) + '<span class="meta">' + meta + '</span></div></div>';
  }

  function marketList() {
    let list = plugins.slice();
    if (S.cat !== '全部') list = list.filter(p => p.cat === S.cat);
    if (S.tier !== '全部') list = list.filter(p => tierOf(p) === S.tier);
    if (S.q) {
      const q = S.q.toLowerCase();
      list = list.filter(p => (p.name + p.desc + p.tags.join('')).toLowerCase().indexOf(q) >= 0);
    }
    /* 「最新」按收录日期排，不再按 id 字典序 —— id 是 p1..p9，跟时间没关系 */
    if (S.sort === '最新') list.sort((a, b) => a.collected < b.collected ? 1 : -1);
    else if (S.sort === '安装') list.sort((a, b) => b.installs - a.installs);
    else if (S.sort === '体积') list.sort((a, b) => (b.file ? b.file.sizeB : -1) - (a.file ? a.file.sizeB : -1));
    else list.sort((a, b) => b.stars - a.stars);
    return list;
  }

  function marketPage() {
    const list = marketList();
    const cats = ['全部'].concat(pluginCats);
    const cnt = { pack: 0, link: 0, entry: 0 };
    plugins.forEach(function (p) { cnt[tierOf(p)]++; });
    const claimed = plugins.filter(function (p) { return p.claimed; }).length;
    const tiers = [['全部', '全部', plugins.length], ['pack', '本站包', cnt.pack],
      ['link', '外链', cnt.link], ['entry', '仅条目', cnt.entry]];
    return '<div class="wrap">' + railHTML() + '<div class="col-main">' +
      '<div class="card"><div class="card-hd"><h1 class="t">插件条目库</h1>' +
      '<span class="more">共 ' + plugins.length + ' 个条目 · 本站包 ' + cnt.pack + ' 个 · 已认领 ' + claimed + ' 个</span></div>' +
      '<div class="market-toolbar"><div class="chips">' + cats.map(c =>
        '<button class="chip ' + (S.cat === c ? 'on' : '') + '" data-act="cat" data-cat="' + c + '">' + c + '</button>').join('') + '</div>' +
      '<div class="mkt-search">🔍<input id="mktq" placeholder="搜索插件名 / 标签" value="' + esc(S.q) + '"></div></div>' +
      /* 档位筛选：能不能下载是这里最常被问的一件事，所以放在分类下面独占一行 */
      '<div class="tier-bar"><span class="lb">收录深度</span>' + tiers.map(function (x) {
        return '<button class="tier-chip ' + (S.tier === x[0] ? 'on' : '') + '" data-act="tier" data-t="' + x[0] + '">' +
          (x[0] === '全部' ? '' : '<i>' + TIER_ICON[x[0]] + '</i>') + x[1] + ' <b style="font-variant-numeric:tabular-nums;opacity:.75">' + x[2] + '</b></button>';
      }).join('') + '<span class="dist">有站内包的条目占 <b>' + Math.round(cnt.pack / plugins.length * 100) + '%</b>，其余去作者仓库取</span></div>' +
      '<div class="market-toolbar" style="padding-top:8px;padding-bottom:8px"><div class="sorts">' +
      ['热度', '最新', '安装', '体积'].map(s => '<button class="' + (S.sort === s ? 'on' : '') + '" data-act="sort" data-sort="' + s + '">' + s + '</button>').join('') +
      '</div><span style="margin-left:auto;font-size:12px;color:var(--txt-3)">' + list.length + ' 个结果</span></div>' +
      (list.length ? '<div class="mkt-grid">' + list.map(pluginCard).join('') + '</div>'
        : '<div class="empty"><span class="big">🔍</span>没有匹配的条目，换个关键词或档位试试</div>') +
      '</div></div>' + marketSide() + '</div>';
  }

  function marketSide() {
    const top = plugins.slice().sort((a, b) => b.installs - a.installs).slice(0, 5);
    const cats = {};
    plugins.forEach(p => { cats[p.cat] = (cats[p.cat] || 0) + 1; });
    return '<aside class="col-side">' +
      '<div class="side-card"><div class="side-hd"><span class="t">安装榜</span><a href="javascript:;">本周</a></div><div class="side-bd" style="padding:8px 10px"><div class="hot-list">' +
      top.map((p, i) => '<div class="hot-item" data-act="pl" data-id="' + p.id + '"><span class="rk">' + (i + 1) + '</span>' +
        '<span class="sp-ico" style="width:26px;height:26px;border-radius:8px;font-size:13px;background:' + p.grad + '">' + p.icon + '</span>' +
        '<span class="hx"><b>' + esc(p.name) + '</b><span>' + num(p.installs) + ' 次安装</span></span>' +
        '<span class="tr">★' + fmt(p.stars) + '</span></div>').join('') + '</div></div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">分类</span></div><div class="side-bd"><div class="mini-nav">' +
      Object.keys(cats).map(c => '<a href="javascript:;" data-act="cat" data-cat="' + c + '">' + c + ' · ' + cats[c] + '</a>').join('') +
      '</div></div></div>' +
      noticeSide() + '</aside>';
  }


  /* ══════════════════════════════════════════════════════════════
     v6 · 条目库 / 下载 / 认领 / 上传 / 转载与下架政策
     一句话原则：能不能下载，看作者授权，不看许可证推断。
     所以每处「下载」旁边都必须说清「谁给的授权」。
     ══════════════════════════════════════════════════════════════ */
  const TIER_LABEL = { pack: '本站提供安装包', link: '外链作者仓库', entry: '仅条目，无下载' };
  const TIER_ICON = { pack: '⤓', link: '↗', entry: '·' };
  const TIER_SHORT = { pack: '本站包', link: '外链', entry: '仅条目' };
  const TIER_TIP = {
    pack: '本站存有这个包，点一下就能下载',
    link: '本站不存包，去作者仓库拿最新的',
    entry: '没有可用下载渠道，只有条目信息'
  };

  function pluginOf(id) {
    return plugins.filter(function (p) { return p.id === id; })[0] || plugins[0];
  }
  function pluginByName(name) {
    if (!name) return null;
    return plugins.filter(function (p) { return p.name === name || p.pkg === name; })[0] || null;
  }
  /* data.js 里的 claimed 是「服务端已知的认领状态」，S.claimed 只是本次会话刚验证通过的。
     两者取并集：否则静态数据里已认领的条目（p1/p2/p4/p9）在页面里会显示成未认领。 */
  function claimedOf(p) { return !!p.claimed || S.claimed.has(p.id); }
  function mirrorOf(p) { return S.mirror[p.id] || p.mirror; }
  /* 档位跟着授权状态走：作者在认领页刚打开镜像，列表与条目页立刻变 */
  function tierOf(p) {
    const cl = claimedOf(p), m = mirrorOf(p);
    /* 作者认领过，就以他此刻的选择为准：关掉镜像立刻降成「仅条目」，
       连历史转载的包也不再对外分发 —— 授权是可以收回的。 */
    if (cl) {
      if (m === 'off') return 'entry';
      /* 作者点「撤回当前版本」：立刻停止分发，条目与外链仍在 */
      if (S.withdraw && S.withdraw.has(p.id)) return 'link';
      return p.file ? 'pack' : 'link';
    }
    /* 没认领的条目沿用数据里的历史档位：pack 只可能是本站早年转载 */
    return p.tier;
  }
  function tierBadge(p, tiny) {
    const t = tierOf(p);
    return '<span class="tier-badge ' + t + (tiny ? ' tiny' : '') + '" title="' + TIER_TIP[t] + '">' +
      '<i>' + TIER_ICON[t] + '</i>' + TIER_SHORT[t] + '</span>';
  }
  /* 由条目 id 派生一个稳定的验证串：真实实现由服务端签发，这里只是演示 */
  function vcode(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 131 + id.charCodeAt(i)) >>> 0;
    return 'seekbbs-verify-' + ('000000' + h.toString(16)).slice(-6);
  }

  /* 作者栏的一个小标签：谁给的这个包 */
  function sourceNote(p) {
    const t = tierOf(p), m = mirrorOf(p);
    if (t !== 'pack') return '';
    if (p.source === 'author') return m === 'auto' ? '作者授权 · 自动同步' : '作者手动上传';
    return '本站转载';
  }

  function plugInline(pid) {
    const p = pluginOf(pid);
    if (!p) return '';
    return '<div class="plug-inline" data-act="pl" data-id="' + p.id + '">' +
      '<div class="pi-ico" style="background:' + p.grad + '">' + p.icon + '</div>' +
      '<div class="pi-tx"><b>' + esc(p.name) + ' <span style="font-weight:500;color:var(--txt-3)">v' + esc(p.ver) + '</span></b>' +
      '<span>' + tierBadge(p, true) + '<i style="font-style:normal;color:var(--txt-3)">' + esc(sourceNote(p) || '认领后可维护版本') + '</i></span></div>' +
      '<span class="pi-go">查看条目 ›</span></div>';
  }

  /* ---------- 条目页 ---------- */
  function entryPage(id) {
    const p = pluginOf(id);
    const u = users[p.author];
    return '<div class="wrap">' + railHTML() + '<div class="col-main">' +
      entryHero(p, u) + dlBox(p) + entryBody(p) + entryTalk(p) + '</div>' + entrySide(p, u) + '</div>';
  }

  function entryHero(p, u) {
    const t = tierOf(p);
    const cl = claimedOf(p);
    return '<div class="entry-hero" style="--grad:' + p.grad + '">' +
      '<div class="eh-ico" style="background:' + p.grad + '">' + p.icon + '</div>' +
      '<div class="eh-main">' +
      '<h1 class="eh-name">' + esc(p.name) + tierBadge(p) + (cl ? '<span class="stamp ok">✓ 已认证</span>' : '') + '</h1>' +
      '<div class="eh-pkg">' + esc(p.pkg) + '<span style="opacity:.5">/</span><span class="eh-ver">v' + esc(p.ver) + '</span>' +
      '<span style="opacity:.5">·</span><span style="display:inline-flex;align-items:center;gap:5px">' + av(p.author, 18) + esc(u.name) + '</span>' +
      '<span class="tag-plain">' + esc(p.cat) + '</span></div>' +
      '<p class="eh-desc">' + esc(p.desc) + '</p>' +
      '<div class="eh-tags">' + p.tags.map(function (x) { return '<span class="tag-plain">#' + esc(x) + '</span>'; }).join('') +
      '<span style="font-size:11.5px;color:var(--txt-3)">最后更新 ' + esc(p.updated) + '</span></div>' +
      '<div class="eh-stat"><span>★ <b>' + num(p.stars) + '</b></span><span>⤓ <b>' + num(p.installs) + '</b> 次安装</span>' +
      '<span>收录于 <b>' + esc(p.collected) + '</b></span>' +
      '<span>许可证 <b>' + (p.license ? esc(p.license) : '未声明') + '</b></span></div>' +
      '</div>' +
      '<div class="eh-acts">' +
      (t === 'pack' && p.file
        ? '<button class="btn" data-act="dl" data-id="' + p.id + '">⤓ 下载安装包</button>'
        : '<button class="btn ghost" data-act="toast" data-msg="演示站点：不会真的打开外部链接">前往作者仓库 ↗</button>') +
      (cl
        ? '<button class="btn ghost" data-act="go" data-route="upload" data-id="' + p.id + '">上传新版本</button>'
        : '<button class="btn ghost" data-act="go" data-route="claim" data-id="' + p.id + '">我是作者，认领</button>') +
      '<button class="btn ghost" data-act="fav" data-pid="' + p.id + '">⭐ 收藏</button>' +
      '</div></div>';
  }

  /* 下载区三态：本站包 / 外链 / 仅条目 —— 只有这一块会变，其余版式一致 */
  function dlBox(p) {
    const t = tierOf(p);
    const cl = claimedOf(p);
    const m = mirrorOf(p);
    const f = p.file;
    const lic = p.license
      ? '<a href="javascript:;" data-act="toast" data-msg="演示站点：许可证全文请到原仓库查看">' + esc(p.license) + ' ↗</a>'
      : '<span class="lic-none">未声明（不可转载）</span>';
    const repo = '<a href="javascript:;" data-act="toast" data-msg="演示站点：' + esc(p.repo) + '">' + esc(p.repo) + ' ↗</a>';
    let body = '';

    if (t === 'pack' && f) {
      const byAuthor = p.source === 'author';
      body += '<button class="btn dl-btn" data-act="dl" data-id="' + p.id + '">⤓ 下载 ' + esc(f.name) + '（' + esc(f.size) + '）</button>' +
        '<div class="dl-info"><span class="sha" data-act="sha" data-sha="' + f.sha + '" title="点击复制完整 sha256">sha256 ' + f.sha.slice(0, 12) + '…</span>' +
        '<span>收录于 ' + esc(f.at) + '</span><span>' + esc(byAuthor ? (m === 'auto' ? '由作者授权本站镜像，自动同步' : '由作者上传') : '本站转载，原样未改') + '</span></div>' +
        signedBox(p);
      if (!byAuthor) {
        body += '<div class="dl-outdated">⚠️ 这个包是本站早年转载的，可能已经不是最新版。装之前建议先去原仓库核对一下版本号。</div>';
      }
    } else if (t === 'pack' && !f) {
      body += '<div class="dl-none">作者已授权本站分发，但还没有上传安装包。上传后这里会出现下载按钮。</div>';
    } else if (t === 'link') {
      body += '<a class="btn dl-btn" href="javascript:;" data-act="toast" data-msg="演示站点：不会真的打开外部链接">前往作者仓库下载 ↗</a>' +
        '<div class="dl-why">' + esc(p.why || '作者没有授权本站镜像，按规则我们只放外链。') + '</div>';
    } else {
      body += '<div class="dl-none">暂无可用的下载渠道，若你知道，欢迎补充。</div>' +
        '<div class="dl-why">' + esc(p.why || '没有明确授权，本站既不放包也不代转载。') + '</div>';
    }

    /* 未认领的条目：给作者一条自助路径 */
    if (!cl) {
      body += '<div class="dl-ask">🪪 这是社群整理的条目。如果你是作者，认领后可以上传最新版、维护版本信息与许可证。' +
        '<button data-act="go" data-route="claim" data-id="' + p.id + '">去认领 →</button></div>';
    }

    body += '<div class="dl-links"><i>原仓库</i>' + repo + '<i>许可证</i>' + lic + '<i>收录于</i>' + esc(p.collected) + '</div>';

    if (t === 'pack' && f && p.source === 'author') {
      body += '<div class="dl-note">安装：<code style="font-family:ui-monospace,Consolas,monospace">pnpm dsh add ./' + esc(f.name) + '</code>（一行，注意前面的 ./）。包由作者本人提供，本站只做存储与分发，未改动任何字节。</div>';
    } else if (t === 'pack') {
      body += '<div class="dl-note">本包由本站从上游原样转载，版权归原作者所有，未重打包、未删 LICENSE、未注入任何东西。若你是作者并要求下架，<a href="javascript:;" data-act="go" data-route="policy">按这里申请</a>，24 小时内处理。</div>';
    }

    body += '<div class="dl-rep">发现侵权、恶意代码或信息失实？<button data-act="rep" data-id="' + p.id + '">举报</button></div>' + reportPanel(p);

    return '<div class="dl-box" data-tier="' + t + '">' +
      '<div class="dl-hd"><span class="t">下载</span>' + tierBadge(p) +
      '<span class="dl-tier-full">' + TIER_LABEL[t] + '</span></div>' + body + '</div>';
  }

  /* 签名 URL 只在点击瞬间签发，HTML 里不出现任何签名参数 */
  function signedBox(p) {
    if (!S.dl || S.dl.id !== p.id) return '';
    if (S.dl.state === 'work') return '<div class="dl-signed">正在签发下载链接…</div>';
    return '<div class="dl-signed">链接已在点击瞬间签发，10 分钟内有效。<span class="url">https://dl.seekbbs.dev/packages/' +
      esc(p.pkg) + '/' + esc(p.ver) + '/' + esc(p.file.name) + '?Expires=1759020411&amp;Signature=demo-not-a-real-signature</span>' +
      '这是演示站，链接不会真的开始下载。</div>';
  }

  function reportPanel(p) {
    if (S.rep !== p.id) return '';
    const sel = S.repT[p.id];
    const cur = reportTypes.filter(function (r) { return r.id === sel; })[0];
    return '<div class="rp-box"><div class="rp-t">举报这个条目 / 安装包</div>' +
      '<div class="rp-d">收到举报后 24 小时内会把对应文件置为「暂停分发」，条目保留；全过程留档，处理结果会在下架记录页公示。</div>' +
      '<div class="rp-list">' + reportTypes.map(function (r) {
        return '<button class="rp-opt ' + (sel === r.id ? 'on' : '') + '" data-act="rpt" data-id="' + p.id + '" data-t="' + r.id + '" title="' + esc(r.d) + '">' + esc(r.t) + '</button>';
      }).join('') + '</div>' +
      (cur ? '<div class="dl-why" style="margin-top:9px">已选：<b style="color:var(--txt)">' + esc(cur.t) + '</b> —— ' + esc(cur.d) + '</div>' +
        '<div style="margin-top:9px"><button class="btn sm" data-act="rpsend" data-id="' + p.id + '">提交举报</button></div>' : '') +
      '</div>';
  }

  function entryBody(p) {
    const t = tierOf(p);
    const f = p.file;
    const cmd = t === 'pack' && f ? 'pnpm dsh add ./' + f.name : 'pnpm dsh add ' + p.pkg;
    return '<div class="card"><div class="card-hd"><h2 class="t">条目正文</h2>' +
      '<span class="more">正文由社群编辑，版本 / 许可证 / 下载由作者维护</span></div><div class="card-bd">' +
      '<div class="doc-sec"><h2>这个插件做什么</h2>' +
      '<p>' + esc(p.desc) + '</p>' +
      '<ul class="doc-ul"><li>分类：' + esc(p.cat) + '，标签 ' + p.tags.map(function (x) { return '#' + esc(x); }).join(' ') + '。</li>' +
      '<li>维护者：' + esc(users[p.author].name) + (claimedOf(p) ? '（仓库已认证，能维护版本与下载）' : '（条目由社群整理，作者尚未认领）') + '。</li>' +
      '<li>想改简介、用法、常见问题？认领之外的正文段落欢迎编辑者补充。</li></ul></div>' +
      '<div class="doc-sec"><h2>安装</h2>' +
      '<div class="doc-code">' + esc(cmd) + '</div>' +
      '<p class="doc-note">一行就够，命令前面的 <code>./</code> 别省。也可以把包解压到 DSH 的插件目录后重启。</p></div>' +
      '<div class="doc-sec"><h2>常见问题</h2>' +
      '<ul class="doc-ul">' +
      '<li><b>装完没反应？</b>确认 DSH 版本与插件声明的兼容范围一致，再重启一次会话。</li>' +
      '<li><b>能和别的插件共存吗？</b>看功能有没有重叠（同名命令、同一个端口、同一个缓存目录）。</li>' +
      '<li><b>包是从哪来的？</b>' + (t === 'pack' ? (p.source === 'author' ? '作者本人上传或授权本站镜像。' : '本站早年从上游转载，原样未改。') : '本站不存包，只链到作者仓库。') + '</li>' +
      '</ul></div>' +
      '</div></div>';
  }

  function entryTalk(p) {
    const rel = threads.filter(function (x) { return x.plugin === p.id; });
    const feed = posts.filter(function (x) { return x.plugin === p.name; });
    if (!rel.length && !feed.length) {
      return '<div class="card"><div class="card-hd"><span class="t">社群讨论</span></div>' +
        '<div class="empty"><span class="big">💬</span>还没有人聊过这个插件，去社群开个帖吧</div></div>';
    }
    return '<div class="card"><div class="card-hd"><span class="t">社群讨论</span>' +
      '<span class="more" data-act="go" data-route="forum">去社群 ›</span></div>' +
      (rel.length ? '<div>' + rel.map(threadRow).join('') + '</div>' : '') +
      (feed.length ? '<div class="card-bd" style="padding:12px 16px"><div class="muted" style="font-size:11.5px;margin-bottom:7px">相关更新</div>' +
        feed.map(function (x) {
          return '<div class="hot-item" data-act="toast" data-msg="演示站点：日志详情未展开"><span class="sp-ico" style="width:26px;height:26px;border-radius:8px;font-size:13px;background:' + users[x.user].grad + '">' + users[x.user].emoji + '</span>' +
            '<span class="hx"><b>' + esc(x.text.slice(0, 34)) + (x.text.length > 34 ? '…' : '') + '</b><span>' + esc(users[x.user].name) + ' · ' + esc(x.time) + '</span></span></div>';
        }).join('') + '</div>' : '') +
      '</div>';
  }

  function entrySide(p, u) {
    const st = pkgStats[p.id];
    return '<aside class="col-side">' +
      '<div class="side-card"><div class="side-hd"><span class="t">作者</span>' +
      (claimedOf(p) ? '<a href="javascript:;" data-act="go" data-route="claim" data-id="' + p.id + '">已认领</a>' : '<a href="javascript:;" data-act="go" data-route="claim" data-id="' + p.id + '">去认领</a>') + '</div>' +
      '<div class="side-bd"><div style="display:flex;gap:10px;align-items:center">' + av(p.author, 44) +
      '<div><div style="font-weight:700;font-size:13.5px">' + esc(u.name) + '</div>' +
      '<div style="font-size:11.5px;color:var(--txt-3)">Lv.' + u.level + ' · ' + esc(u.badge || '普通用户') + '</div></div></div>' +
      '<div style="font-size:12.5px;color:var(--txt-2);margin-top:9px;line-height:1.6">' + esc(u.sig) + '</div>' +
      '<button class="btn sm blue" style="width:100%;margin-top:10px" data-act="user" data-uid="' + p.author + '">进入 TA 的空间</button></div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">收录信息</span></div><div class="side-bd">' +
      '<dl class="kv"><dt>收录档位</dt><dd>' + TIER_SHORT[tierOf(p)] + '</dd>' +
      '<dt>收录日期</dt><dd>' + esc(p.collected) + '</dd>' +
      '<dt>许可证</dt><dd>' + (p.license ? esc(p.license) : '<span class="lic-none" style="color:var(--rose-ink)">未声明</span>') + '</dd>' +
      '<dt>原仓库</dt><dd style="word-break:break-all">' + esc(p.repo) + '</dd>' +
      (p.file ? '<dt>文件</dt><dd style="word-break:break-all">' + esc(p.file.size) + '</dd><dt>sha256</dt><dd style="font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all">' + p.file.sha.slice(0, 24) + '…</dd>' : '') +
      '</dl>' +
      (st ? '<div class="trend-lb" style="margin-top:12px"><span>近 7 天下载</span><span>' + num(st.downloads) + ' 次</span></div>' +
        '<div class="trend">' + st.week.map(function (v) { return '<i style="height:' + Math.max(6, Math.round(v / Math.max.apply(null, st.week) * 100)) + '%"></i>'; }).join('') + '</div>' : '') +
      '</div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">收录与下架</span></div><div class="side-bd">' +
      '<div style="font-size:12.5px;color:var(--txt-2);line-height:1.7">我们转载什么、怎么转载、怎么下架，全写在政策页里，没有弹窗。</div>' +
      '<button class="btn sm ghost" style="width:100%;margin-top:10px" data-act="go" data-route="policy">查看转载与下架政策</button></div></div>' +
      noticeSide() + '</aside>';
  }

  /* ---------- 认领页 ---------- */
  function claimPage(id) {
    const p = pluginOf(id);
    const u = users[p.author];
    const cl = claimedOf(p);
    const mt = claimMethods.filter(function (x) { return x.id === S.vt; })[0] || claimMethods[0];
    const vs = S.vs[p.id] || null;
    const m = mirrorOf(p);
    return '<div class="wrap">' + railHTML() + '<div class="col-main">' +
      '<div class="claim-hero">' +
      '<div class="ch-ico" style="background:' + p.grad + '">' + p.icon + '</div>' +
      '<div class="ch-tx"><h1>' + esc(p.name) + (cl ? '<span class="stamp ok">✓ 仓库已认证</span>' : '<span class="stamp wait">未认领</span>') + '</h1>' +
      '<p>认领后你可以维护这个条目的版本、许可证与下载，正文仍由社群编辑。</p></div>' +
      '<button class="btn sm ghost" data-act="pl" data-id="' + p.id + '">返回条目</button></div>' +

      '<div class="card"><div class="claim-tabs">' + claimMethods.map(function (x) {
        return '<button class="claim-tab ' + (S.vt === x.id ? 'on' : '') + '" data-act="claimtab" data-id="' + p.id + '" data-t="' + x.id + '">' +
          x.icon + ' ' + esc(x.name) + '</button>';
      }).join('') + '</div>' +
      '<div class="claim-pane">' +
      '<p class="claim-lead">' + esc(mt.desc) + '验证串放在<b>' + esc(mt.where) + '</b>，' + esc(mt.ttl) + '。</p>' +
      '<div class="verify-str"><code>' + vcode(p.id) + '</code>' +
      '<button class="btn sm ghost" data-act="copyv" data-v="' + vcode(p.id) + '">复制验证串</button></div>' +
      '<ol class="claim-steps">' + mt.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<div class="claim-act"><button class="btn" data-act="claimverify" data-id="' + p.id + '">' +
      (cl ? '重新验证' : '我已添加，开始验证') + '</button>' +
      '<span style="font-size:11.5px;color:var(--txt-3)">验证只读仓库公开内容，不会要你的 token</span></div>' +
      verifyBox(mt, vs) +
      '</div></div>' +

      permCard() +
      (cl ? grantBox(p, m) : '') +
      (cl ? maintainCard(p) : '') +
      '</div>' + claimSide(p, u) + '</div>';
  }

  function verifyBox(mt, vs) {
    if (!vs) return '';
    if (vs.state === 'work') return '<div class="vf-box work"><span class="vf-ic">⏳</span><span>正在读取仓库…（演示站点会等一秒）</span></div>';
    if (vs.state === 'ok') return '<div class="vf-box ok"><span class="vf-ic">✅</span><span>验证通过：仓库已绑定，你现在是这个条目的作者，可以上传版本、切换授权。</span></div>';
    return '<div class="vf-box fail"><span class="vf-ic">⚠️</span><span>' + esc(mt.fail) + '</span></div>';
  }

  function permCard() {
    return '<div class="card"><div class="card-hd"><span class="t">认领之后，谁管什么</span></div><div class="card-bd">' +
      '<div class="perm-grid">' +
      '<div class="perm-col"><div class="pc-t">✍️ 作者</div><ul><li>版本号与发布节奏</li><li>许可证声明</li><li>下载文件与是否授权镜像</li><li>兼容的 DSH 版本、是否含破坏性变更</li></ul></div>' +
      '<div class="perm-col"><div class="pc-t">🧑‍🤝‍🧑 社群编辑者</div><ul><li>简介与用法</li><li>常见问题与踩坑记录</li><li>截图、示例、相关话题</li><li>错别字与排版</li></ul></div>' +
      '</div><div class="perm-note">冲突时以事实字段为准：版本、许可证、下载以作者为准，正文以编辑共识为准。作者关掉镜像，附件立刻回到「仅条目」。</div></div></div>';
  }

  function grantBox(p, m) {
    const on = m !== 'off';
    return '<div class="grant-box"><div class="gb-hd"><span class="gb-t">授权本站镜像分发</span>' +
      '<span class="gb-sw"><span>' + (on ? '已开启' : '未授权') + '</span>' +
      '<button class="sw ' + (on ? 'on' : '') + '" data-act="grant" data-id="' + p.id + '" aria-label="授权本站镜像分发"></button></span></div>' +
      (on
        ? '<div class="gb-body">' +
        '<div class="gb-opt ' + (m === 'auto' ? 'on' : '') + '" data-act="gmode" data-id="' + p.id + '" data-m="auto">' +
        '<span class="rd"></span><span class="gt"><b>自动跟随上游 tag <span class="rec">推荐</span></b>' +
        '<span>每 6 小时检查一次新 tag，抓到就扫描、上架、更新这一页。</span></span></div>' +
        '<div class="gb-opt ' + (m === 'manual' ? 'on' : '') + '" data-act="gmode" data-id="' + p.id + '" data-m="manual">' +
        '<span class="rd"></span><span class="gt"><b>仅手动上传</b>' +
        '<span>你什么时候传，什么时候更新；适合发布节奏自己把控的插件。</span></span></div>' +
        '</div>' +
        '<div class="gb-note">开启后，条目页会出现「下载」按钮；抓到的包一律原样存储，不改一个字节。</div>'
        : '<div class="gb-note">关掉只影响下载，条目本身保留。开启前这里显示「未授权」，页面只有外链。</div>') +
      '<div class="gb-note">随时可以关闭，关闭后 24 小时内停止提供下载。' +
      '<a href="javascript:;" data-act="go" data-route="policy">看分发规则</a></div></div>';
  }

  function maintainCard(p) {
    const st = pkgStats[p.id];
    return '<div class="card"><div class="card-hd"><span class="t">这个版本</span>' +
      '<span class="more" data-act="go" data-route="upload" data-id="' + p.id + '">上传新版本 ›</span></div><div class="card-bd">' +
      '<dl class="kv"><dt>当前版本</dt><dd>v' + esc(p.ver) + '（收录于 ' + esc(p.collected) + '）</dd>' +
      '<dt>安装包</dt><dd>' + (p.file ? esc(p.file.name) + ' · ' + esc(p.file.size) : '还没有上传安装包') + '</dd>' +
      (p.file ? '<dt>sha256</dt><dd style="font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all">' + p.file.sha + '</dd>' : '') +
      '</dl>' +
      (st ? '<div class="aw-stats"><div class="s"><b>' + num(st.downloads) + '</b><span>累计下载</span></div>' +
        '<div class="s"><b>' + num(st.week[6]) + '</b><span>昨日下载</span></div>' +
        '<div class="s"><b>' + st.issues + '</b><span>待处理问题</span></div></div>' +
        '<div class="trend-lb" style="margin-top:10px"><span>近 7 天</span><span>最高 ' + num(Math.max.apply(null, st.week)) + '</span></div>' +
        '<div class="trend">' + st.week.map(function (v) { return '<i style="height:' + Math.max(6, Math.round(v / Math.max.apply(null, st.week) * 100)) + '%"></i>'; }).join('') + '</div>' : '') +
      '<div style="margin-top:13px"><button class="btn sm ghost" data-act="withdraw" data-id="' + p.id + '">撤回当前版本</button>' +
      '<span style="font-size:11.5px;color:var(--txt-3);margin-left:9px">撤回后立刻停止下载，条目保留</span></div>' +
      '</div></div>';
  }

  function claimSide(p, u) {
    return '<aside class="col-side">' +
      '<div class="side-card"><div class="side-hd"><span class="t">为什么是这三种验证</span></div><div class="side-bd">' +
      '<div style="font-size:12.5px;color:var(--txt-2);line-height:1.78">三种方式都要求「只有仓库所有者能做到」，所以它证明的不是「你懂这个包」，而是「这个仓库是你的」。</div>' +
      '<ul class="doc-ul" style="margin-top:9px"><li>README 改完立刻生效，最省事</li><li>Issue 适合不想改仓库的人</li><li>Gist 适合仓库是别人名字但你是实际维护者</li></ul>' +
      '</div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">条目现状</span></div><div class="side-bd">' +
      '<dl class="kv"><dt>当前档位</dt><dd>' + TIER_SHORT[tierOf(p)] + '</dd>' +
      '<dt>作者</dt><dd>' + esc(u.name) + '</dd>' +
      '<dt>许可证</dt><dd>' + (p.license ? esc(p.license) : '未声明') + '</dd>' +
      '<dt>收录日期</dt><dd>' + esc(p.collected) + '</dd></dl>' +
      '<button class="btn sm ghost" style="width:100%;margin-top:10px" data-act="pl" data-id="' + p.id + '">看条目页长什么样</button></div></div>' +
      noticeSide() + '</aside>';
  }

  /* ---------- 上传页（作者控制台） ---------- */
  function uploadPage(id) {
    const p = pluginOf(id);
    const cl = claimedOf(p);
    if (!cl) {
      return '<div class="wrap">' + railHTML() + '<div class="col-main">' +
        '<div class="card"><div class="card-hd"><h1 class="t">上传新版本</h1></div><div class="card-bd">' +
        '<div class="dl-none">这个条目还没被作者认领，上传入口不开放。</div>' +
        '<div class="dl-why">先证明仓库是你的，再传包。整个过程不需要你给 token，也不用手动填 sha。</div>' +
        '<div style="margin-top:14px"><button class="btn" data-act="go" data-route="claim" data-id="' + p.id + '">去认领这个条目 ›</button></div>' +
        '</div></div></div>' + claimSide(p, users[p.author]) + '</div>';
    }
    const up = S.up;
    const f = up.file;
    return '<div class="wrap">' + railHTML() + '<div class="col-main">' +
      '<div class="card"><div class="card-hd"><h1 class="t">上传新版本</h1>' +
      '<span class="more" data-act="pl" data-id="' + p.id + '">返回条目 ›</span></div><div class="card-bd">' +
      (f ? upFileCard(p, f) : '<div class="up-drop" data-act="updrop" data-id="' + p.id + '">' +
        '<div class="ud-ic">📦</div><div class="ud-t">把 .tgz 拖到这里，或点击选择</div>' +
        '<div class="ud-d">只收 .tgz / .zip，单个不超过 20 MB。演示站点会模拟解析 package.json 回显包名、版本与许可证。</div></div>') +
      (f ? upWarn(p, f) : '') +
      upForm(p, f) +
      '</div></div>' +
      authorStats(p) +
      '</div>' + claimSide(p, users[p.author]) + '</div>';
  }

  function upFileCard(p, f) {
    return '<div class="up-file"><div class="uf-ico">📦</div>' +
      '<div class="uf-tx"><b>' + esc(f.name) + '</b><span>' + esc(f.size) + ' · 解压后读到的 package.json：' + esc(f.pkg) + ' @ ' + esc(f.ver) + ' · license ' + esc(f.lic || '（无）') + '</span></div>' +
      '<button class="uf-x" data-act="upclear" title="移除">✕</button></div>' +
      '<dl class="up-meta"><dt>包名</dt><dd>' + esc(f.pkg) + '</dd><dt>版本</dt><dd>' + esc(f.ver) + '</dd>' +
      '<dt>许可证</dt><dd>' + (f.lic ? esc(f.lic) : '<span style="color:var(--rose-ink)">未声明</span>') + '</dd>' +
      '<dt>sha256</dt><dd class="mono">' + esc(f.sha) + '</dd></dl>';
  }

  function upWarn(p, f) {
    let out = '';
    if (f.pkg !== p.pkg) {
      out += '<div class="up-warn">⚠️ 包名对不上：这个包叫 <b>' + esc(f.pkg) + '</b>，条目是 <b>' + esc(p.pkg) + '</b>。传错包会污染别人的条目，再确认一次。</div>';
    }
    if (f.ver === p.ver) {
      out += '<div class="up-warn">⚠️ 版本号已存在：v' + esc(p.ver) + ' 已经在库里了，提交会覆盖现有文件并留档。</div>';
    }
    return out;
  }

  function upForm(p, f) {
    const up = S.up;
    const compat = ['0.9.x', '1.0.x', '1.1.x', 'dev 分支'];
    const ready = f && up.compat.length && up.agreed.length === grantTerms.length;
    if (up.stage === 'review') {
      return '<div class="verdict" data-t="link"><div class="vh">✅ 已提交，正在等人工审核</div>' +
        '<dl class="rows"><dt>文件</dt><dd>' + esc(f.name) + '（' + esc(f.size) + '）</dd>' +
        '<dt>sha256</dt><dd style="font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all">' + esc(f.sha) + '</dd>' +
        '<dt>安全扫描</dt><dd>通过（无 child_process 外连、无混淆、无挖矿特征）</dd>' +
        '<dt>下一步</dt><dd>人工复核后上架，通常 1 个工作日内</dd></dl>' +
        '<div class="tip good">上架后条目页会显示「作者提供」标签、文件名、大小、sha256 与上传时间，你也能撤回。</div></div>' +
        '<div class="form-act" style="margin-top:14px"><button class="btn sm ghost" data-act="upreset">再传一个</button></div>';
    }
    return '<div class="form-grid" style="margin-top:16px">' +
      '<div class="form-row wide"><label>适用 DSH 版本<span class="req">*</span></label>' +
      '<div class="pick-row">' + compat.map(function (c) {
        return '<button class="pick ' + (up.compat.indexOf(c) >= 0 ? 'on' : '') + '" data-act="upver" data-v="' + c + '">' + c + '</button>';
      }).join('') + '</div><div class="hint">多选，至少一个。装到不在范围内的版本上，出问题不好排查。</div></div>' +
      '<div class="form-row wide"><label>是否含破坏性变更<span class="req">*</span></label>' +
      '<div class="pick-row">' + ['没有', '有，已在说明里写清'].map(function (c) {
        return '<button class="pick ' + (up.breaking === c ? 'on' : '') + '" data-act="upbreak" data-v="' + c + '">' + c + '</button>';
      }).join('') + '</div></div>' +
      '<div class="form-row wide"><label>变更说明</label>' +
      '<textarea id="upnote" placeholder="这一版改了什么、要读者注意什么。破坏性变更请写清迁移方式。" rows="3"></textarea>' +
      '<div class="hint">会显示在条目页的版本记录里。</div></div>' +
      '<div class="form-row wide"><label>授权条款<span class="req">*</span></label>' +
      grantTerms.map(function (t, i) {
        return '<button class="chk ' + (up.agreed.indexOf(i) >= 0 ? 'on' : '') + '" data-act="chk" data-i="' + i + '">' +
          '<span class="bx"></span><span>' + esc(t) + '</span></button>';
      }).join('') +
      '<div class="hint">五条都要勾。勾了就是书面授权，撤回随时可以。</div></div>' +
      '</div>' +
      '<div class="form-act"><button class="btn" data-act="upsubmit" data-id="' + p.id + '" ' + (ready ? '' : 'disabled') + '>提交审核</button>' +
      '<span class="hint" style="font-size:11.5px;color:var(--txt-3)">' + (ready ? '提交后自动扫描，通过进人工审核' : '还差：' + (!f ? '选择安装包 · ' : '') + (!up.compat.length ? '适用版本 · ' : '') + (up.agreed.length !== grantTerms.length ? '授权条款（' + up.agreed.length + '/' + grantTerms.length + '）' : '') + '') + '</span></div>';
  }

  function authorStats(p) {
    const st = pkgStats[p.id];
    if (!st) {
      return '<div class="card"><div class="card-hd"><span class="t">作者可见数据</span></div>' +
        '<div class="empty"><span class="big">📈</span>这个条目还没有下载数据</div></div>';
    }
    return '<div class="card"><div class="card-hd"><span class="t">作者可见数据</span><span class="more">只有作者看得到</span></div><div class="card-bd">' +
      '<div class="aw-stats"><div class="s"><b>' + num(st.downloads) + '</b><span>累计下载</span></div>' +
      '<div class="s"><b>' + num(st.week[6]) + '</b><span>昨日</span></div>' +
      '<div class="s"><b>' + st.issues + '</b><span>待处理问题</span></div></div>' +
      '<div class="trend-lb" style="margin-top:12px"><span>近 7 天下载</span><span>最高 ' + num(Math.max.apply(null, st.week)) + '</span></div>' +
      '<div class="trend">' + st.week.map(function (v) { return '<i style="height:' + Math.max(6, Math.round(v / Math.max.apply(null, st.week) * 100)) + '%"></i>'; }).join('') + '</div>' +
      '<div class="muted" style="font-size:11.5px;margin-top:11px;line-height:1.65">下载次数只做趋势参考：本站不跟踪装完之后的行为，也不埋点。</div>' +
      '</div></div>';
  }

  /* ---------- 转载与下架政策页 ---------- */
  /* 把 AUTH 抛出的错误翻译成「面板顶部的提示 + 下一步按钮」。
     错误对象里带了 code，未注册时还要顺手把用户推到注册 tab —— 只报错不给出路是最糟的反馈。 */
  function authErrOf(err, isReg) {
    const code = (err && err.code) || 'UNKNOWN';
    const msg = (err && err.message) || '操作没有完成，请重试';
    if (code === 'NOT_REGISTERED') return { msg: msg, act: 'register' };
    if (code === 'ALREADY_AUTHED') return { msg: msg, act: 'logout' };
    if (code === 'AUTH_LOCKED') return { msg: msg, act: 'logout' };
    if (code === 'NOT_AUTHED') return { msg: msg, act: 'login' };
    if (code === 'BAD_CREDENTIALS') return { msg: msg, act: isReg ? 'login' : '' };
    if (code === 'EMAIL_TAKEN') return { msg: msg, act: 'login' };
    return { msg: msg };
  }
  /* 验证码冷却倒计时：只在验证页活着时跑，离开页面就自己停，
     不留下一个改 S 的僵尸定时器。 */
  let phoneTimer = null;
  function tickPhoneCool() {
    if (phoneTimer) { clearInterval(phoneTimer); phoneTimer = null; }
    if (S.phoneCool <= 0) return;
    phoneTimer = setInterval(function () {
      S.phoneCool = Math.max(0, S.phoneCool - 1);
      const btn = qs('[data-act="phsend"]');
      if (S.route !== 'verify' || !btn) { clearInterval(phoneTimer); phoneTimer = null; return; }
      btn.textContent = S.phoneCool > 0 ? S.phoneCool + ' 秒后重发' : '获取验证码';
      btn.disabled = S.phoneCool > 0;
    }, 1000);
  }

  /* ---------- v17 · 登录 / 注册 / 手机号认证 / 设置 ----------
     三个页面共用一套 B 站式骨架：左侧主题画面，右侧白卡片表单。
     共同原则：
       1. 页面只读 AUTH.state()，不自己存身份；
       2. 所有失败都给「下一步做什么」，不是只报错（未注册 → 去注册 tab）；
       3. 已登录时进登录页直接挡回去 —— 换号必须先退出，这条规则在页面上也看得见。 */
  function authErrHTML() {
    const e = S.authErr;
    if (!e) return '';
    return '<div class="auth-err" role="alert"><span aria-hidden="true">⚠️</span><span>' + esc(e.msg || e) + '</span>' +
      (e.act === 'register' ? '<button type="button" class="auth-link" data-act="authtab" data-tab="register">去注册</button>' : '') +
      (e.act === 'login' ? '<button type="button" class="auth-link" data-act="authtab" data-tab="login">去登录</button>' : '') +
      (e.act === 'logout' ? '<button type="button" class="auth-link" data-act="logout">退出当前账号</button>' : '') +
      '</div>';
  }
  function authVisualHTML(title, sub) {
    return '<div class="auth-visual" aria-hidden="true">' +
      '<div class="av-sea"><span class="av-glow"></span><span class="av-ray r1"></span><span class="av-ray r2"></span>' +
      '<span class="av-tail">' + tail('100%', 2.4) + '</span>' +
      '<span class="av-bub b1"></span><span class="av-bub b2"></span><span class="av-bub b3"></span></div>' +
      '<div class="av-copy"><h2>' + esc(title) + '</h2><p>' + esc(sub) + '</p>' +
      '<ul class="av-list">' +
      '<li><b>单账号单会话</b>同一时间只有一条有效会话，换个设备登录要显式顶替</li>' +
      '<li><b>登录后锁定</b>会话建立后不能在本浏览器内换号，换号请先退出</li>' +
      '<li><b>手机号认证</b>登录只是进门，认证过才算完整账号</li>' +
      '</ul></div></div>';
  }
  /* 第三方三键：B 站把微信/微博/QQ 排成一行圆钮，这里同构 */
  function oauthRowHTML() {
    const list = (window.AUTH && window.AUTH.providers) || [];
    return '<div class="oauth-row" role="group" aria-label="第三方账号登录">' +
      list.map(function (p) {
        return '<button type="button" class="oauth-btn" data-act="oauth" data-p="' + p.id + '"' +
          ' aria-label="用 ' + esc(p.name) + ' 登录" title="用 ' + esc(p.name) + ' 登录" style="--oc:' + p.color + '">' +
          '<span class="oc-ic" aria-hidden="true">' + p.icon + '</span><span class="oc-tx">' + esc(p.name) + '</span></button>';
      }).join('') + '</div>';
  }
  function loginPage() {
    const st = authState();
    /* 已登录时进来：不是「再登一次」，而是告诉用户当前锁在哪个账号上 */
    if (st.mode === 'authed' && !S.authForce) {
      return '<div class="wrap solo"><div class="auth-wrap"><div class="auth-panel only">' +
        '<div class="auth-hd"><h1>已经登录了</h1><p>当前账号 <b>' + esc(profileOf().nick) + '</b>' +
        (st.email ? ' · ' + esc(st.email) : '') + '</p></div>' +
        '<div class="auth-note locked"><b>同一时间只能登录一个账户。</b>要换号请先退出，退出后才能用另一个邮箱登录；' +
        '这条规则在后端 sessions 表上也成立 —— 每个账号最多一行会话。</div>' +
        '<div class="auth-acts"><button type="button" class="btn ghost" data-act="go" data-route="feed">返回首页</button>' +
        '<button type="button" class="btn blue" data-act="logout">退出登录</button></div>' +
        '</div></div></div>';
    }
    const tab = S.authTab === 'register' ? 'register' : 'login';
    const f = S.authForm || {};
    return '<div class="wrap solo"><div class="auth-wrap">' +
      authVisualHTML('回到鲸域', '插件、日志与社群都在这里等你。一个账号，一台设备，一条会话。') +
      '<div class="auth-panel">' +
      '<div class="auth-hd"><h1>' + (tab === 'login' ? '登录' : '注册') + '</h1>' +
      '<p>' + (tab === 'login' ? '还没有账号？先注册一个 —— 未注册的邮箱登不进来。' : '注册即登录，注册完成后还会要求认证手机号。') + '</p></div>' +
      '<div class="auth-tabs" role="tablist">' +
      '<button type="button" role="tab" class="auth-tab' + (tab === 'login' ? ' on' : '') + '"' +
      ' aria-selected="' + (tab === 'login') + '" data-act="authtab" data-tab="login">密码登录</button>' +
      '<button type="button" role="tab" class="auth-tab' + (tab === 'register' ? ' on' : '') + '"' +
      ' aria-selected="' + (tab === 'register') + '" data-act="authtab" data-tab="register">注册账号</button>' +
      '</div>' +
      authErrHTML() +
      '<form class="auth-form" onsubmit="return false">' +
      (tab === 'register'
        ? '<label class="auth-field"><span>昵称</span><i aria-hidden="true">🙂</i>' +
          '<input id="rg-name" type="text" maxlength="16" autocomplete="nickname" placeholder="站点里显示的名字，最多 16 字" value="' + esc(f.name || '') + '"></label>'
        : '') +
      '<label class="auth-field"><span>邮箱</span><i aria-hidden="true">✉️</i>' +
      '<input id="' + (tab === 'login' ? 'lg-email' : 'rg-email') + '" type="email" autocomplete="email" placeholder="you@example.com" value="' + esc(f.email || '') + '"></label>' +
      '<label class="auth-field"><span>密码</span><i aria-hidden="true">🔒</i>' +
      '<input id="' + (tab === 'login' ? 'lg-password' : 'rg-password') + '" type="password" autocomplete="' + (tab === 'login' ? 'current-password' : 'new-password') + '" placeholder="至少 8 位"></label>' +
      (tab === 'register'
        ? '<label class="auth-field"><span>确认密码</span><i aria-hidden="true">🔒</i>' +
          '<input id="rg-password2" type="password" autocomplete="new-password" placeholder="再输一次"></label>'
        : '') +
      '<button type="button" class="btn blue auth-submit" data-act="' + (tab === 'login' ? 'login' : 'register') + '">' +
      (tab === 'login' ? '登录' : '注册并登录') + '</button>' +
      '</form>' +
      '<div class="auth-or"><span>其他方式登录</span></div>' +
      oauthRowHTML() +
      '<p class="auth-legal">继续即表示同意《社区准则》与《隐私说明》。演示站点：不会真的发送邮件或短信。</p>' +
      '<div class="auth-demo"><b>演示账号</b><span>u1@jingyu.dev ~ u8@jingyu.dev / jingyu2026</span></div>' +
      '</div></div></div>';
  }
  /* 第三方授权的中转页：真实实现会跳到 provider 域名，这里用页面内的确认卡代替 */
  function oauthPage() {
    const p = (window.AUTH && window.AUTH.providerOf && window.AUTH.providerOf(S.oauthPending)) || null;
    if (!p) { S.route = 'login'; return loginPage(); }
    return '<div class="wrap solo"><div class="auth-wrap">' +
      authVisualHTML('第三方授权', '授权完成后回到鲸域，账号同样是「一个账号一条会话」。') +
      '<div class="auth-panel">' +
      '<div class="auth-hd"><h1>使用 ' + esc(p.name) + ' 登录</h1><p>演示态：不走真实 OAuth，直接走同一条状态机。</p></div>' +
      '<div class="oauth-card"><span class="oc-big" aria-hidden="true">' + p.icon + '</span>' +
      '<div><b>鲸域 请求获取你的 ' + esc(p.name) + ' 昵称与头像</b>' +
      '<p>仅用于创建站内账号，不会读取好友列表或发布内容。</p></div></div>' +
      authErrHTML() +
      '<div class="auth-acts"><button type="button" class="btn ghost" data-act="oauthcancel">取消</button>' +
      '<button type="button" class="btn blue" data-act="oauthok" data-p="' + p.id + '">授权并登录</button></div>' +
      '</div></div></div>';
  }
  /* 手机号认证：登录流程的最后一步，没过这一关进不了站内 */
  function verifyPage() {
    const st = authState();
    const dev = S.phoneDev ? '<div class="phone-dev" role="status"><b>演示验证码</b><code>' + esc(S.phoneDev) + '</code>' +
      '<span>真实环境由短信服务商下发，这一行不会出现。</span></div>' : '';
    return '<div class="wrap solo"><div class="auth-wrap">' +
      authVisualHTML('最后一步：认证手机号', '手机号用于找回账号与接收安全提醒；一个手机号只能绑定一个账号。') +
      '<div class="auth-panel">' +
      '<div class="auth-hd"><h1>手机号认证</h1><p>' + esc(st.name || profileOf().nick) +
      '，还差一步就能进站内。' + (st.email ? '（' + esc(st.email) + '）' : '') + '</p></div>' +
      authErrHTML() +
      '<div class="phone-step" aria-label="认证进度"><span class="on">1 登录</span><span class="on">2 手机号</span><span>3 进站</span></div>' +
      '<label class="auth-field"><span>手机号</span><i aria-hidden="true">📱</i>' +
      '<input id="ph-num" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel" placeholder="11 位大陆手机号" value="' + esc(S.phone || '') + '"></label>' +
      '<div class="phone-row"><label class="auth-field grow"><span>验证码</span><i aria-hidden="true">🔢</i>' +
      '<input id="ph-code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6 位数字"></label>' +
      '<button type="button" class="btn ghost phone-send" data-act="phsend"' + (S.phoneCool > 0 ? ' disabled' : '') + '>' +
      (S.phoneCool > 0 ? S.phoneCool + ' 秒后重发' : '获取验证码') + '</button></div>' +
      dev +
      '<button type="button" class="btn blue auth-submit" data-act="phverify">完成认证</button>' +
      '<div class="auth-acts sub"><button type="button" class="btn ghost sm" data-act="logout">换个账号登录</button></div>' +
      '</div></div></div>';
  }
  /* 设置页：菜单里原来那条「设置」指向 feed，所以永远打不开。
     现在有真实路由 #/settings，四组分区，账号与安全排第一。 */
  const SET_SECTIONS = [
    ['set-acc', '账号与安全'], ['set-look', '外观'], ['set-notify', '通知'], ['set-about', '关于']
  ];
  function settingsPage() {
    const st = authState();
    const info = (window.AUTH && window.AUTH.accountInfo) ? window.AUTH.accountInfo() : null;
    const cur = S.setPanel || 'set-acc';
    const nav = SET_SECTIONS.map(function (s) {
      return '<button type="button" class="set-nav-item' + (cur === s[0] ? ' on' : '') + '"' +
        ' data-act="setjump" data-id="' + s[0] + '">' + s[1] + '</button>';
    }).join('');
    const pf = profileOf();
    const theme = document.documentElement.dataset.theme === 'night' ? 'night' : 'day';
    const accPanel =
      '<section class="set-sec" id="set-acc"><h2>账号与安全</h2>' +
      '<div class="set-row"><div class="set-k">当前账号</div><div class="set-v">' + av(ME(), 34) +
      '<b>' + esc(pf.nick) + '</b><span class="set-sub">' + esc(st.email || '（未记录邮箱）') + '</span></div></div>' +
      '<div class="set-row"><div class="set-k">手机号</div><div class="set-v">' +
      (st.phoneOk ? '<span class="set-ok">已认证</span><span class="set-sub">' + esc(st.phone || '') + '</span>'
        : '<span class="set-warn">未认证</span><button type="button" class="btn sm blue" data-act="go" data-route="verify">去认证</button>') +
      '</div></div>' +
      '<div class="set-row"><div class="set-k">登录方式</div><div class="set-v">' +
      (info && info.provider ? '第三方（' + esc(info.provider) + '）' : '邮箱 + 密码') + '</div></div>' +
      '<div class="set-row"><div class="set-k">会话</div><div class="set-v"><span class="set-sub">' +
      (info ? '设备 ' + esc(info.ua) + ' · 建立于 ' + new Date(info.at).toLocaleString('zh-CN') : '演示态无会话记录') +
      '</span></div></div>' +
      '<div class="set-row"><div class="set-k">单账号单会话</div><div class="set-v set-sub">同一账号同一时间只允许一条会话；' +
      '本浏览器已登录时不能直接换号，需要先退出。</div></div>' +
      '<div class="set-acts"><button type="button" class="btn ghost" data-act="go" data-route="profile">编辑资料</button>' +
      '<button type="button" class="btn" data-act="logout">退出登录</button></div></section>';
    const lookPanel =
      '<section class="set-sec" id="set-look"><h2>外观</h2>' +
      '<div class="set-row"><div class="set-k">主题</div><div class="set-v">' +
      '<div class="set-seg" role="group" aria-label="主题">' +
      '<button type="button" class="set-seg-btn' + (theme === 'day' ? ' on' : '') + '" data-act="settheme" data-v="day" aria-pressed="' + (theme === 'day') + '">☀️ 白天</button>' +
      '<button type="button" class="set-seg-btn' + (theme === 'night' ? ' on' : '') + '" data-act="settheme" data-v="night" aria-pressed="' + (theme === 'night') + '">🌙 夜间</button>' +
      '</div></div></div>' +
      '<div class="set-row"><div class="set-k">动效</div><div class="set-v set-sub">遵循系统的「减少动态效果」设置：开启后入场与滚动都直接跳转。</div></div>' +
      '</section>';
    const notifyPanel =
      '<section class="set-sec" id="set-notify"><h2>通知</h2>' +
      '<div class="set-row"><div class="set-k">消息提醒</div><div class="set-v"><button type="button" class="set-switch' +
      (S.noticesRead ? '' : ' on') + '" data-act="setnotify" role="switch" aria-checked="' + (!S.noticesRead) + '"><i></i></button>' +
      '<span class="set-sub">' + (S.noticesRead ? '已全部已读，红点已消失' : '顶栏铃铛上还有 3 条未读') + '</span></div></div>' +
      '</section>';
    const aboutPanel =
      '<section class="set-sec" id="set-about"><h2>关于</h2>' +
      '<div class="set-row"><div class="set-k">站点</div><div class="set-v">' + esc(BR.full) + '</div></div>' +
      '<div class="set-row"><div class="set-k">数据</div><div class="set-v set-sub">全部为虚构演示数据；登录态存在浏览器 localStorage。</div></div>' +
      '<div class="set-row"><div class="set-k">规则</div><div class="set-v"><button type="button" class="btn sm ghost" data-act="go" data-route="policy">转载与下架政策</button></div></div>' +
      '</section>';
    const panel = cur === 'set-look' ? lookPanel : cur === 'set-notify' ? notifyPanel : cur === 'set-about' ? aboutPanel : accPanel;
    return '<div class="wrap solo"><div class="set-wrap">' +
      '<aside class="set-side"><h1>设置</h1>' + nav + '</aside>' +
      '<div class="set-main"><div class="card"><div class="set-body">' + authErrHTML() + panel + '</div></div></div>' +
      '</div></div>';
  }

  function policyPage() {
    const secs = [
      ['我们转载什么', 'sec-what'],
      ['怎么转载', 'sec-how'],
      ['怎么下架', 'sec-takedown'],
      ['安全声明', 'sec-safe']
    ];
    return '<div class="doc-wrap">' +
      '<nav class="doc-nav"><div class="hd">转载与下架政策</div>' +
      secs.map(function (s, i) {
        return '<a href="javascript:;" class="' + (i === 0 ? 'on' : '') + '" data-act="docjump" data-sec="' + s[1] + '">' + (i + 1) + '. ' + s[0] + '</a>';
      }).join('') +
      '<a href="javascript:;" data-act="go" data-route="market">返回条目库</a></nav>' +
      '<div class="doc-body"><div class="card"><div class="card-bd">' +
      '<h1 class="sr-only">转载与下架政策</h1>' +
      '<p class="doc-lead">这份政策只用来说明操作：我们收什么、怎么存、你怎么让我们撤下来。不写法律声明，也不做警告弹窗。</p>' +

      '<h2 id="sec-what"><span class="no">1</span>我们转载什么</h2>' +
      '<p>条目一律先建、先写清事实，再决定给不给安装包。能不能转载，只看许可证与作者意愿两件事，不看我们喜欢不喜欢。</p>' +
      '<table class="doc-tb"><thead><tr><th>许可证</th><th>能否转载</th><th>要履行的义务</th></tr></thead><tbody>' +
      licenseRows.map(function (r) {
        const cls = r.dist === '可以' ? 'ok' : r.dist === '只放外链' ? 'no' : 'mid';
        return '<tr><td>' + esc(r.lic) + '</td><td class="' + cls + '">' + esc(r.dist) + '</td><td>' + esc(r.duty) + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      '<div class="doc-quote">许可证判定看仓库里的 LICENSE / COPYING 全文；没有就是没有，<b>不猜、不从 npm 字段推断、不假设作者愿意</b>。有冲突时以许可证文件为准。</div>' +

      '<h2 id="sec-how"><span class="no">2</span>怎么转载</h2>' +
      '<div class="doc-step"><span class="n">1</span><span class="tx"><b>原样取包。</b>优先上游 Release 的 .tgz 附件，其次 codeload 的 tar.gz，最后 npm pack。三种都失败就只建条目。</span></div>' +
      '<div class="doc-step"><span class="n">2</span><span class="tx"><b>不重打包。</b>不删 LICENSE、不改 package.json、不注入构建脚本。一个字节都不动，sha256 才和上游对得上。</span></div>' +
      '<div class="doc-step"><span class="n">3</span><span class="tx"><b>校验再上架。</b>先比上游 checksum，再核包内文件清单，最后跑依赖审计与可疑特征扫描。</span></div>' +
      '<div class="doc-step"><span class="n">4</span><span class="tx"><b>写清来源。</b>每个包都带文件名、大小、sha256、收录日期与原仓库地址，页面标「收录于 X 日，上游可能已更新」。</span></div>' +
      '<div class="doc-code">packages/&lt;包名&gt;/&lt;版本&gt;/&lt;原文件名&gt;.tgz\n# 私有读 + CDN 签名 URL，10 分钟过期，点击瞬间签发</div>' +
      '<p>作者认领后可以改成「自动跟随上游 tag」，也可以只手动上传。两条路都保留，选哪条是作者的权利。</p>' +

      '<h2 id="sec-takedown"><span class="no">3</span>怎么下架</h2>' +
      '<div class="doc-step"><span class="n">1</span><span class="tx"><b>任何页面都能举报。</b>四类固定选项：侵犯版权 / 含恶意代码 / 信息严重失实 / 其他。</span></div>' +
      '<div class="doc-step"><span class="n">2</span><span class="tx"><b>24 小时内先停分发。</b>文件置为「暂停分发」、从 CDN 撤下、条目保留，先把风险掐掉再讨论对错。</span></div>' +
      '<div class="doc-step"><span class="n">3</span><span class="tx"><b>给上传者 48 小时申辩。</b>核查后恢复、永久下架或转人工，全过程留档。</span></div>' +
      '<div class="doc-step"><span class="n">4</span><span class="tx"><b>公开记录。</b>下架记录只列插件名、日期和原因分类，不公开举报人。</span></div>' +
      '<div class="doc-quote">作者撤回授权也一样：从点下开关起算 24 小时内停止提供下载。已经下载到本地的文件我们收不回来，但会把条目页的下载入口立刻换成外链。</div>' +
      '<table class="doc-tb"><thead><tr><th>插件</th><th>下架日期</th><th>原因分类</th></tr></thead><tbody>' +
      '<tr><td>dsh-theme-lab</td><td>2026-09-28</td><td>侵犯版权</td></tr>' +
      '<tr><td>quick-ssh-helper</td><td>2026-09-11</td><td>含恶意代码</td></tr>' +
      '</tbody></table>' +

      '<h2 id="sec-safe"><span class="no">4</span>安全声明</h2>' +
      '<p>上架前一定会跑：依赖审计、<code>child_process</code> 与外连特征、代码混淆、挖矿特征、是否读 <code>.ssh</code> / <code>.env</code> / 浏览器数据目录。命中高危就阻断，转人工，放行必须写理由并存档。</p>' +
      '<p>扫描通过不等于包是安全的。本站署名「作者提供」的包表示来源可信，不表示我们为它的行为背书。装之前看一眼它要什么权限，永远是对的。</p>' +
      '<h3 style="font-size:14px;margin:16px 0 8px">上传时你要同意的五条</h3>' +
      '<ul class="doc-ul">' + grantTerms.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
      '<div class="doc-note">这份页面是演示数据，真实站点还要补齐实名、留存与通知-删除流程。</div>' +
      '</div></div></div></div>';
  }

  /* ---------- 社群（结构借鉴 Discourse / linux.do：分类 + 标签双维度、参与者、反应、楼层导航） ---------- */
  const CATS = D.categories, REACTS = D.REACTIONS, TAGCLOUD = D.tagCloud;

  function catOf(id) {
    return CATS.filter(function (c) { return c.id === id; })[0] || { id: 'other', name: '其他', icon: '💬', desc: '' };
  }
  /* 标签维度 = 主标签（tag）+ 附加标签（tags），去重后返回；
     这样左侧栏/顶部 chip 点「求助」既能命中主标签是求助的话题，也能命中打了 #求助 标签的 */
  function threadTags(t) {
    const list = [t.tag].concat(t.tags || []);
    return list.filter(function (x, i) { return x && list.indexOf(x) === i; });
  }
  /* 行内只展示「附加标签」：主标签已经用彩色 tag 显示，置顶/已关闭有独立徽章，重复出现只会挤宽度 */
  function extraTags(t) {
    return threadTags(t).filter(function (x) { return x !== t.tag && x !== '置顶' && x !== '公告置顶'; });
  }
  function kcount(n) { return n > 1000 ? (n / 1000).toFixed(1) + 'k' : n; }

  /* ---------- 分类 × 标签：去重与计数的唯一口径 ----------
     社群是「分类 + 标签」双维度，但 notice/guide/help 这三个分类的名字就是
     公告/经验/求助这三个主标签的同义词（映射表在 data.js 的 catTagAlias）。
     同义时只留彩色主标签，否则同一行会出现「求助」+「求助问答」两个近义标签，
     用户会以为被归进了两个分类。
     判据必须走映射表，不能用 c.name === t.tag 比字符串 —— 那只在「公告」一条上
     恰好成立（分类名「经验分享」永远不等于标签「经验」）。 */
  function catDupOf(t) {
    return catTagAlias[t.cat] === t.tag;
  }
  /* 话题计数口径：分类条、左栏、列表三处必须是同一个数。
     以前 cnt() 只数静态 threads，不数刚发的新帖，于是「全部 8」配着 9 行列表。 */
  function threadPool() { return S.newThreads.concat(threads); }
  function threadCountOf(id) {
    const all = threadPool();
    if (id === '全部') return all.length;
    return all.filter(function (t) { return t.cat === id; }).length;
  }
  function tagCountOf(tag) {
    if (tag === '全部') return threadPool().length;
    return threadPool().filter(function (t) { return threadTags(t).indexOf(tag) >= 0; }).length;
  }

  /* 反应条：Discourse reactions 的简化版，emoji 可点、计数随状态增减 */
  function reactBar(key, base) {
    const b = base || {};
    return '<div class="react-bar">' + REACTS.map(function (e) {
      const k = key + '|' + e;
      const on = S.reacts.has(k);
      const c = (b[e] || 0) + (on ? 1 : 0);
      return '<button class="react' + (on ? ' on' : '') + '" data-act="react" data-k="' + esc(k) + '" title="加一个 ' + e + ' 反应">' +
        '<span>' + e + '</span>' + (c > 0 ? '<b>' + c + '</b>' : '') + '</button>';
    }).join('') + '</div>';
  }

  function threadRow(t) {
    const u = users[t.user];
    const c = catOf(t.cat);
    const ps = (t.posters && t.posters.length ? t.posters : [t.user]).slice(0, 3);
    const more = (t.posters ? t.posters.length : 1) - ps.length;
    return '<div class="thread trow' + (t.unread ? ' is-new' : '') + '" data-act="thread" data-id="' + t.id + '">' +
      av(t.user, 38) +
      '<div class="th-main"><div class="th-title">' +
      (t.top ? '<span class="pin">置顶</span>' : '') +
      (t.closed ? '<span class="lock" title="已关闭回复">🔒</span>' : '') +
      (t.hot ? '<span class="th-hot">🔥</span>' : '') +
      '<span class="tt">' + esc(t.title) + '</span>' +
      (t.solved ? '<span class="solved">✓ 已解决</span>' : '') +
      (t.unread ? '<span class="new-dot">新</span>' : '') + '</div>' +
      /* 副标题与详情页 .tb-sub 同源同文案：作者写的 sub 优先，老数据没有 sub 才退回 excerpt。 */
      '<div class="th-ex">' + esc(t.sub || t.excerpt) + '</div>' +
      (t.plugin ? plugInline(t.plugin) : '') +
      '<div class="th-meta"><span class="tag ' + t.tag + '">' + t.tag + '</span>' +
      /* 分类与主标签同义时只留彩色标签（判据在 catDupOf，走 data.js 的映射表） */
      (catDupOf(t) ? '' : '<span class="cat-chip">' + c.icon + ' ' + esc(c.name) + '</span>') +
      extraTags(t).slice(0, 2).map(function (g) { return '<span class="tag-plain">#' + esc(g) + '</span>'; }).join('') +
      '<span class="byline"><span class="who">' + esc(u.name) + '</span><span class="dot">·</span><span class="when">' + esc(t.created) + '</span></span>' +
      (t.lastUser && t.lastUser !== t.user ? '<span class="lastr"><i>·</i>最后回复 ' + esc(users[t.lastUser].name) + '</span>' : '') +
      '</div></div>' +
      '<div class="trow-posters">' + ps.map(function (x) { return av(x, 22); }).join('') +
      (more > 0 ? '<span class="pmore">+' + more + '</span>' : '') + '</div>' +
      '<div class="th-stats"><div><b>' + num(t.replies) + '</b>回复</div>' +
      '<div class="vw">' + kcount(t.views) + ' 浏览</div>' +
      '<div class="lk">♥ ' + num(t.likes) + '</div></div></div>';
  }

  function forumPage() {
    let list = threadPool();
    if (S.scat !== '全部') list = list.filter(function (t) { return t.cat === S.scat; });
    if (S.ftag !== '全部') list = list.filter(function (t) { return threadTags(t).indexOf(S.ftag) >= 0; });
    if (S.q) {
      const q = S.q.toLowerCase();
      list = list.filter(function (t) {
        return (t.title + t.excerpt + threadTags(t).join(' ')).toLowerCase().indexOf(q) >= 0;
      });
    }
    if (S.fsort === '热门') list.sort(function (a, b) { return b.views - a.views; });
    else if (S.fsort === '回复') list.sort(function (a, b) { return b.replies - a.replies; });
    else if (S.fsort === '点赞') list.sort(function (a, b) { return b.likes - a.likes; });
    /* 置顶恒在最前，其余沿用上面排好的顺序（Array.prototype.sort 稳定） */
    list.sort(function (a, b) { return (b.top ? 1 : 0) - (a.top ? 1 : 0); });
    /* 计数只走 threadCountOf：分类条、左栏、列表三处同源，不再各数一遍 */
    const cnt = threadCountOf;
    const nf = S.composerOpen ? '<div class="card newthread-card"><div class="card-hd"><span class="t">发新帖</span></div><div class="card-bd">' +
      '<div class="form-grid">' +
      '<div class="form-row wide"><label>标题<span class="req">*</span></label><input id="nt-title" maxlength="60" placeholder="一句话说清问题 / 主题"></div>' +
      /* 副标题：和标题同一件事的两层表达 —— 标题给结论，副标题给范围/条件。
         它才是列表页 .th-ex 与详情页 .tb-sub 的共同来源，作者可自己写，不再由正文前 80 字硬切。 */
      '<div class="form-row wide"><label>副标题<span class="opt">（选填，一句话补充条件 / 范围）</span></label>' +
      '<input id="nt-sub" maxlength="80" placeholder="例：win + node22 下必现，附最小复现"><span class="form-hint">留空时自动取正文首句，最多 80 字</span></div>' +
      '<div class="form-row"><label>分类</label><select id="nt-cat">' + CATS.map(function (c) { return '<option value="' + c.id + '"' + (c.id === 'help' ? ' selected' : '') + '>' + c.icon + ' ' + esc(c.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-row"><label>主标签</label><select id="nt-tag">' + ['公告', '经验', '求助', '讨论', '教程', '周报'].map(function (x) { return '<option' + (x === '求助' ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' +
      '</div>' +
      '<div class="form-row wide" style="margin-top:12px"><label>正文<span class="req">*</span></label>' +
      '<textarea id="nt-body" rows="5" placeholder="带上版本 / 环境 / 报错原文，表述越具体越容易得到帮助（图片可粘贴或拖入）"></textarea>' +
      imgPrevHTML('ntprev', S.ntImages) +
      '<div class="nt-tools"><button class="tool" type="button" data-act="ntpick">🖼️ 插入图片' +
      ((S.ntImages || []).length ? '<i class="tool-n">' + S.ntImages.length + '</i>' : '') + '</button>' +
      '<input type="file" id="nt-file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden>' +
      '<span class="form-hint">最多 ' + IMG_MAX + ' 张，单张 ' + Math.round(IMG_MAX_BYTES / 1024 / 1024) + ' MB 以内</span></div></div>' +
      '<div class="form-act"><button class="btn sm ghost" data-act="ntcancel">取消</button><button class="btn" data-act="ntsubmit">发布</button></div>' +
      '</div></div>' : '';
    return '<div class="wrap">' + railHTML() + '<div class="col-main">' +
      '<div class="card">' +
      '<h1 class="sr-only">社群 · 全部版块</h1>' +
      '<div class="fcat-bar">' +
      '<div class="fcat' + (S.scat === '全部' ? ' on' : '') + '" data-act="fcat" data-cat="全部">📋 全部<span class="n">' + cnt('全部') + '</span></div>' +
      CATS.map(function (c) {
        return '<div class="fcat' + (S.scat === c.id ? ' on' : '') + '" data-act="fcat" data-cat="' + c.id + '">' +
          c.icon + ' ' + esc(c.name) + '<span class="n">' + cnt(c.id) + '</span></div>';
      }).join('') +
      '</div>' +
      '<div class="market-toolbar">' +
      '<div class="mkt-search">🔍<input id="forumq" placeholder="搜标题 / 摘要 / 标签" value="' + esc(S.q) + '"></div></div>' +
      '<div class="tagbar"><span class="lb">热门标签</span>' + TAGCLOUD.map(function (g) {
        return '<span class="tag-plain click' + (S.ftag === g ? ' on' : '') + '" data-act="ftag" data-tag="' + esc(g) + '">#' + esc(g) + '</span>';
      }).join('') + '</div>' +
      nf +
      '<div class="market-toolbar" style="padding-top:6px;padding-bottom:9px">' +
      '<div class="sorts">' + ['最新', '热门', '回复', '点赞'].map(function (s) {
        return '<button class="' + (S.fsort === s ? 'on' : '') + '" data-act="fsort" data-sort="' + s + '">' + s + '</button>';
      }).join('') + '</div>' +
      '<span class="feed-note">' + list.length + ' 个话题 · ' + (S.scat === '全部' ? '全部分类' : esc(catOf(S.scat).name)) +
        (S.ftag === '全部' ? '' : ' · 标签 ' + esc(S.ftag)) + '</span>' +
      '<button class="btn sm blue" style="margin-left:auto" data-act="newthread">+ 发新帖</button></div>' +
      '<div>' + (list.length ? list.map(threadRow).join('') : '<div class="empty"><span class="big">🔍</span>这个分类下还没有话题</div>') + '</div>' +
      '</div></div>' + forumSide() + '</div>';
  }

  function guidelineCard() {
    return '<div class="side-card"><div class="side-hd"><span class="t">社群准则</span><span class="mini">真诚 · 友善 · 团结 · 专业</span></div>' +
      '<div class="side-bd" style="padding:7px 13px 10px">' +
      D.guidelines.map(function (g) {
        return '<div class="gl-row"><div class="gl-ico">' + g.icon + '</div><div class="gl-tx"><b>' + esc(g.t) + '</b>' +
          '<span>' + esc(g.d) + '</span></div></div>';
      }).join('') + '</div></div>';
  }

  function forumSide() {
    const act = [['u3', '🥇', '42 帖 · 188 赞'], ['u1', '🥈', '31 帖 · 156 赞'], ['u5', '🥉', '24 帖 · 122 赞']];
    return '<aside class="col-side">' +
      guidelineCard() + hotCard() +
      '<div class="side-card"><div class="side-hd"><span class="t">本周活跃</span><span class="mini">按获赞</span></div>' +
      '<div class="side-bd" style="padding:8px 12px">' + act.map(function (x) {
        return '<div class="act-row"><span class="rk">' + x[1] + '</span>' + av(x[0], 30) +
          '<div class="act-tx"><b>' + esc(users[x[0]].name) + '</b><span>' + x[2] + '</span></div></div>';
      }).join('') + '</div></div></aside>';
  }

  function threadFloors(t) {
    const extra = S.newFloors[t.id] || [];
    if (t.id === 't1') return floors.concat(extra);
    return [
      { user: t.user, time: '今天 08:40', text: t.excerpt + '\n\n完整内容整理在下面，欢迎补充。', likes: 32, reactions: { '👍': 6 } },
      { user: 'u3', time: '今天 09:15', replyTo: t.user, text: '先顶一下，这个问题上周也有人在群里问过。结论是要先看宿主版本，再决定用哪套 API。', likes: 18, reactions: { '👍': 3, '🎉': 1 } },
      { user: 'u5', time: '今天 10:02', replyTo: 'u3', text: '补充一个坑：Windows 下路径分隔符处理不对会静默失败，记得打日志。', quote: users[t.user].name + '：完整内容整理在下面', likes: 9 },
      { user: 'u7', time: '今天 11:30', text: '收藏了，等一个可复现的最小示例。', likes: 4 }
    ].concat(extra);
  }

  function timelineCard(t, fs) {
    const n = fs.length + 1;
    return '<div class="side-card"><div class="side-hd"><span class="t">本帖导航</span><span class="mini">' + n + ' 楼</span></div>' +
      '<div class="side-bd tl-bd">' +
      '<div class="tl-bar"><i style="width:' + Math.round(100 / n) + '%"></i></div>' +
      '<div class="tl-row" data-act="jumpf" data-n="1"><span class="tl-n">1</span><span class="tl-t">主楼 · ' + esc(users[t.user].name) + '</span></div>' +
      fs.map(function (f, i) {
        const s = String(f.text).replace(/\s+/g, ' ').slice(0, 12);
        return '<div class="tl-row" data-act="jumpf" data-n="' + (i + 2) + '"><span class="tl-n">' + (i + 2) + '</span>' +
          '<span class="tl-t">' + esc(s) + '…</span></div>';
      }).join('') +
      '<button class="tl-back" data-act="go" data-route="forum">← 返回话题列表</button>' +
      '</div></div>';
  }

  /* 主楼配图：发新帖时插的图存在 t.images，和日志的 .imgs 用同一套格子与灯箱 */
  function threadImgsHTML(t) {
    const imgs = (t.images || []).filter(function (im) { return im && im.src; });
    if (!imgs.length) return '';
    const n = Math.min(imgs.length, 4);
    return '<div class="imgs n' + n + ' tb-imgs">' + imgs.slice(0, 4).map(function (im, idx) {
      return '<div class="ph real" data-act="lbt" data-tid="' + t.id + '" data-idx="' + idx + '">' +
        '<img src="' + esc(im.src) + '" alt="主楼配图 ' + (idx + 1) + '" loading="lazy" decoding="async"></div>';
    }).join('') + '</div>';
  }

  function threadPage(id) {
    const t = threads.filter(function (x) { return x.id === id; })[0] || S.newThreads.filter(function (x) { return x.id === id; })[0] || threads[0];
    const u = users[t.user];
    const fs = threadFloors(t);
    const c = catOf(t.cat);
    const total = fs.length + 1;
    const tkey = 't_' + t.id;
    const tips = ['阅读前请先看置顶的排查手册', '提问请带上版本 / 环境 / 报错原文', '解决了记得点「采纳」，方便后来人'];
    return '<div class="wrap">' + railHTML() + '<div class="col-main">' +
      '<div class="card"><div class="post-head">' +
      '<div class="crumb"><a href="javascript:;" data-act="go" data-route="forum">社群</a> › ' +
      '<a href="javascript:;" data-act="fcat" data-cat="' + c.id + '">' + esc(c.name) + '</a> › 正文</div>' +
      '<h1 class="th-title">' + (t.top ? '【置顶】' : '') + esc(t.title.replace('【置顶】', '')) + '</h1>' +
      /* 副标题：和列表页 .th-ex 是同一句话（同一个 t.sub 字段），详情页只是放大一档。
         以前详情页根本没有副标题，摘要被粘进正文第一段，三处层级自然对不上。 */
      (t.sub ? '<p class="tb-sub">' + esc(t.sub) + '</p>' : '') +
      '<div class="op-meta"><span class="tag ' + t.tag + '">' + t.tag + '</span>' +
      (catDupOf(t) ? '' : '<span class="cat-chip">' + c.icon + ' ' + esc(c.name) + '</span>') +
      extraTags(t).map(function (g) { return '<span class="tag-plain">#' + esc(g) + '</span>'; }).join('') +
      (t.solved ? '<span class="solved">✓ 已解决</span>' : '') +
      (t.closed ? '<span class="cat-chip">🔒 已关闭</span>' : '') + '</div>' +
      '<div style="display:flex;align-items:center;gap:10px;margin-top:12px">' + av(t.user, 36) +
      '<div><div style="display:flex;align-items:center;gap:6px"><b style="font-size:13px;color:var(--link)">' + esc(u.name) + '</b>' +
      userTags(u) + '</div><div style="font-size:11.5px;color:var(--txt-3)">' + esc(u.sig) + ' · ' +
      esc(t.created) + ' · ' + num(t.views) + ' 浏览 · ' + num(t.replies) + ' 回复</div></div>' +
      '<button class="btn sm ghost" style="margin-left:auto" data-act="follow">' + (S.follow ? '已关注' : '+ 关注') + '</button></div></div>' +
      '<div class="thread-body" id="f1">' +
      '<div class="tb-text">' +
      /* 新发的帖有真实正文就显示正文（摘要/副标题不再粘进正文）；
         演示数据没有 body，沿用那段固定的展开示例。 */
      esc(t.body || '下面按「加载顺序 → 命名空间 → 宿主版本」三条线展开：\n1. 先确认两个插件是否注册了同名命令；\n2. 再看端口 / 目录 / 缓存路径有没有重叠；\n3. 最后对齐 capability，不要相信文档里的版本号。') + '</div>' +
      threadImgsHTML(t) +
      reactBar(tkey + '_op', t.reactions) +
      (t.plugin ? plugInline(t.plugin) : '') +
      '<div class="tb-acts">' +
      '<button class="act ' + (S.liked.has(tkey) ? 'liked' : '') + '" data-act="tlike" data-id="' + t.id + '"><span class="ic">👍</span> 有帮助 ' + (t.likes + (S.liked.has(tkey) ? 1 : 0)) + '</button>' +
      '<button class="act" data-act="toast" data-msg="已收藏该帖"><span class="ic">⭐</span> 收藏</button>' +
      '<button class="act" data-act="toast" data-msg="链接已复制（演示）"><span class="ic">↗</span> 分享</button>' +
      '<span class="post-tip">💡 ' + esc(tips[t.id.charCodeAt(1) % tips.length]) + '</span></div></div></div>' +
      '<div class="card"><div class="card-hd"><span class="t">全部回复</span><span class="more">共 ' + total + ' 楼 · ' + fs.length + ' 条已展示回复</span></div>' +
      fs.map(function (f, i) {
        const fu = users[f.user];
        const n = i + 2;
        const acc = t.solved && i === 1;
        const fk = t.id + '_' + i;
        return '<div class="floor" id="f' + n + '"><span class="floor-no">#' + n + (i === 0 ? ' <b>沙发</b>' : '') + '</span>' +
          av(f.user, 40) + '<div class="floor-main"><div class="floor-hd"><span class="nm">' + esc(fu.name) + '</span>' +
          userTags(fu) + (acc ? '<span class="solved">✓ 采纳答案</span>' : '') +
          '<span class="ft">' + esc(f.time) + '</span>' +
          (f.replyTo ? '<span class="replyto" data-act="quote" data-name="' + esc(users[f.replyTo].name) + '">↩ 回复 @' + esc(users[f.replyTo].name) + '</span>' : '') +
          '</div><p>' + esc(f.text) + '</p>' +
          (f.quote ? '<div class="quote">' + esc(f.quote) + '</div>' : '') +
          reactBar(fk, f.reactions) +
          '<div class="floor-actions"><button data-act="flike" data-k="' + fk + '">' +
          (S.floorLiked.has(fk) ? '❤️ 已赞' : '👍 赞') + ' ' + (f.likes + (S.floorLiked.has(fk) ? 1 : 0)) + '</button>' +
          '<button data-act="quote" data-name="' + esc(fu.name) + '">回复</button>' +
          '<button data-act="toast" data-msg="已复制本楼链接（演示）">复制链接</button>' +
          '<button data-act="toast" data-msg="举报已提交（演示）">举报</button></div></div></div>';
      }).join('') +
      (t.closed
        ? '<div class="reply-closed">🔒 该话题已关闭，不再接受新回复。<button class="btn sm ghost" data-act="toast" data-msg="申请已提交（演示）">申请开放</button></div>'
        : '<div class="replybox"><textarea id="reply" placeholder="友善发言，理性讨论～（Ctrl / ⌘ + Enter 快捷发表）"></textarea>' +
          '<div class="row"><div style="display:flex;gap:6px">' +
          '<button class="tool" type="button" data-act="emoji">😊 表情</button>' +
          '<button class="tool" type="button" data-act="toast" data-msg="回复暂不支持配图，需要配图请发新帖或写日志">🖼️ 图片</button>' +
          '<button class="tool" type="button" data-act="mention">＠ 提及</button>' +
          '<button class="tool" type="button" data-act="rpquote">🔗 引用</button></div>' +
          '<span class="reply-hint">支持 Markdown</span>' +
          '<button class="btn" data-act="reply">发表回复</button></div></div>') +
      '</div></div>' + threadSide(t, fs) + '</div>';
  }

  function threadSide(t, fs) {
    const u = users[t.user];
    return '<aside class="col-side">' +
      '<div class="side-card"><div class="side-hd"><span class="t">关于作者</span></div><div class="side-bd">' +
      '<div style="display:flex;gap:10px;align-items:center">' + av(t.user, 48) +
      '<div><div style="font-weight:700;font-size:13.5px">' + esc(u.name) + '</div>' +
      '<div style="font-size:11.5px;color:var(--txt-3)">Lv.' + u.level + ' · ' + esc(u.badge || '普通用户') + '</div></div></div>' +
      '<div style="font-size:12.5px;color:var(--txt-2);margin-top:10px">' + esc(u.sig) + '</div>' +
      '<div class="me-stats"><div><b>' + fmt(u.fans) + '</b><span>粉丝</span></div><div><b>' + u.follows + '</b><span>关注</span></div><div><b>' + fmt(u.visits) + '</b><span>访问</span></div></div>' +
      '<button class="btn sm blue" style="width:100%;margin-top:11px" data-act="user" data-uid="' + t.user + '">进入 TA 的空间</button></div></div>' +
      timelineCard(t, fs) +
      '<div class="side-card"><div class="side-hd"><span class="t">相关话题</span></div><div class="side-bd" style="padding:6px 10px">' +
      threads.filter(function (x) { return x.id !== t.id; }).slice(0, 4).map(function (x) {
        return '<div class="hot-item" data-act="thread" data-id="' + x.id + '"><span class="hx"><b>' + esc(x.title) + '</b>' +
          '<span>' + num(x.replies) + ' 回复 · ' + esc(x.last) + '</span></span></div>';
      }).join('') +
      '</div></div>' + noticeSide() + '</aside>';
  }

  /* ---------- 个人空间 ---------- */
  /* ---------- 编辑资料（参考 B 站个人中心：左侧分区 + 右侧表单 + 实时预览） ----------
     资料存在账号上：S.accounts[当前 uid] = { profile, avatar, cover }；
     编辑过程写在 S.draft 里，点保存才写回，点取消直接丢掉草稿，切账号也丢。 */
  /* 任何账号的资料都从这里算：改过就读账号里的，没改过用 data.js 里的底稿。
     地区跟着账号走 —— 底稿里的城市来自 users，省从省市表反查，不读浏览器信息。 */
  function profileOf(uid) {
    const k = uid || S.account;
    const u = users[k] || users.u1;
    const p = (S.accounts[k] && S.accounts[k].profile) || {};
    return {
      nick: p.nick || u.name,
      sig: p.sig || u.sig,
      gender: p.gender || '保密',
      province: p.province || u.prov || provOfCity(u.city),
      city: p.city || p.loc || u.city,
      job: p.job || u.job || '独立开发者',
      birthday: p.birthday || u.birth || '1998-06',
      tags: Array.isArray(p.tags) ? p.tags : (u.tags || ['插件开发']),
      interests: Array.isArray(p.interests) ? p.interests : ['插件开发', '界面设计']
    };
  }
  function draftOf() {
    if (!S.draft) S.draft = JSON.parse(JSON.stringify(profileOf(ME())));
    return S.draft;
  }
  const PRO_SECTIONS = [
    ['pro-av', '头像与封面'], ['pro-base', '基本资料'], ['pro-area', '地区与职业'],
    ['pro-tags', '标签与擅长'], ['pro-prev', '效果预览']
  ];
  function chipsOf(list, cur, act, kind) {
    return '<div class="chips">' + list.map(function (v) {
      const on = (cur || []).indexOf(v) >= 0;
      return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-act="' + act + '"' +
        (kind ? ' data-kind="' + kind + '"' : '') + ' data-id="' + esc(v) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(v) + '</button>';
    }).join('') + '</div>';
  }
  function profilePage() {
    const k = ME();
    const u = users[k] || users.u1;
    const d = draftOf();
    const o = profileOptions;
    const ava = meAva();
    const cities = o.provinces[d.province] || [];
    if (cities.length && cities.indexOf(d.city) < 0) d.city = cities[0];
    const preset = o.avatarPresets.map(function (a, i) {
      return '<button type="button" class="ava-opt' +
        (ava && !ava.img && ava.grad === a.grad && ava.emoji === a.emoji ? ' on' : '') +
        '" data-act="avapick" data-id="' + i + '" aria-label="使用预设头像 ' + (i + 1) + '" aria-pressed="' +
        (ava && !ava.img && ava.grad === a.grad && ava.emoji === a.emoji ? 'true' : 'false') + '">' +
        '<img src="' + avatarURL(a) + '" width="46" height="46" alt=""></button>';
    }).join('');
    const covers = o.covers.map(function (c, i) {
      return '<button type="button" class="cover-opt' + (meCover() === c.grad ? ' on' : '') +
        '" data-act="coverpick" data-id="' + i + '" aria-label="使用封面 ' + esc(c.note) + '" aria-pressed="' +
        (meCover() === c.grad ? 'true' : 'false') + '" style="background:' + c.grad + '">' +
        '<span>' + esc(c.note) + '</span></button>';
    }).join('');
    const cityOpts = cities.map(function (c) {
      return '<option value="' + esc(c) + '"' + (d.city === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');

    const secAv = '<section class="pro-sec" id="pro-av"><h2>头像与封面</h2>' +
      '<p class="pro-tip">头像支持上传本地图片（会裁成方形并压到 200px，只存在本机浏览器里）。</p>' +
      '<div class="ava-row"><div class="ava-big">' + av(k, 96) +
        '<button type="button" class="ava-edit" data-act="avafile" aria-label="上传本地头像">更换</button></div>' +
        '<div class="ava-right"><div class="pro-label">选择预设</div><div class="ava-grid">' + preset + '</div>' +
        '<div class="ava-acts"><button type="button" class="btn sm blue" data-act="avafile">上传图片</button>' +
        '<button type="button" class="btn sm ghost" data-act="avaclear">恢复默认</button>' +
        '<input type="file" id="ava-file" accept="image/*" hidden>' +
        '<span class="pro-hint" aria-live="polite">' + esc(S.fileErr || '支持 JPG / PNG / WebP，最大 4 MB') + '</span></div></div></div>' +
      '<div class="pro-label" style="margin-top:16px">空间封面</div>' +
      '<div class="cover-grid">' + covers + '</div></section>';

    const secBase = '<section class="pro-sec" id="pro-base"><h2>基本资料</h2>' +
      '<div class="pro-grid">' +
      '<label class="pro-field"><span>昵称<i>*</i></span>' +
      '<input id="pro-nick" type="text" maxlength="16" value="' + esc(d.nick) + '" placeholder="1~16 个字符">' +
      '<em class="pro-count" id="pro-nick-n">' + d.nick.length + ' / 16</em></label>' +
      '<div class="pro-field"><span>性别</span><div class="chips">' + o.genders.map(function (g) {
        return '<button type="button" class="chip' + (d.gender === g ? ' on' : '') + '" data-act="progender" data-id="' + esc(g) +
          '" aria-pressed="' + (d.gender === g ? 'true' : 'false') + '">' + esc(g) + '</button>';
      }).join('') + '</div></div>' +
      '<label class="pro-field"><span>生日</span><input id="pro-birth" type="month" value="' + esc(d.birthday) + '"></label>' +
      '<label class="pro-field wide"><span>个性签名</span>' +
      '<textarea id="pro-sig" maxlength="60" rows="3" placeholder="一句话介绍自己">' + esc(d.sig) + '</textarea>' +
      '<em class="pro-count" id="pro-sig-n">' + d.sig.length + ' / 60</em></label>' +
      '</div></section>';

    const secArea = '<section class="pro-sec" id="pro-area"><h2>地区与职业</h2>' +
      '<div class="pro-grid">' +
      '<label class="pro-field"><span>所在省 / 直辖市</span><select id="pro-prov">' +
      Object.keys(o.provinces).map(function (k) {
        return '<option value="' + esc(k) + '"' + (d.province === k ? ' selected' : '') + '>' + esc(k) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="pro-field"><span>城市</span><select id="pro-city">' + cityOpts + '</select></label>' +
      '<label class="pro-field"><span>职业</span><select id="pro-job">' + o.jobs.map(function (j) {
        return '<option' + (d.job === j ? ' selected' : '') + '>' + esc(j) + '</option>';
      }).join('') + '</select></label>' +
      '<div class="pro-field"><span>注册时间</span><input type="text" value="2024-11-08" disabled aria-label="注册时间，不可修改"></div>' +
      '</div></section>';

    const secTags = '<section class="pro-sec" id="pro-tags"><h2>标签与擅长</h2>' +
      '<div class="pro-label">擅长（最多 6 个）</div>' + chipsOf(o.tags, d.tags, 'protag', 'tags') +
      '<div class="pro-label" style="margin-top:14px">感兴趣的方向</div>' + chipsOf(o.interests, d.interests, 'protag', 'interests') +
      '</section>';

    const secPrev = '<section class="pro-sec" id="pro-prev"><h2>效果预览</h2>' +
      '<p class="pro-tip">下面是别人在你的空间里看到的资料卡，保存后同步到「我的空间」。</p>' +
      '<div class="prev-card"><div class="prev-cover"' + (meCover() ? ' style="background:' + meCover() + '"' : '') + '></div>' +
      '<div class="prev-body">' + av(k, 64) +
      '<div class="prev-tx"><b>' + esc(d.nick) + '</b><span class="tag-badge">' + esc(d.job) + '</span>' +
      '<p>' + esc(d.sig || '这个人很懒，什么都没写。') + '</p>' +
      '<div class="prev-meta">' + esc(d.province + ' ' + d.city) + ' · ' + esc(d.gender) + ' · ' + esc(d.birthday) + '</div>' +
      '<div class="prev-tags">' + d.tags.map(function (t) { return '<span class="tag-plain">#' + esc(t) + '</span>'; }).join('') + '</div>' +
      '</div></div></div></section>';

    return '<div class="wrap deep">' + seaHTML() + railHTML() + '<div class="col-main">' +
      '<div class="card pro-page"><div class="card-hd"><h1 class="t">编辑资料</h1>' +
      '<span class="more">分区修改，点保存才生效</span></div>' +
      '<div class="pro-wrap"><nav class="pro-nav" aria-label="资料分区">' +
      PRO_SECTIONS.map(function (x, i) {
        return '<a href="javascript:;" data-act="projump" data-id="' + x[0] + '"' + (i === 0 ? ' class="on"' : '') + '>' + x[1] + '</a>';
      }).join('') + '</nav><div class="pro-body">' + secAv + secBase + secArea + secTags + secPrev + '</div></div>' +
      '<div class="pro-foot"><span class="pro-hint">资料只保存在这台机器的 localStorage 里，不会上传。</span>' +
      '<button type="button" class="btn ghost" data-act="proreset">恢复默认</button>' +
      '<button type="button" class="btn" data-act="procancel">取消</button>' +
      '<button type="button" class="btn blue" data-act="prosave">保存资料</button></div></div></div>' +
      '<aside class="col-side"><div class="side-card"><div class="side-hd"><span class="t">资料完整度</span></div>' +
      '<div class="side-bd">' + proMeter(d) + '</div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">小提示</span></div><div class="side-bd">' +
      '<p class="pro-tip" style="margin:0">昵称和头像会出现在你发的日志、社群帖子和插件条目上；封面只影响空间页与右侧名片。</p>' +
      '</div></div></aside></div>';
  }
  /* 左侧「资料完整度」：填得越满越高，纯粹给个正反馈 */
  function proMeter(d) {
    const items = [
      ['昵称', !!(d.nick && d.nick.length >= 2)], ['签名', !!(d.sig && d.sig.length >= 6)],
      /* 头像是画布生成的、封面有默认渐变，所以这里数的是「自己换过的」而不是「有没有」 */
      ['自定义头像', !!meAva()], ['自定义封面', !!meCover()], ['地区', !!(d.province && d.city)],
      ['职业', !!d.job], ['标签', d.tags.length > 0], ['兴趣', d.interests.length > 0]
    ];
    const done = items.filter(function (x) { return x[1]; }).length;
    const pct = Math.round(done / items.length * 100);
    return '<div class="meter-row"><div class="meter"><i style="width:' + pct + '%"></i></div><b>' + pct + '%</b></div>' +
      '<ul class="meter-list">' + items.map(function (x) {
        return '<li class="' + (x[1] ? 'ok' : '') + '">' + (x[1] ? '✓' : '○') + ' ' + x[0] + '</li>';
      }).join('') + '</ul>';
  }

  function spacePage(uid) {
    const u = users[uid] || users[S.account] || users.u1;
    /* u1 是「我自己」：昵称/签名优先读已保存的编辑资料 */
    const pf = profileOf(uid);
    const mine = posts.filter(p => p.user === uid);
    const myPlugins = plugins.filter(p => p.author === uid);
    const tabs = ['日志', '插件', '相册', '留言'];
    let body = '';
    if (S.tab === '日志') {
      body = mine.length ? mine.map(postHTML).join('') : '<div class="empty"><span class="big">📝</span>还没有发过日志</div>';
    } else if (S.tab === '插件') {
      const pubBar = (uid === ME())
        ? '<div class="pub-cta"><div><b>把自己的插件挂到条目库</b><span>填表 → 上传安装包 → 等审核，和 GitHub 新建仓库一个流程。</span></div>' +
          '<button class="btn sm blue" data-act="go" data-route="publish">+ 发布插件</button></div>'
        : '';
      body = pubBar + (myPlugins.length ? '<div class="mkt-grid" style="padding:14px">' + myPlugins.map(pluginCard).join('') + '</div>'
        : '<div class="empty"><span class="big">🧩</span>还没有发布插件</div>');
    } else if (S.tab === '相册') {
      const gs = ['linear-gradient(135deg,#ff9a6c,#ff5f8f)', 'linear-gradient(135deg,#7dd3fc,#4f46e5)', 'linear-gradient(135deg,#a78bfa,#f472b6)',
        'linear-gradient(135deg,#5eead4,#0ea5e9)', 'linear-gradient(135deg,#fde68a,#f59e0b)', 'linear-gradient(135deg,#34d399,#0ea5e9)',
        'linear-gradient(135deg,#fbcfe8,#a78bfa)', 'linear-gradient(135deg,#94a3b8,#334155)', 'linear-gradient(135deg,#f472b6,#7c3aed)'];
      body = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:14px">' +
        gs.map((g, i) => '<div class="ph art" style="aspect-ratio:1/1;border-radius:7px;background:' + g + '" data-act="lb" data-pid="al" data-idx="' + i + '">' +
          '<span class="cap">相册 0' + (i + 1) + '</span></div>').join('') + '</div>';
    } else {
      const m = S.msgs[uid] || [];
      body = '<div style="padding:4px 0">' + m.map((g, i) =>
        '<div class="floor" style="padding:13px 20px"><span class="floor-no">#' + (i + 1) + '</span>' + av(g.user, 36) +
        '<div class="floor-main"><div class="floor-hd"><span class="nm">' + esc(profileOf(g.user).nick) + '</span>' +
        userTags(users[g.user] || users.u1) + '<span>' + esc(g.time) + '</span></div>' +
        '<p>' + esc(g.text) + '</p></div></div>').join('') +
        visitors.slice(0, 6).map((v, i) =>
        '<div class="floor" style="padding:13px 20px"><span class="floor-no">#' + (m.length + i + 1) + '</span>' + av(v.user, 36) +
        '<div class="floor-main"><div class="floor-hd"><span class="nm">' + esc(users[v.user].name) + '</span>' +
        userTags(users[v.user]) + '<span>' + esc(v.time) + '</span></div>' +
        '<p>' + esc(['插件做得太漂亮了，求带！', '大佬什么时候更新下一版？', '已 star，坐等文档。', '这个渲染速度是真的猛。', '空间皮肤好看，求同款。', '来串门～'][i % 6]) + '</p></div></div>').join('') +
        '<div class="replybox" style="border-top:1px solid var(--line-2)"><textarea id="reply" placeholder="给 TA 留言…"></textarea>' +
        '<div class="row"><span>留言会公开显示</span><button class="btn" data-act="reply">发表留言</button></div></div></div>';
    }

    /* 自己选的封面优先：空间页头图与右侧名片用同一张 */
    const myCover = acct(uid).cover || '';
    const cvStyle = myCover ? ' style="background:' + myCover + '"' : '';
    const mine0 = uid === ME();
    return '<div class="wrap deep">' + seaHTML() + railHTML() + '<div class="col-main">' +
      '<div class="prof-cover' + (cvStyle ? ' custom' : '') + '"><div class="layer"' + cvStyle + '></div><div class="grid-lines"></div>' +
      '<div class="prof-id">' + av(uid, 96) + '<div><h1 class="sr-only">' + esc(pf.nick) + '的个人空间</h1><h2>' + esc(pf.nick) +
      (u.badge ? '<span class="tag-badge ' + badgeCls(u.badge) + '">' + u.badge + '</span>' : '') + '</h2>' +
      '<p>' + esc(pf.sig) + '</p><div class="stat-row" style="margin-top:8px">' +
      '<div class="s"><b>' + num(u.fans) + '</b><span>粉丝</span></div>' +
      '<div class="s"><b>' + u.follows + '</b><span>关注</span></div>' +
      '<div class="s"><b>' + fmt(u.visits) + '</b><span>访客</span></div></div></div></div></div>' +
      '<div class="card"><div class="tabs">' + tabs.map(t =>
        '<button class="tab ' + (S.tab === t ? 'on' : '') + '" data-act="stab" data-tab="' + t + '">' + t + '</button>').join('') +
      '<span class="spacer"></span>' + (mine0
        ? '<button class="btn sm ghost" data-act="go" data-route="profile">✎ 编辑资料</button>'
        : '<button class="btn sm ghost" data-act="toast" data-msg="已发送关注请求（演示）">+ 关注</button>') + '</div>' +
      '<div class="feed">' + body + '</div></div></div>' + spaceSide(uid) + '</div>';
  }

  /* 「个人资料」卡：每个账号都读自己的资料（改过的优先，没改过用 data.js 底稿） */
  function kvRows(uid) {
    const pf = profileOf(uid);
    const u = users[uid] || users.u1;
    return [['昵称', pf.nick], ['等级', 'Lv.' + u.level + ' · ' + pf.job + (u.badge ? ' · ' + u.badge : '')], ['城市', pf.province + ' ' + pf.city],
      ['生日', pf.birthday], ['签名', pf.sig], ['擅长', pf.tags.slice(0, 3).join(' / ') || '—']];
  }
  /* ---------- 撰稿人（仿 GitHub Contributors）：头像格 + 提交柱状 + 图例 ---------- */
  /* 贡献数用 uid 做确定性散列，刷新不会跳来跳去；数据全部来自 users / visitors。 */
  function contribOf(uid) {
    const people = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'].filter(function (k) { return k !== uid; });
    const pool = [uid].concat(people);
    return pool.map(function (k, i) {
      const n = ((k.charCodeAt(1) * 37 + i * 11) % 47) + 3;
      return { uid: k, n: n };
    }).sort(function (a, b) { return b.n - a.n; });
  }
  function contribCard(uid) {
    const list = contribOf(uid);
    const shown = list.slice(0, 9);
    const more = list.length - shown.length;
    const total = list.reduce(function (s, x) { return s + x.n; }, 0);
    const u = users[uid] || users.u1;
    /* 近 12 周提交分布：用 uid 做种子，保证每次渲染一致 */
    const seed = uid.charCodeAt(1) || 7;
    const bars = Array.from({ length: 12 }, function (_, i) {
      const h = 16 + ((seed * (i + 3) * 7) % 84);
      return '<i style="height:' + h + '%" title="第 ' + (i + 1) + ' 周 · ' + Math.round(h / 3) + ' 次"></i>';
    }).join('');
    return '<div class="side-card"><div class="side-hd"><span class="t">撰稿人</span>' +
      '<a href="javascript:;" data-act="toast" data-msg="完整贡献榜还在做（演示）">全部 ›</a></div>' +
      '<div class="side-bd"><div class="contrib-sum"><b>' + list.length + '</b>' +
        '<span>位贡献者 · 近 12 周 ' + total + ' 次提交</span></div>' +
      '<div class="cn-grid">' + shown.map(function (x) {
        return '<button type="button" class="cn-cell" data-act="user" data-uid="' + x.uid + '" ' +
          'aria-label="查看 ' + esc(users[x.uid].name) + ' 的空间，' + x.n + ' 次提交" title="' + esc(users[x.uid].name) + ' · ' + x.n + ' 次提交">' +
          av(x.uid, 56, 'cn-av') + '<span class="cn-n">' + x.n + '</span></button>';
      }).join('') + (more > 0 ? '<button type="button" class="cn-cell" data-act="toast" data-msg="还有 ' + more +
        ' 位贡献者（演示）" aria-label="还有 ' + more + ' 位贡献者"><span class="cn-more">+' + more + '</span></button>' : '') +
      '</div>' +
      '<div class="cn-bars">' + bars + '</div>' +
      '<div class="cn-legend"><span>近 12 周提交</span><span class="lv"><i></i>相对活跃度</span></div>' +
      '<div class="cn-foot">最近一次贡献 <b>' + esc((visitors[0] && visitors[0].time) || '刚刚') + '</b>' +
        ' · 这个空间累计被访问 <b>' + fmt(u.visits) + '</b> 次</div>' +
      '</div></div>';
  }
  function spaceSide(uid) {
    return '<aside class="col-side"><div class="side-card"><div class="side-hd"><span class="t">个人资料</span></div><div class="side-bd">' +
      '<dl class="kv">' + kvRows(uid).map(f => '<dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd>').join('') + '</dl></div></div>' +
      contribCard(uid) + pluginFilesCard() + '</aside>';
  }

  /* ---------- 灯箱 ---------- */
  function lightboxHTML() {
    if (!S.lb) return '<div class="lightbox" aria-hidden="true"><button class="x" tabindex="-1" aria-hidden="true">✕</button><div class="stage"></div></div>';
    const g = S.lb.grad;
    const cap = S.lb.title || '图片预览';
    const pic = S.lb.src
      ? '<img class="lb-img" src="' + S.lb.src + '" alt="' + esc(cap) + '" decoding="async">'
      : '';
    return '<div class="lightbox" data-lb="1" role="dialog" aria-modal="true" aria-label="' + esc(cap) + '">' +
      '<button class="x" type="button" data-act="close-lb" aria-label="关闭预览（Esc）">✕</button>' +
      '<div class="stage' + (pic ? ' has-img' : '') + '" style="background:' + g + '">' + pic +
      '<div class="cap2">' + esc(S.lb.title || '') + (S.lb.note ? '<small>' + esc(S.lb.note) + '</small>' : '') + '</div></div></div>';
  }

  /* 把 .wrap 标成入场态：整页切换时给首屏两组卡片加编排，其他情况原样返回 */
  function enterWrap(html) {
    return html.replace('<div class="wrap', '<div class="wrap enter');
  }

  /* 下拉退场：先移除 .open 让它反向过渡，再删状态。
     高频点击的元素用 transition 而不是 keyframes，重复开关不会重播。 */
  function closePop() {
    const pop = qs('.pop');
    if (!pop) { S.pop = null; render(true); return; }
    pop.classList.remove('open');
    setTimeout(() => { S.pop = null; render(true); }, 180);
  }

  /* 灯箱退场：先跑 closing，动画结束后再清状态重绘（入场/退场对称） */
  let lbClosing = false;
  let lbReturnFocus = null;
  function closeLightbox() {
    if (!S.lb || lbClosing) return;
    const box = qs('.lightbox.open');
    if (!box) { S.lb = null; render(true); return; }
    lbClosing = true;
    box.classList.add('closing');
    box.classList.remove('open');
    setTimeout(() => {
      lbClosing = false;
      S.lb = null;
      document.body.classList.remove('lb-open');
      render(true);
      /* 关掉后焦点回到触发的那张图上，键盘用户不至于掉回页首 */
      if (lbReturnFocus) {
        const back = qs('[data-act="lb"][data-pid="' + lbReturnFocus.split('|')[1] + '"][data-idx="' + lbReturnFocus.split('|')[2] + '"]');
        if (back) back.focus({ preventScroll: true });
      }
      lbReturnFocus = null;
    }, 200);
  }

  /* ---------- 发布插件（仿 GitHub 新建仓库）：一张表把条目建完 ---------- */
  function pubOf() {
    if (!S.pub || typeof S.pub !== 'object') {
      S.pub = { name: '', desc: '', owner: ME(), visibility: 'public', cat: '创作', license: 'MIT', ver: '0.1.0', init: ['readme'], agreed: [], file: null, stage: '' };
    }
    if (!S.pub.owner) S.pub.owner = ME();
    return S.pub;
  }
  function pubNameOk(n) { return /^[a-z0-9][a-z0-9-]{1,38}$/.test(n); }
  /* 拖拽区 / 已选文件块：抽出来是为了选完文件只换这一块，不整页重绘（重绘会丢输入焦点） */
  function pubFileBlock(pb) {
    return pb.file
      ? '<div class="pub-file"><span class="pf-ic" aria-hidden="true">📦</span>' +
        '<span class="pf-tx"><b>' + esc(pb.file.name) + '</b><br>' + esc(pb.file.size) + ' · sha256 ' + esc(pb.file.sha) + '</span>' +
        '<button type="button" class="pf-x" data-act="pubclear" aria-label="移除这个包">✕</button></div>'
      : '<button type="button" class="pub-drop" data-act="pubdrop"><span class="pd-ic" aria-hidden="true">⬆</span>' +
        '<span class="pd-t">把 .tgz 拖进来，或者点这里选文件</span>' +
        '<span class="pd-d">只收 .tgz / .zip，单个不超过 20 MB（演示站点不会真的上传）</span></button>';
  }

  /* 任何一处表单变化后，只重算「提交键可用态 + 还差什么 + 条款提示」这三处 DOM */
  function recalcPub() {
    const pb = pubOf();
    const ready = pubReady(pb);
    const btn = qs('[data-act="pubsubmit"]');
    if (btn) {
      btn.disabled = !ready;
      if (ready) btn.removeAttribute('aria-disabled'); else btn.setAttribute('aria-disabled', 'true');
    }
    const hint = qs('.pub-foot .pub-hint');
    if (hint) {
      hint.textContent = ready ? '条件都满足了，点右边创建。' : '还差：' + [
        pubNameOk(pb.name) ? '' : (pb.name ? '包名格式' : '包名'),
        pb.file ? '' : '安装包',
        pb.agreed.length >= 4 ? '' : '发布条款'
      ].filter(Boolean).join(' / ');
    }
    const tip = qs('.pub-terms-tip');
    if (tip) { if (pb.agreed.length >= 4) tip.setAttribute('hidden', ''); else tip.removeAttribute('hidden'); }
  }

  function pubReady(pb) {
    return pubNameOk(pb.name) && pb.agreed.length >= 4 && !!pb.file;
  }
  function publishPage() {
    const pb = pubOf();
    const me = profileOf(ME());
    const okName = pubNameOk(pb.name);
    const cats = pluginCats.slice();
    const lics = ['MIT', 'Apache-2.0', 'MPL-2.0', 'GPL-3.0', 'AGPL-3.0', '未声明'];
    const terms = [
      '我确认这个仓库是我自己的，或者我有权分发它。',
      '包内不含密钥、token、他人隐私数据。',
      '许可证与仓库里的 LICENSE 一致；没有 LICENSE 就选「未声明」。',
      '同意社群编辑条目正文，版本与下载由我维护。'
    ];
    const agreeAll = pb.agreed.length >= terms.length;
    const ready = pubReady(pb);

    /* 左侧表单 */
    const nameRow = '<div class="pub-row">' +
      '<div class="pub-owner"><select id="pub-owner" aria-label="发布到哪个账号">' +
      ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'].map(function (k) {
        return '<option value="' + k + '"' + (pb.owner === k ? ' selected' : '') + '>' + esc(profileOf(k).nick) + '（' + esc(users[k].city) + '）</option>';
      }).join('') + '</select></div>' +
      '<div><input id="pub-name" type="text" maxlength="39" spellcheck="false" autocomplete="off"' +
      ' value="' + esc(pb.name) + '" placeholder="dsh-my-plugin" aria-label="插件包名"' +
      ' aria-describedby="pub-name-tip"></div></div>' +
      '<p class="pub-tip" id="pub-name-tip">' + (okName
        ? '包名可用：' + (pb.name ? '<b>' + esc(pb.name) + '</b>' : '<b>待填写</b>') + ' · 装好后命令是 <b>pnpm dsh add ' + esc(pb.name || 'dsh-my-plugin') + '</b>'
        : (pb.name ? '只能用<strong>小写字母、数字、连字符</strong>，2~39 个字符，且以字母或数字开头。' : '包名决定安装命令，建议 <b>dsh-</b> 开头，全小写。')) + '</p>';

    const visBlock = '<div class="pub-radios" role="radiogroup" aria-label="可见性">' +
      ['public', 'private'].map(function (v) {
        const on = pb.visibility === v;
        const t = v === 'public'
          ? ['公开', '任何人在条目库里都能搜到，安装包按你授权的档位分发。<span class="tag-free">免费</span>']
          : ['私有', '只有你自己能在「我的插件」里看到，适合内部工具或还没写完的东西。'];
        return '<button type="button" class="pub-radio ' + (on ? 'on' : '') + '" data-act="pubvis" data-v="' + v + '" role="radio" aria-checked="' + on + '">' +
          '<span class="dot" aria-hidden="true"></span><span class="rt"><b>' + t[0] + '</b><span>' + t[1] + '</span></span></button>';
      }).join('') + '</div>';

    const catBlock = '<div class="chips" style="margin-top:2px">' + cats.map(function (c) {
      return '<button type="button" class="chip ' + (pb.cat === c ? 'on' : '') + '" data-act="pubcat" data-v="' + c + '"' +
        ' aria-pressed="' + (pb.cat === c) + '">' + c + '</button>';
    }).join('') + '</div>';

    const dropBlock = pubFileBlock(pb);

    const termsBlock = '<div class="pub-checks">' + terms.map(function (t, i) {
      const on = pb.agreed.indexOf(i) >= 0;
      return '<button type="button" class="pub-check ' + (on ? 'on' : '') + '" data-act="pubchk" data-i="' + i + '"' +
        ' aria-pressed="' + on + '"><span class="bx" aria-hidden="true"></span><span>' + t + '</span></button>';
    }).join('') + '</div>';

    const previewName = pb.name || 'dsh-my-plugin';
    const prevCard = '<div class="pub-prev"><span class="pp-ico" style="background:' +
      'linear-gradient(135deg,#7fc9ff,#2f86d8)' + '" aria-hidden="true">🧩</span>' +
      '<span class="pp-tx"><b>' + esc(previewName) + '</b><span>' + esc(me.nick) + ' · v' + esc(pb.ver) + ' · ' + esc(pb.license) + '</span></span>' +
      '<span class="pub-radio-tag">' + (pb.visibility === 'public' ? '公开' : '私有') + '</span></div>';

    const main = '<div class="pub-main">' +
      '<div class="pub-field"><span class="pub-label">包名<i>*</i></span>' + nameRow + '</div>' +
      '<div class="pub-sep"></div>' +
      '<label class="pub-field"><span class="pub-label">一句话介绍</span>' +
        '<textarea id="pub-desc" maxlength="120" rows="2" placeholder="一句话说清它替你做了什么">' + esc(pb.desc) + '</textarea>' +
        '<p class="pub-tip">会显示在条目库卡片上，最长 120 字。写具体动词，别写「一个强大的工具」。</p></label>' +
      '<div class="pub-field"><span class="pub-label">可见性</span>' + visBlock + '</div>' +
      '<div class="pub-field"><span class="pub-label">分类</span>' + catBlock +
        '<p class="pub-tip">分类决定它出现在条目库哪个筛选里。</p></div>' +
      '<div class="pub-field"><span class="pub-label">许可证</span>' +
        '<select id="pub-license" aria-label="许可证">' + lics.map(function (l) {
          return '<option value="' + l + '"' + (pb.license === l ? ' selected' : '') + '>' + (l === '未声明' ? '未声明（只放外链，不镜像）' : l) + '</option>';
        }).join('') + '</select>' +
        '<p class="pub-tip">选「未声明」的话，条目只能放外链，本站不会收录安装包。</p></div>' +
      '<div class="pub-field"><span class="pub-label">首个版本安装包<i>*</i></span>' + dropBlock +
        '<p class="pub-tip">上传后会自动算 sha256，并在条目页生成签名下载链接。也可以稍后在「上传新版本」里补。</p></div>' +
      '<div class="pub-sep"></div>' +
      '<div class="pub-field"><span class="pub-label">发布前确认</span>' + termsBlock +
        '<p class="pub-tip pub-terms-tip"' + (agreeAll ? ' hidden' : '') + ' style="color:var(--rose-ink)">四条都勾上才能提交。</p></div>' +
      '</div>';

    const side = '<aside class="pub-side">' +
      '<div class="side-card"><div class="side-hd"><span class="t">发布流程</span></div><div class="side-bd">' +
        '<ol><li><b>建条目</b>：填包名、介绍、分类。</li><li><b>传安装包</b>：本地打包 .tgz。</li>' +
        '<li><b>人工审核</b>：查许可证与包内容，通常 1 个工作日。</li>' +
        '<li><b>上线</b>：条目出现在条目库，作者可继续发版。</li></ol></div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">命名与规范</span></div><div class="side-bd">' +
        '<ul><li>社群插件统一 <b>dsh-</b> 前缀，避免和内置命令撞名。</li>' +
        '<li>包名与 <b>package.json</b> 的 name 必须一致。</li>' +
        '<li>README 写清安装、权限、卸载三件事。</li>' +
        '<li>用到网络或文件权限时，在条目里声明。</li></ul>' +
        '<div class="pub-code">pnpm dsh add ./' + esc(previewName) + '-0.1.0.tgz</div></div></div>' +
      '<div class="side-card"><div class="side-hd"><span class="t">卡片预览</span></div><div class="side-bd">' + prevCard +
        '<p class="pub-tip">这条会出现在条目库里，点进去是条目页。</p></div></div>' +
      '</aside>';

    const foot = '<div class="pub-foot"><span class="pub-hint">' +
      (ready ? '条件都满足了，点右边创建。' : '还差：' + [
        okName ? '' : (pb.name ? '包名格式' : '包名'),
        pb.file ? '' : '安装包',
        agreeAll ? '' : '发布条款'
      ].filter(Boolean).join(' / ')) + '</span>' +
      '<button type="button" class="btn ghost" data-act="pubreset">重置</button>' +
      '<button type="button" class="btn" data-act="procancel">取消</button>' +
      '<button type="button" class="btn blue" data-act="pubsubmit"' + (ready ? '' : ' disabled aria-disabled="true"') + '>创建插件 ›</button></div>';

    const done = pb.stage === 'review'
      ? '<div class="card"><div class="card-hd"><h1 class="t">已提交，等审核</h1></div><div class="card-bd">' +
        '<div class="pub-done"><span class="pd-ok" aria-hidden="true">✅</span><div>' +
        '<b>' + esc(pb.name) + '</b> 已经进审核队列。审核通过后它会出现在条目库，作者栏是你。' +
        '<div class="pub-tip">审核期间可以继续改 README 与截图；安装包已经锁定，改包要重新提交。</div></div></div>' +
        '<div style="margin-top:14px;display:flex;gap:9px;flex-wrap:wrap">' +
        '<button class="btn sm blue" data-act="go" data-route="market">去条目库看看</button>' +
        '<button class="btn sm ghost" data-act="pubreset">再发一个</button></div></div></div>'
      : '';

    return '<div class="wrap deep">' + seaHTML() + railHTML() + '<div class="col-main">' +
      '<div class="card pub-page"><div class="card-hd"><h1 class="t">发布插件</h1>' +
      '<span class="more">仿 GitHub 新建仓库：填完就能上线</span></div>' +
      (pb.stage === 'review' ? done : '<div class="pub-wrap">' + main + side + '</div>' + foot) +
      '</div></div></div>';
  }

  function pageHTML() {
    if (S.route === 'settings') return settingsPage();
    if (S.route === 'login') return loginPage();
    if (S.route === 'oauth') return oauthPage();
    if (S.route === 'verify') return verifyPage();
    if (S.route === 'entry') return entryPage(S.pid);
    if (S.route === 'claim') return claimPage(S.pid);
    if (S.route === 'upload') return uploadPage(S.pid);
    if (S.route === 'publish') return publishPage();
    if (S.route === 'policy') return policyPage();
    if (S.route === 'profile') return profilePage();
    if (S.route === 'market') return marketPage();
    if (S.route === 'forum') return forumPage();
    if (S.route === 'thread') return threadPage(S.threadId);
    if (S.route === 'space') return spacePage(S.spaceUser || ME());
    return feedPage();
  }

  const FOOTER = '<div class="footer"><a href="javascript:;">关于社群</a><a href="javascript:;">插件规范</a>' +
    '<a href="javascript:;" data-act="go" data-route="policy">转载与下架政策</a><a href="javascript:;">反馈与建议</a>' +
    '<span class="foot-mark">' + tail(13, 6.8) + ' © 2026 ' + BR.name + ' · 演示站点，数据均为虚构</span></div>';

  /* P0：移动端底部导航（≤760px 显示） */
  function tabbarHTML() {
    const items = [['feed', '首页', '🏠'], ['market', '插件库', '🧩'], ['forum', '社群', '💬'], ['space', '我的空间', '👤']];
    const sub = ['entry', 'claim', 'upload'];
    return '<nav class="m-tabbar" aria-label="移动端导航">' + items.map(function (x) {
      const on = S.route === x[0] || (x[0] === 'market' && sub.indexOf(S.route) >= 0);
      return '<a class="' + (on ? 'on' : '') + '" data-act="go" data-route="' + x[0] + '"' +
        (on ? ' aria-current="page"' : '') + '><span class="ic" aria-hidden="true">' + x[2] + '</span><span>' + x[1] + '</span></a>';
    }).join('') + '</nav>';
  }

  function hashOf() {
    if (S.route === 'settings') return '#/settings';
    if (S.route === 'login') return '#/login';
    if (S.route === 'oauth') return '#/oauth';
    if (S.route === 'verify') return '#/verify';
    if (S.route === 'entry') return '#/plugin/' + S.pid;
    if (S.route === 'claim') return '#/claim/' + S.pid;
    if (S.route === 'upload') return '#/upload/' + S.pid;
    if (S.route === 'publish') return '#/publish';
    if (S.route === 'policy') return '#/policy';
    if (S.route === 'profile') return '#/profile';
    if (S.route === 'thread') return '#/thread/' + S.threadId;
    if (S.route === 'space') return '#/space/' + (S.spaceUser || ME());
    return '#/' + S.route;
  }
  function applyHash() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    const seg = h.split('/').filter(Boolean);
    if (!seg.length) return false;
    const r = seg[0];
    if (r !== S.route) { S.q = ''; S.pop = null; }
    if (r === 'plugin') { S.route = 'entry'; if (seg[1]) S.pid = seg[1]; return true; }
    if (r === 'claim') { S.route = 'claim'; if (seg[1]) S.pid = seg[1]; return true; }
    if (r === 'upload') { S.route = 'upload'; if (seg[1]) S.pid = seg[1]; return true; }
    if (r === 'publish') { S.route = 'publish'; return true; }
    if (r === 'policy') { S.route = 'policy'; return true; }
    if (r === 'settings') { S.route = 'settings'; return true; }
    if (r === 'login') { S.route = 'login'; return true; }
    if (r === 'oauth') { S.route = 'oauth'; return true; }
    if (r === 'verify') { S.route = 'verify'; return true; }
    if (r === 'profile') { S.route = 'profile'; return true; }
    if (r === 'thread') { S.route = 'thread'; if (seg[1]) S.threadId = seg[1]; return true; }
    if (r === 'space') { S.route = 'space'; S.spaceUser = seg[1] || ME(); return true; }
    if (['market', 'forum', 'feed'].indexOf(r) >= 0) { S.route = r; return true; }
    return false;
  }
  /* 日志页与个人空间共用 S.tab：进入各自路由时归一化，避免出现「一个 tab 都不高亮」 */
  function syncTab() {
    const FEED_TABS = ['全部', '关注', '插件', '问答'];
    const SPACE_TABS = ['日志', '插件', '相册', '留言'];
    if (S.route === 'feed' && FEED_TABS.indexOf(S.tab) < 0) S.tab = '全部';
    if (S.route === 'space' && SPACE_TABS.indexOf(S.tab) < 0) S.tab = '日志';
    const FCATS = ['全部'].concat((D.categories || []).map(function (c) { return c.id; }));
    if (FCATS.indexOf(S.scat) < 0) S.scat = '全部';
  }

  function saveState() {
    try {
      const out = {
        liked: Array.from(S.liked), reacts: Array.from(S.reacts), floorLiked: Array.from(S.floorLiked),
        installed: Array.from(S.installed), comments: S.comments, noticesRead: S.noticesRead,
        fav: Array.from(S.fav), cmtLiked: Array.from(S.cmtLiked),
        newThreads: S.newThreads, newFloors: S.newFloors, msgs: S.msgs,
        /* v15 · 多账号：整份账号表 + 当前是谁 */
        account: S.account, accounts: S.accounts
      };
      localStorage.setItem(STATE_KEY, JSON.stringify(out));
    } catch (err) {}
  }

  /* P1 · 可访问性：非原生控件补 role/tabindex */
  function enhanceA11y() {
    document.querySelectorAll('[data-act]').forEach(function (el) {
      if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'].indexOf(el.tagName) >= 0) return;
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    });
  }

  /* 同页重绘后把焦点还回去：按 data-act + 语义 id 认回同一个控件 */
  function focusKeyOf(el) {
    if (!el || !el.dataset || !el.dataset.act) return '';
    const d = el.dataset;
    /* 筛选类控件（左栏分类 / 标签 / tab）靠 dataset 里的筛选值区分，否则同一 act 的
       七条分类会共用一个 key，重绘后焦点认回第一条 */
    return [d.act, d.pid || d.id || d.cid || d.route || d.pop || d.t || '', d.cat || d.tag || d.tab || ''].join('|');
  }

  /* 进站闸门：登录只是第一道，手机号认证是第二道。
     公开可看的是「内容页」（首页 / 插件库 / 社群 / 帖子 / 政策 / 别人的空间），
     需要身份的是「以我的名义做事」的页面（发布、编辑资料、认领、上传、设置）。
     闸门放在 render 的最前面，任何入口（点链接、改 hash、后退）都绕不过去。 */
  const PUBLIC_ROUTES = ['feed', 'market', 'forum', 'thread', 'policy', 'entry', 'space', 'login', 'oauth', 'verify'];
  function gateRoute() {
    if (!window.AUTH) return false;
    if (PUBLIC_ROUTES.indexOf(S.route) >= 0) {
      /* 已登录还停在登录/授权页：说明是从别处点进来的，放行让页面自己说明状态 */
      if (S.route === 'verify') {
        const st = authState();
        if (st.mode !== 'authed') { S.route = 'login'; return true; }
        if (st.phoneOk) { S.route = 'feed'; return true; }
      }
      return false;
    }
    const st = authState();
    /* 先把「你要去哪」记下来再改路由 —— 直接改完 S.route 再取标签，拿到的是 login 自己 */
    const label = GATE_LABEL[S.route] || '这个页面';
    if (st.mode !== 'authed') { S.route = 'login'; S.authErr = { msg: '请先登录：' + label + '需要用账号身份进入' }; return true; }
    if (!st.phoneOk) { S.route = 'verify'; S.authErr = { msg: '先完成手机号认证，' + label + '才会以你的名义记账' }; return true; }
    return false;
  }
  const GATE_LABEL = { publish: '发布插件', profile: '编辑资料', claim: '认领条目', upload: '上传版本', settings: '设置' };

  function render(keep) {
    gateRoute();
    syncTab();
    const y = window.scrollY;
    const prevFocus = document.activeElement;
    const prevKey = focusKeyOf(prevFocus);
    const focusWasInPage = !!(prevFocus && prevFocus.closest && prevFocus.closest('#main'));
    /* 页面签名变了 = 整页切换（首次进入也算），才跑入场编排；同页状态更新不重播 */
    const sig = S.route + '|' + (S.route === 'thread' ? S.threadId
      : S.route === 'space' ? S.spaceUser
        : (S.route === 'entry' || S.route === 'claim' || S.route === 'upload') ? S.pid : '');
    const switched = sig !== pageSig;
    pageSig = sig;
    const body = pageHTML();
    app.innerHTML = navHTML() + '<main id="main" tabindex="-1">' +
      ((switched || enterNext) ? enterWrap(body) : body) + '</main>' +
      FOOTER + lightboxHTML() + tabbarHTML();
    enterNext = false;
    /* 下拉是重绘插入的，补一帧再加 .open，过渡才从收起态起步 */
    const pop = qs('.pop');
    if (pop) requestAnimationFrame(() => requestAnimationFrame(() => pop.classList.add('open')));
    /* 灯箱同理：先画收起态，下一帧再上 .open，才有一档放大淡入 */
    const lb = qs('.lightbox[data-lb]');
    if (lb) requestAnimationFrame(() => requestAnimationFrame(() => lb.classList.add('open')));
    const c = qs('#ccount');
    if (c) c.textContent = '0 / 500';
    const h = hashOf();
    /* 闸门会在渲染前改路由（访客点 #/settings → 改去登录页），这时地址栏还是那个进不去的 hash。
       两个条件缺一不可：路由变了要写，地址栏和实际显示对不上也要写。
       只改了路由但地址栏没跟上的那一支用 replaceState —— 把「进不去的那条」替换掉，
       而不是在历史里再塞一条，否则用户按后退会弹回同一个被拒的地址。 */
    const hashStale = (location.hash || '') !== h;
    if (h !== lastHashShown || hashStale) {
      const push = seeded && h !== lastHashShown;
      lastHashShown = h;
      try { history[push ? 'pushState' : 'replaceState'](null, '', h); } catch (err) { location.hash = h; }
      seeded = true;
    }
    if (keep) window.scrollTo(0, y); else window.scrollTo({ top: 0, behavior: scrollMode() });
    document.body.classList.toggle('lb-open', !!S.lb);
    saveState();
    enhanceA11y();
    /* 焦点交接：整块重写 innerHTML 会让焦点静默掉回 body，
       换页时给键盘用户落到主内容区，同页重绘则认回原控件 */
    const main = qs('#main');
    if (switched && !keep && main) {
      main.focus({ preventScroll: true });
    } else if (prevKey) {
      const back = qsa('[data-act="' + prevKey.split('|')[0] + '"]').filter(function (n) {
        return focusKeyOf(n) === prevKey;
      })[0];
      if (back) back.focus({ preventScroll: true });
      else if (switched && focusWasInPage && main) main.focus({ preventScroll: true });
    } else if (focusWasInPage && !document.activeElement.closest('#main') && main && !keep) {
      main.focus({ preventScroll: true });
    }
  }

  /* ---------- 事件 ---------- */
  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-act]');
    if (!el) {
      if (S.pop) closePop();
      return;
    }
    const act = el.dataset.act;

    if (act === 'go') {
      if (el.dataset.id) S.pid = el.dataset.id;
      /* 菜单里的「我的空间」不带 uid：进当前账号的主页 */
      if (el.dataset.route === 'space' && !el.dataset.uid) { S.spaceUser = ME(); S.tab = '日志'; }
      S.route = el.dataset.route; S.pop = null; S.q = ''; S.authErr = null; render(false); return;
    }

    /* ---------- v17 · 登录 / 注册 / 第三方 / 手机号 ---------- */
    if (act === 'authtab') {
      const t = el.dataset.tab === 'register' ? 'register' : 'login';
      if (S.authTab === t && !S.authErr) return;
      S.authTab = t; S.authErr = null; render(true);
      const first = qs(t === 'register' ? '#rg-name' : '#lg-email');
      if (first) first.focus({ preventScroll: true });
      return;
    }
    if (act === 'login' || act === 'register') {
      if (!window.AUTH) { toast('登录内核未加载', '⚠️'); return; }
      const isReg = act === 'register';
      const form = {
        name: (qs('#rg-name') || {}).value || '',
        email: (qs(isReg ? '#rg-email' : '#lg-email') || {}).value || '',
        password: (qs(isReg ? '#rg-password' : '#lg-password') || {}).value || '',
        password2: (qs('#rg-password2') || {}).value || ''
      };
      S.authForm = form;
      el.disabled = true;
      (isReg ? Promise.resolve().then(function () { return window.AUTH.register(form); })
        : Promise.resolve().then(function () { return window.AUTH.login(form); }))
        .then(function (res) {
          const u = res.user || {};
          adoptAccount(u.uid, u.name);
          S.authErr = null; S.authForce = false; S.authForm = null;
          S.oauthPending = ''; S.phone = ''; S.phoneDev = ''; S.phoneCool = 0;
          S.pop = null;
          if (res.needPhone) {
            S.route = 'verify';
            toast('账号已' + (isReg ? '创建' : '登录') + '，还差手机号认证', '📱');
          } else {
            S.route = 'feed';
            toast(isReg ? '注册成功，已自动登录' : '欢迎回来，' + (u.name || ''), '👋');
          }
          render(false);
        })
        .catch(function (err) {
          el.disabled = false;
          S.authErr = authErrOf(err, isReg);
          render(true);
          if (err && err.code === 'NOT_REGISTERED') {
            const e1 = qs('#lg-email'); if (e1) e1.focus({ preventScroll: true });
          }
        });
      return;
    }
    if (act === 'oauth') {
      if (!window.AUTH) return;
      try {
        window.AUTH.oauthStart(el.dataset.p);
        S.oauthPending = el.dataset.p; S.authErr = null;
        S.route = 'oauth'; S.pop = null; render(false);
      } catch (err) {
        S.authErr = authErrOf(err, false); S.route = 'login'; render(false);
      }
      return;
    }
    if (act === 'oauthok') {
      const p = el.dataset.p || S.oauthPending;
      el.disabled = true;
      Promise.resolve().then(function () { return window.AUTH.oauthComplete(p); })
        .then(function (res) {
          adoptAccount(res.user.uid, res.user.name);
          S.oauthPending = ''; S.authErr = null; S.pop = null;
          if (res.needPhone) { S.route = 'verify'; toast('授权成功，接着认证手机号', '📱'); }
          else { S.route = 'feed'; toast('已用' + res.provider + '登录', '👋'); }
          render(false);
        })
        .catch(function (err) { el.disabled = false; S.authErr = authErrOf(err, false); render(true); });
      return;
    }
    if (act === 'oauthcancel') {
      S.oauthPending = ''; S.authErr = null; S.authTab = 'login';
      S.route = 'login'; render(false); return;
    }
    if (act === 'phsend') {
      const num = ((qs('#ph-num') || {}).value || '').trim();
      S.phone = num;
      try {
        const r = window.AUTH.sendPhoneCode(num);
        S.phoneDev = r.devCode || '';
        /* AUTH 的 cooldown 已经是秒，别再除一次 —— 除完永远是 0，按钮不会进入倒计时 */
        S.phoneCool = Math.max(0, Math.round(r.cooldown || 60));
        S.authErr = null;
        render(true);
        toast('验证码已发送到 ' + r.masked, '📩');
        tickPhoneCool();
      } catch (err) {
        S.authErr = authErrOf(err, false); render(true);
      }
      return;
    }
    if (act === 'phverify') {
      const num = ((qs('#ph-num') || {}).value || S.phone || '').trim();
      const code = ((qs('#ph-code') || {}).value || '').trim();
      S.phone = num;
      try {
        const r = window.AUTH.verifyPhoneCode(num, code);
        S.authErr = null; S.phoneDev = ''; S.phoneCool = 0; S.pop = null;
        S.route = 'feed';
        render(false);
        toast('手机号 ' + r.phone + ' 认证完成', '✅');
      } catch (err) {
        S.authErr = authErrOf(err, false); render(true);
      }
      return;
    }
    if (act === 'logout') {
      if (!window.AUTH) return;
      window.AUTH.logout();
      S.pop = null; S.authErr = null; S.authForce = false; S.authForm = null;
      S.oauthPending = ''; S.phone = ''; S.phoneDev = ''; S.phoneCool = 0;
      S.draft = null; S.fileErr = ''; S.pendingImages = []; S.ntImages = [];
      S.route = 'login'; S.authTab = 'login';
      render(false);
      toast('已退出登录，现在可以换个账号', '⏻');
      return;
    }
    if (act === 'setjump') {
      S.setPanel = el.dataset.id || 'set-acc'; S.authErr = null; render(true); return;
    }
    if (act === 'settheme') {
      const v = el.dataset.v === 'night' ? 'night' : 'day';
      document.documentElement.dataset.theme = v;
      try { localStorage.setItem('dsh-forum-theme', v); } catch (err) {}
      render(true); return;
    }
    if (act === 'setnotify') {
      S.noticesRead = !S.noticesRead;
      render(true);
      toast(S.noticesRead ? '已全部标记为已读' : '已恢复未读提醒', '🔔');
      return;
    }

    /* ---------- v7 · 编辑资料（整页，参考 B 站账号资料） ---------- */
    /* ---------- v8：发布插件 ---------- */
    if (act === 'pubvis') {
      pubOf().visibility = el.dataset.v;
      qsa('[data-act="pubvis"]').forEach(function (b) {
        const on = b.dataset.v === S.pub.visibility;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      const tag = qs('.pub-prev .pub-radio-tag');
      if (tag) tag.textContent = S.pub.visibility === 'public' ? '公开' : '私有';
      return;
    }
    if (act === 'pubcat') {
      pubOf().cat = el.dataset.v;
      qsa('[data-act="pubcat"]').forEach(function (b) {
        const on = b.dataset.v === S.pub.cat;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      return;
    }
    if (act === 'pubdrop' || act === 'pubclear') {
      const pb = pubOf();
      if (act === 'pubdrop') {
        const slug = (pb.name || 'dsh-my-plugin');
        pb.file = { name: slug + '-' + pb.ver + '.tgz', size: '1.2 MB', sha: 'c41f7a09be2d…（演示值）' };
      } else { pb.file = null; }
      const box = qs('.pub-drop, .pub-file');
      if (box) {
        const tmp = document.createElement('div');
        tmp.innerHTML = pubFileBlock(pb);
        box.parentNode.replaceChild(tmp.firstChild, box);
      }
      recalcPub();
      if (act === 'pubdrop') toast('已读取包内 package.json', '📦');
      return;
    }
    if (act === 'pubchk') {
      const pb = pubOf(), i = +el.dataset.i, k = pb.agreed.indexOf(i);
      if (k >= 0) pb.agreed.splice(k, 1); else pb.agreed.push(i);
      /* 局部切换这一条：整页重绘会让输入框失焦，也会把正在滚动的表单弹回顶部 */
      const on = pb.agreed.indexOf(i) >= 0;
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      recalcPub(); return;
    }
    if (act === 'pubreset') {
      S.pub = { name: '', desc: '', owner: ME(), visibility: 'public', cat: '创作', license: 'MIT', ver: '0.1.0', init: ['readme'], agreed: [], file: null, stage: '' };
      render(true); toast('表单已清空', '🧹'); return;
    }
    if (act === 'pubsubmit') {
      const pb = pubOf();
      if (!pubReady(pb)) { toast('还差几项没填完', '⚠️'); return; }
      pb.stage = 'review';
      render(false); toast('已提交，等人工审核', '✅'); return;
    }
    if (act === 'projump') {
      const sec = document.getElementById(el.dataset.id || '');
      if (sec) sec.scrollIntoView({ block: 'start', behavior: scrollMode() });
      qsa('.pro-nav a').forEach(function (a) { a.classList.toggle('on', a.dataset.id === el.dataset.id); });
      return;
    }
    if (act === 'avapick') {
      const pa = profileOptions.avatarPresets[+el.dataset.id];
      if (!pa) return;
      acct().avatar = { grad: pa.grad, emoji: pa.emoji };
      S.fileErr = ''; saveState(); render(true);
      toast('已换上预设头像', '🎨'); return;
    }
    if (act === 'avafile') { const inp = qs('#ava-file'); if (inp) inp.click(); return; }
    if (act === 'avaclear') {
      acct().avatar = null; S.fileErr = ''; saveState(); render(true);
      toast('已恢复默认头像', '↩️'); return;
    }
    if (act === 'coverpick') {
      const cv = profileOptions.covers[+el.dataset.id];
      if (!cv) return;
      acct().cover = cv.grad; saveState(); render(true);
      toast('封面已换成「' + cv.note + '」', '🖼️'); return;
    }
    if (act === 'progender') { draftOf().gender = el.dataset.id || '保密'; render(true); return; }
    if (act === 'protag') {
      const d = draftOf(), kind = el.dataset.kind === 'interests' ? 'interests' : 'tags';
      const v = el.dataset.id || '';
      const arr = d[kind];
      const at = arr.indexOf(v);
      if (at >= 0) arr.splice(at, 1);
      else {
        if (kind === 'tags' && arr.length >= 6) { toast('擅长最多选 6 个', '🏷️'); return; }
        if (kind === 'interests' && arr.length >= 5) { toast('感兴趣的方向最多 5 个', '🏷️'); return; }
        arr.push(v);
      }
      render(true); return;
    }
    if (act === 'procancel') {
      /* 取消 = 丢弃这一页改过的草稿，回到空间；已保存的资料不动 */
      S.draft = null; S.fileErr = '';
      S.route = 'space'; S.spaceUser = ME(); S.pop = null; S.q = '';
      render(false); return;
    }
    if (act === 'proreset') {
      S.draft = null; S.fileErr = '';
      S.accounts[ME()] = { profile: null, avatar: null, cover: '' };
      saveState(); render(true);
      toast('资料已恢复默认', '↩️'); return;
    }
    if (act === 'prosave') {
      const d = draftOf();
      const nickEl = qs('#pro-nick'), sigEl = qs('#pro-sig');
      if (nickEl) d.nick = nickEl.value;
      if (sigEl) d.sig = sigEl.value;
      d.nick = (d.nick || '').trim();
      d.sig = (d.sig || '').trim();
      if (!d.nick) { toast('昵称不能为空', '⚠️'); if (nickEl) nickEl.focus(); return; }
      if (d.nick.length > 16) { toast('昵称最多 16 个字符', '⚠️'); return; }
      acct().profile = JSON.parse(JSON.stringify(d));
      saveState(); render(true);
      toast('资料已保存', '✅'); return;
    }
    if (act === 'railtab') { S.route = 'feed'; S.tab = el.dataset.tab; S.q = ''; render(false); return; }
    if (act === 'railsort') { S.route = 'market'; S.sort = el.dataset.sort; S.cat = '全部'; S.q = ''; render(false); return; }
    if (act === 'railforum') { S.route = 'forum'; S.fsort = el.dataset.sort; S.ftag = '全部'; S.q = ''; render(false); return; }
    if (act === 'railcat') { S.route = 'market'; S.cat = el.dataset.cat; S.q = ''; S.sort = '热度'; render(false); return; }
    /* 换号入口已撤（v15 的八格切号器）。万一还有别处发出这个 act，
       也必须落在同一条规则上：不允许在已登录的会话里换账户。 */
    if (act === 'switchacc') {
      S.pop = null; render(false);
      toast('已登录状态下不能切换账户，请先退出登录', '🔒'); return;
    }
    if (act === 'user') { S.spaceUser = el.dataset.uid; S.route = 'space'; S.tab = '日志'; S.pop = null; render(false); return; }
    if (act === 'theme') {
      const r = document.documentElement;
      r.dataset.theme = r.dataset.theme === 'night' ? 'day' : 'night';
      try { localStorage.setItem('dsh-forum-theme', r.dataset.theme); } catch (err) {}
      S.pop = null; render(true);
      toast(r.dataset.theme === 'night' ? '已切换到夜间模式' : '已切换到白天模式', '🌗'); return;
    }
    if (act === 'pop') {
      const want = S.pop === el.dataset.pop ? null : el.dataset.pop;
      if (!want) { closePop(); return; }
      S.pop = want; render(true); return;
    }
    if (act === 'readall') { S.noticesRead = true; S.pop = null; render(true); toast('消息已全部标记为已读', '📭'); return; }
    if (act === 'toast') { toast(el.dataset.msg || '操作成功'); return; }
    if (act === 'board') {
      const b = el.dataset.b;
      if (b === '插件库') { S.route = 'market'; S.cat = '全部'; S.sort = '热度'; S.q = ''; }
      else if (b === '讨论区') { S.route = 'forum'; S.ftag = '全部'; S.q = ''; }
      else if (b === '问题反馈') { S.route = 'forum'; S.ftag = '求助'; S.q = ''; }
      else if (b === '文档中心') { S.route = 'policy'; }
      S.pop = null; render(false); return;
    }

    /* ---------- v6：条目库 / 授权 / 下载 / 举报 ---------- */
    if (act === 'pl') { S.pid = el.dataset.id; S.route = 'entry'; S.pop = null; S.q = ''; render(false); return; }
    if (act === 'tier') { S.tier = el.dataset.t; render(true); return; }
    if (act === 'dl') {
      /* 签名 URL 只在点击瞬间签发：先画「正在签发」，1 秒后出链接。HTML 里从不出现签名参数。 */
      const id = el.dataset.id;
      S.dl = { id: id, state: 'work' };
      render(true);
      setTimeout(function () {
        if (S.dl && S.dl.id === id) { S.dl = { id: id, state: 'ok' }; render(true); }
      }, 900);
      toast('链接签发中，10 分钟内有效', '⤓'); return;
    }
    if (act === 'sha') {
      const v = el.dataset.sha || '';
      copyText(v, 'sha256 已复制：' + v.slice(0, 16) + '…', '复制失败，请手动选中');
      return;
    }
    if (act === 'rep') {
      const id = el.dataset.id;
      S.rep = S.rep === id ? null : id;
      render(true); return;
    }
    if (act === 'rpt') { S.repT[el.dataset.id] = el.dataset.t; render(true); return; }
    if (act === 'rpsend') {
      const id = el.dataset.id;
      const cur = reportTypes.filter(function (r) { return r.id === S.repT[id]; })[0];
      S.rep = null;
      toast('举报已提交' + (cur ? '（' + cur.t + '）' : '') + '，24 小时内处理', '🚩'); render(true); return;
    }
    if (act === 'claimtab') { S.vt = el.dataset.t; render(true); return; }
    if (act === 'copyv') {
      const v = el.dataset.v || '';
      copyText(v, '验证串已复制', '复制失败，请手动选中');
      return;
    }
    if (act === 'claimverify') {
      const id = el.dataset.id;
      S.vs[id] = { state: 'work' };
      render(true);
      setTimeout(function () {
        const p = pluginOf(id);
        /* 演示站点：p1/p4 视为验证成功（它们本来就是作者认领状态），其余按失败文案展示 */
        const ok = !!p.claimed;
        if (ok) S.claimed.add(id);
        S.vs[id] = { state: ok ? 'ok' : 'fail' };
        render(true);
        toast(ok ? '验证通过，仓库已绑定' : '没找到验证串，看看失败原因', ok ? '✅' : '⚠️');
      }, 1000);
      return;
    }
    if (act === 'grant') {
      const id = el.dataset.id;
      const p = pluginOf(id);
      const cur = mirrorOf(p);
      S.mirror[id] = cur === 'off' ? (p.mirror === 'off' ? 'manual' : p.mirror || 'auto') : 'off';
      render(true);
      toast(S.mirror[id] === 'off' ? '已关闭镜像授权，24 小时内停止下载' : '已授权镜像分发', S.mirror[id] === 'off' ? '🔒' : '🔓');
      return;
    }
    if (act === 'gmode') { S.mirror[el.dataset.id] = el.dataset.m; render(true); return; }
    if (act === 'withdraw') {
      const id = el.dataset.id;
      if (S.withdraw.has(id)) S.withdraw.delete(id); else S.withdraw.add(id);
      render(true);
      toast(S.withdraw.has(id) ? '已撤回当前版本，立刻停止下载' : '已恢复分发', S.withdraw.has(id) ? '📥' : '↩️');
      return;
    }
    if (act === 'updrop') {
      /* 演示站点没法真的读文件，这里模拟「解压后读到 package.json」 */
      const p = pluginOf(el.dataset.id);
      S.up.file = {
        name: p.pkg.replace(/^dsh-/, 'dsh-') + '-' + p.ver + '.tgz',
        size: '1.2 MB', pkg: p.pkg, ver: p.ver, lic: p.license || '',
        sha: 'c41f7a09be2d...' + p.id + '（演示值）'
      };
      S.up.stage = '';
      render(true); toast('已读取包内 package.json', '📦'); return;
    }
    if (act === 'upclear') { S.up.file = null; S.up.stage = ''; render(true); return; }
    if (act === 'upver') {
      const v = el.dataset.v, i = S.up.compat.indexOf(v);
      if (i >= 0) S.up.compat.splice(i, 1); else S.up.compat.push(v);
      render(true); return;
    }
    if (act === 'upbreak') { S.up.breaking = el.dataset.v; render(true); return; }
    if (act === 'chk') {
      const i = +el.dataset.i, k = S.up.agreed.indexOf(i);
      if (k >= 0) S.up.agreed.splice(k, 1); else S.up.agreed.push(i);
      render(true); return;
    }
    if (act === 'upsubmit') { S.up.stage = 'review'; render(false); toast('已提交，等人工审核', '✅'); return; }
    if (act === 'upreset') {
      S.up = { file: null, compat: [], breaking: '', note: '', agreed: [], stage: '' };
      render(true); return;
    }
    if (act === 'docjump') {
      const node = document.getElementById(el.dataset.sec);
      if (node) {
        node.scrollIntoView({ block: 'start', behavior: scrollMode() });
        qsa('.doc-nav a').forEach(function (a) { a.classList.toggle('on', a === el); });
      }
      return;
    }

    if (act === 'feedtab') { S.tab = el.dataset.tab; render(true); return; }
    if (act === 'stab') { S.tab = el.dataset.tab; render(true); return; }
    if (act === 'cat') { S.cat = el.dataset.cat; render(true); return; }
    if (act === 'sort') { S.sort = el.dataset.sort; render(true); return; }
    if (act === 'fcat') {
      const jump = S.route !== 'forum';
      S.scat = el.dataset.cat; S.q = '';
      /* 分类与主标签是两套维度，但同时只有一个在生效：点分类就清掉标签筛选，
         否则会出现「点分类条数字变了、列表却还是空的」这种自相矛盾的画面。 */
      S.ftag = '全部';
      if (jump) { S.route = 'forum'; }
      render(!jump); return;
    }
    if (act === 'ftag') {
      /* 左栏标签卡与中栏热门标签共用 S.ftag；从别的页面点过来顺手切到社群 */
      const jump = S.route !== 'forum';
      S.ftag = el.dataset.tag; S.q = '';
      if (jump) { S.route = 'forum'; S.scat = '全部'; }
      render(!jump); return;
    }
    if (act === 'fsort') { S.fsort = el.dataset.sort; render(true); return; }
    if (act === 'react') {
      const k = el.dataset.k;
      if (S.reacts.has(k)) S.reacts.delete(k); else { S.reacts.add(k); toast('已加上 ' + k.split('|')[1] + ' 反应', k.split('|')[1]); }
      render(true); return;
    }
    if (act === 'jumpf') {
      const node = document.getElementById('f' + el.dataset.n);
      if (node) {
        node.scrollIntoView({ block: 'start', behavior: scrollMode() });
        node.classList.remove('flash'); void node.offsetWidth; node.classList.add('flash');
      }
      return;
    }
    if (act === 'tag') { S.q = el.dataset.tag; S.route = 'forum'; render(false); return; }
    if (act === 'thread') { S.threadId = el.dataset.id; S.route = 'thread'; render(false); return; }

    if (act === 'like') {
      const id = el.dataset.pid;
      const post = posts.filter(function (x) { return x.id === id; })[0];
      /* 有 _id 说明这条是后端来的真数据：打接口，失败就退回本地假状态 */
      if (post && post._id && window.API) {
        window.API.like(post._id).then(function (r) {
          post.likes = r.likes;
          if (r.liked) S.liked.add(id); else S.liked.delete(id);
          toast(r.liked ? '已点赞' : '已取消赞', r.liked ? '❤️' : '💔');
          render(true);
        }).catch(function (e) {
          toast(e.status === 401 ? '先登录再点赞' : ('点赞失败：' + e.message), '⚠️');
        });
        return;
      }
      if (S.liked.has(id)) { S.liked.delete(id); toast('已取消赞', '💔'); } else { S.liked.add(id); toast('已点赞', '❤️'); }
      render(true); return;
    }
    if (act === 'tlike') {
      const k = 't_' + el.dataset.id;
      if (S.liked.has(k)) S.liked.delete(k); else S.liked.add(k);
      render(true); return;
    }
    if (act === 'flike') {
      const k = el.dataset.k;
      if (S.floorLiked.has(k)) { S.floorLiked.delete(k); } else { S.floorLiked.add(k); toast('已赞这条回复', '👍'); }
      render(true); return;
    }
    if (act === 'install') {
      const id = el.dataset.pid;
      if (S.installed.has(id)) { toast('已取消安装', '📦'); S.installed.delete(id); }
      else { S.installed.add(id); toast('安装成功，重启后生效', '🎉'); }
      render(true); return;
    }
    if (act === 'expand') {
      const id = el.dataset.pid;
      if (S.expand.has(id)) S.expand.delete(id); else S.expand.add(id);
      render(true); return;
    }
    if (act === 'focuscmt') {
      const box = qs('.cin[data-pid="' + el.dataset.pid + '"]');
      if (box) { box.focus(); box.scrollIntoView({ block: 'center', behavior: scrollMode() }); }
      return;
    }
    if (act === 'sendcmt') {
      const id = el.dataset.pid;
      const box = qs('.cin[data-pid="' + id + '"]');
      const v = box && box.value.trim();
      if (!v) { toast('说点什么再发送吧', '✏️'); return; }
      const post = posts.filter(function (x) { return x.id === id; })[0];
      if (post && post._id && window.API) {
        window.API.comment(post._id, v).then(function (r) {
          const c = r.comment;
          (S.comments[id] = S.comments[id] || []).push({
            user: c.user ? 'u' + c.user.id : ME(), text: c.text, time: c.time
          });
          S.expand.add(id);
          toast('评论已发布', '💬');
          render(true);
        }).catch(function (e) {
          toast(e.status === 401 ? '先登录再评论' : ('评论失败：' + e.message), '⚠️');
        });
        return;
      }
      (S.comments[id] = S.comments[id] || []).push({ user: ME(), text: v, time: '刚刚' });
      S.expand.add(id);
      toast('评论已发布', '💬'); render(true); return;
    }
    if (act === 'share') { copyText(location.href.split('#')[0] + hashOf(), '分享链接已复制', '复制失败，请手动复制地址栏'); return; }
    if (act === 'fav') {
      const id = el.dataset.pid;
      if (S.fav.has(id)) { S.fav.delete(id); toast('已取消收藏', '☆'); }
      else { S.fav.add(id); toast('已收藏到我的空间', '⭐'); }
      render(true); return;
    }
    if (act === 'clike') {
      const k = el.dataset.cid;
      if (S.cmtLiked.has(k)) { S.cmtLiked.delete(k); toast('已取消赞', '🤍'); }
      else { S.cmtLiked.add(k); toast('已赞这条评论', '👍'); }
      render(true); return;
    }
    if (act === 'more') { toast('这里可以举报、屏蔽或复制链接（演示未实现）', '⋯'); return; }
    /* ---------- 发帖工具条 ---------- */
    if (act === 'imgpick') { const inp = qs('#cmt-file'); if (inp) inp.click(); return; }
    if (act === 'ntpick') { const inp = qs('#nt-file'); if (inp) inp.click(); return; }
    if (act === 'imgdel') {
      const i = Number(el.dataset.i) || 0;
      (S.pendingImages || []).splice(i, 1);
      repaintImgs('pendingImages', 'imgprev');
      const b = qs('[data-act="imgpick"]');
      if (b) b.innerHTML = '🖼️ 图片' + (S.pendingImages.length ? '<i class="tool-n">' + S.pendingImages.length + '</i>' : '');
      return;
    }
    if (act === 'pluginpick') { S.pickerOpen = !S.pickerOpen; render(true); return; }
    if (act === 'pluginset') {
      const nm = el.dataset.name;
      const p = plugins.filter(function (x) { return x.name === nm; })[0];
      if (!p) return;
      S.pendingPlugin = p.name; S.pendingPluginVer = p.ver; S.pickerOpen = false;
      render(true); toast('已关联插件 ' + p.name, '🧩'); return;
    }
    if (act === 'pluginclear') { S.pendingPlugin = ''; S.pendingPluginVer = ''; render(true); return; }
    if (act === 'topictag') {
      const ta = qs('#composer');
      if (!ta) { toast('# 话题只能用在日志里', '＃'); return; }
      const tag = '#' + (TAGCLOUD[0] || '话题') + ' ';
      const at = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
      ta.value = ta.value.slice(0, at) + tag + ta.value.slice(at);
      ta.focus();
      try { ta.setSelectionRange(at + tag.length, at + tag.length); } catch (e) {}
      const c = qs('#ccount'); if (c) c.textContent = ta.value.length + ' / 500';
      return;
    }
    if (act === 'attach') { toast('附件走插件包上传（插件库 → 上传新版本），日志这里只收图片', '📎'); return; }
    if (act === 'publish') {
      const ta = qs('#composer');
      const v = ta && ta.value.trim();
      const imgs = (S.pendingImages || []).slice();
      /* 纯图片动态也允许发（后端 posts 的校验就是「文字和图片不能同时为空」） */
      if (!v && !imgs.length) { toast('先写点什么吧～', '✍️'); return; }
      const btn = el;
      /* 本地演示流：后端不可达时把配图原样留在前端渲染，别让用户写了一堆东西点发表后凭空消失。
         dataURL 直接进 .ph.real 的 img src，和真图走同一条渲染分支。 */
      const keepLocal = function (msg) {
        S.published.unshift({
          id: 'mine' + Date.now(), user: ME(), time: '刚刚', text: v,
          images: imgs.map(function (im) { return { kind: 'shot', src: im.src, w: im.w, h: im.h }; }),
          likes: 0, shares: 0, comments: [],
          plugin: S.pendingPlugin || '', pluginVer: S.pendingPluginVer || '', pinned: false
        });
        S.pendingImages = []; S.pendingPlugin = ''; S.pendingPluginVer = ''; S.pickerOpen = false;
        toast(msg || '发表成功，已出现在日志顶部', '🎉');
        render(false);
      };
      if (!window.API) { keepLocal(); return; }
      if (btn) btn.disabled = true;
      const uploads = imgs.length
        ? Promise.all(imgs.map(function (im) { return window.API.uploadImage(im.file); }))
        : Promise.resolve([]);
      uploads.then(function (up) {
        const payload = up.map(function (u) { return { key: u.key, w: u.w, h: u.h, type: u.type, url: u.url }; });
        return window.API.publish(v, payload, S.pendingPlugin || '', S.pendingPluginVer || '');
      }).then(function () {
        S.pendingImages = []; S.pendingPlugin = ''; S.pendingPluginVer = ''; S.pickerOpen = false;
        toast(imgs.length ? '发表成功，' + imgs.length + ' 张配图已上传' : '发表成功，已出现在日志顶部', '🎉');
        return window.API.sync().then(function () { render(false); });
      }).catch(function (e) {
        if (e.status === 401) toast('先登录再发动态', '🔑');
        else if (!e.status || e.status >= 500) keepLocal('后端未连接，已先存进本地演示流');
        else toast('发表失败：' + e.message, '⚠️');
      }).then(function () {
        if (btn) btn.disabled = false;
      });
      return;
    }
    if (act === 'reply') {
      const ta = qs('#reply');
      const v = ta && ta.value.trim();
      if (!v) { toast('回复内容不能为空', '✏️'); return; }
      if (S.route === 'space') {
        const uid = S.spaceUser;
        (S.msgs[uid] = S.msgs[uid] || []).push({ user: ME(), time: '刚刚', text: v });
        toast('留言已发布', '💬'); render(true); return;
      }
      const tid = S.threadId;
      (S.newFloors[tid] = S.newFloors[tid] || []).push({ user: ME(), time: '刚刚', text: v, likes: 0, reactions: {} });
      toast('回复已发布', '✅'); render(true); return;
    }
    if (act === 'newthread') { S.composerOpen = !S.composerOpen; render(true); return; }
    if (act === 'ntcancel') { S.composerOpen = false; render(true); return; }
    if (act === 'ntsubmit') {
      const titleEl = qs('#nt-title'), catEl = qs('#nt-cat'), tagEl = qs('#nt-tag'), bodyEl = qs('#nt-body'), subEl = qs('#nt-sub');
      const T = titleEl && titleEl.value.trim(), B = bodyEl && bodyEl.value.trim();
      if (!T || !B) { toast('标题和正文都要填', '✏️'); return; }
      if (T.length > 60) { toast('标题最多 60 个字符', '✏️'); return; }
      const tag = tagEl.value;
      /* 副标题：作者写了就用，没写取正文第一句（到第一个句末标点），再兜底切 80 字。
         以前是正文前 80 字直接当摘要，经常在句子中间断开。 */
      const subIn = subEl ? subEl.value.trim() : '';
      const autoSub = B.replace(/\s+/g, ' ').split(/[。！？!?\n]/)[0].slice(0, 80);
      const sub = (subIn || autoSub).slice(0, 80);
      const id = 'n' + Date.now();
      S.newThreads.unshift({
        id: id, user: ME(), cat: catEl.value, tag: tag, title: T, sub: sub,
        excerpt: sub, body: B, replies: 0, views: 1,
        last: '刚刚', hot: false, top: false, solved: false, closed: false, unread: false,
        tags: [tag], created: '刚刚', lastUser: ME(), posters: [ME()],
        likes: 0, reactions: {}, plugin: '',
        images: (S.ntImages || []).map(function (im) { return { kind: 'shot', src: im.src, w: im.w, h: im.h }; })
      });
      const nImg = (S.ntImages || []).length;
      S.ntImages = [];
      S.composerOpen = false;
      S.threadId = id; S.route = 'thread';
      toast(nImg ? '发帖成功，含 ' + nImg + ' 张图片' : '发帖成功，已创建新话题', '🎉');
      render(false); return;
    }
    if (act === 'quote') {
      const ta = qs('#reply');
      /* 记下被引用的楼层文本：上面的「🔗 引用」按钮要能把它带进回复框。
         楼层上的「回复」按钮只带 @昵称，引用块由引用按钮显式插入。 */
      const fEl = el.closest('.floor');
      S.quoteText = fEl && fEl.querySelector('p') ? fEl.querySelector('p').textContent.slice(0, 120) : '';
      if (ta) { ta.value = '回复 @' + el.dataset.name + '：'; ta.focus(); }
      return;
    }
    /* 回复框三个轻工具：都在光标处插入文本，不新建编辑器也不重绘 */
    if (act === 'emoji' || act === 'mention' || act === 'rpquote') {
      const ta = qs('#reply');
      if (!ta) return;
      const curT = threadPool().filter(function (x) { return x.id === S.threadId; })[0];
      const ins = act === 'emoji' ? '🙂 ' : (act === 'mention' ? '@' + esc(curT ? (users[curT.user] || users.u1).name : users[ME()].name) + ' ' : '');
      if (act === 'rpquote') {
        const q = (S.quoteText || '').trim();
        if (!q) { toast('先在上面的楼层点「回复」，引用内容才会带过来', '🔗'); return; }
        ta.value = (ta.value ? ta.value + '\n' : '') + '> ' + q + '\n';
      } else {
        const at = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
        ta.value = ta.value.slice(0, at) + ins + ta.value.slice(at);
        try { ta.setSelectionRange(at + ins.length, at + ins.length); } catch (e) {}
      }
      ta.focus();
      return;
    }
    if (act === 'follow') {
      S.follow = !S.follow;
      toast(S.follow ? '已关注该用户' : '已取消关注', S.follow ? '➕' : '➖');
      render(true); return;
    }
    if (act === 'lb') {
      const pid = el.dataset.pid, idx = +el.dataset.idx;
      const p = posts.concat(S.published).filter(x => x.id === pid)[0];
      let img;
      if (p) img = (p.images || [])[idx];
      if (!img) {
        const styles = getComputedStyle(el);
        img = { grad: styles.backgroundImage, title: '相册 0' + (idx + 1), note: profileOf(S.spaceUser).nick + '的相册' };
      }
      lbReturnFocus = 'lb|' + pid + '|' + idx;
      /* 真图走 src 大图，演示占位图继续用渐变 —— 两种来源共用一个灯箱 */
      S.lb = {
        grad: img.grad || 'linear-gradient(135deg,#8fb6dd,#5f87b3)',
        src: img.full || img.src || '',
        title: img.title || img.label || '',
        note: img.note || ''
      };
      render(true); return;
    }
    if (act === 'lbt') {
      const tid = el.dataset.tid, idx = +el.dataset.idx;
      const t = threadPool().filter(function (x) { return x.id === tid; })[0];
      const img = t && (t.images || [])[idx];
      if (!img) return;
      lbReturnFocus = 'lbt|' + tid + '|' + idx;
      S.lb = { grad: 'linear-gradient(135deg,#8fb6dd,#5f87b3)', src: img.src, title: t.title.slice(0, 24), note: '主楼配图' };
      render(true); return;
    }
    if (act === 'close-lb') { closeLightbox(); return; }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && S.lb) { closeLightbox(); return; }
    if (e.key === 'Escape' && S.pop) { closePop(); return; }
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('cin')) {
      e.preventDefault();
      const btn = qs('[data-act="sendcmt"][data-pid="' + e.target.dataset.pid + '"]');
      if (btn) btn.click();
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'ccount') return;
    if (e.target.id === 'composer') {
      const c = qs('#ccount');
      if (c) c.textContent = e.target.value.length + ' / 500';
      return;
    }
    if (e.target.id === 'mktq') {
      S.q = e.target.value;
      if (S.q.trim()) S.cat = '全部';
      render(true);
      const i = qs('#mktq');
      if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
      return;
    }
    if (e.target.id === 'forumq') {
      S.q = e.target.value;
      if (S.q.trim()) S.ftag = '全部';
      render(true);
      const i = qs('#forumq');
      if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
      return;
    }
    /* v8 · 发布插件：同样只改状态与局部文案，输入时不重绘 */
    if (e.target.id === 'pub-name') {
      const pb = pubOf();
      /* 包名容错：大写转小写、空格与下划线转连字符，其余非法字符直接剥掉 */
      const cleaned = e.target.value.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');
      if (cleaned !== e.target.value) {
        const pos = e.target.selectionStart;
        e.target.value = cleaned;
        try { e.target.setSelectionRange(pos, pos); } catch (err) {}
      }
      pb.name = cleaned;
      const tip = qs('#pub-name-tip');
      if (tip) {
        tip.innerHTML = pubNameOk(cleaned)
          ? '包名可用：<b>' + esc(cleaned) + '</b> · 装好后命令是 <b>pnpm dsh add ' + esc(cleaned) + '</b>'
          : (cleaned ? '只能用<strong>小写字母、数字、连字符</strong>，2~39 个字符，且以字母或数字开头。'
            : '包名决定安装命令，建议 <b>dsh-</b> 开头，全小写。');
      }
      const pv = qs('.pub-prev .pp-tx b'); if (pv) pv.textContent = cleaned || 'dsh-my-plugin';
      syncPubSubmit();
      return;
    }
    if (e.target.id === 'pub-desc') { pubOf().desc = e.target.value; return; }
    /* v7 · 编辑资料：只改草稿，不整页重绘（否则输入时焦点会跳） */
    if (e.target.id === 'pro-nick') {
      draftOf().nick = e.target.value;
      const n = qs('#pro-nick-n'); if (n) n.textContent = e.target.value.length + ' / 16';
      const b = qs('.prev-tx b'); if (b) b.textContent = e.target.value || '（未填写昵称）';
      return;
    }
    if (e.target.id === 'pro-sig') {
      draftOf().sig = e.target.value;
      const n = qs('#pro-sig-n'); if (n) n.textContent = e.target.value.length + ' / 60';
      const p = qs('.prev-tx p'); if (p) p.textContent = e.target.value || '这个人很懒，什么都没写。';
      return;
    }
  });

  /* v7 · 编辑资料：下拉选择与头像文件 */
  document.addEventListener('change', function (e) {
    const id = e.target.id;
    if (id === 'ava-file') return handleAvatarFile(e.target);
    /* 日志 / 社群发帖的文件选择：走同一个 addImages，选完把 input 复位，
       否则同一张图选第二次不再触发 change。 */
    if (id === 'cmt-file' || id === 'nt-file') {
      const q = id === 'cmt-file' ? 'pendingImages' : 'ntImages';
      const prev = id === 'cmt-file' ? 'imgprev' : 'ntprev';
      /* 必须先拷成真数组：把 input.value 置空会把 FileList 一起清掉（它是活引用），
         直接传 e.target.files 进去等于传了个空列表。 */
      const files = Array.prototype.slice.call(e.target.files || []);
      e.target.value = '';
      addImages(files, q).then(function () { repaintImgs(q, prev); });
      return;
    }
    if (id === 'pro-prov') {
      const d = draftOf();
      d.province = e.target.value;
      d.city = (profileOptions.provinces[d.province] || [''])[0];
      render(true);
      const s = qs('#pro-prov'); if (s) s.focus();
      return;
    }
    if (id === 'pro-city') { draftOf().city = e.target.value; render(true); const s = qs('#pro-city'); if (s) s.focus(); return; }
    if (id === 'pro-job') { draftOf().job = e.target.value; render(true); const s = qs('#pro-job'); if (s) s.focus(); return; }
    if (id === 'pub-license') { pubOf().license = e.target.value; render(true); const s = qs('#pub-license'); if (s) s.focus(); return; }
    if (id === 'pro-birth') {
      if (e.target.value) draftOf().birthday = e.target.value;
      render(true); const s = qs('#pro-birth'); if (s) s.focus(); return;
    }
  });

  /* ---------- 粘贴 / 拖拽配图 ----------
     两条路都只在「写日志」和「社群发新帖」的输入区里生效，别的地方粘贴图片不该有副作用。 */
  function editorOf(node) {
    const el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    if (!el || !el.closest) return null;
    if (el.closest('#composer')) return { queue: 'pendingImages', prev: 'imgprev' };
    if (el.closest('#nt-body') || el.closest('.newthread-card')) return { queue: 'ntImages', prev: 'ntprev' };
    return null;
  }

  document.addEventListener('paste', function (e) {
    const box = editorOf(e.target);
    if (!box || !e.clipboardData) return;
    const files = [];
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      const it = e.clipboardData.items[i];
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f && IMG_TYPES.indexOf(f.type) >= 0) files.push(f);
      }
    }
    if (!files.length) return;
    /* 只拦有图的粘贴：纯文字粘贴必须保持浏览器原生行为 */
    e.preventDefault();
    addImages(files, box.queue).then(function (n) {
      repaintImgs(box.queue, box.prev);
      if (n) toast(n + ' 张图片已加进待发布，发表时一起上传', '🖼️');
    });
  });

  document.addEventListener('dragover', function (e) {
    if (!editorOf(e.target)) return;
    if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const zone = e.target.closest('#composer') || e.target.closest('.newthread-card');
    if (zone) zone.classList.add('drop-hot');
  });

  document.addEventListener('dragleave', function (e) {
    const zone = e.target.closest && (e.target.closest('#composer') || e.target.closest('.newthread-card'));
    if (zone) zone.classList.remove('drop-hot');
  });

  document.addEventListener('drop', function (e) {
    const box = editorOf(e.target);
    if (!box) return;
    const zone = e.target.closest && (e.target.closest('#composer') || e.target.closest('.newthread-card'));
    if (zone) zone.classList.remove('drop-hot');
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    const files = Array.prototype.filter.call(e.dataTransfer.files, function (f) { return IMG_TYPES.indexOf(f.type) >= 0; });
    if (!files.length) { toast('只能拖图片进来（PNG / JPG / GIF / WebP）', '⚠️'); return; }
    addImages(files, box.queue).then(function (n) {
      repaintImgs(box.queue, box.prev);
      if (n) toast(n + ' 张图片已加进待发布，发表时一起上传', '🖼️');
    });
  });

  /* 发布页：输入时只切换提交键的可用态与左侧提示，不整页重绘 */
  function syncPubSubmit() { recalcPub(); }

  /* 本地图片 → 方形裁切 200px → dataURL（只进 localStorage，不上传）。
     类型/体积不合格时不弹系统框，直接在页面上说明原因。 */
  function handleAvatarFile(input) {
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(f.type)) {
      S.fileErr = '只支持 JPG / PNG / WebP'; render(true); toast('只支持 JPG / PNG / WebP', '⚠️'); return;
    }
    if (f.size > 4 * 1024 * 1024) {
      S.fileErr = '图片超过 4 MB，换一张小一点的'; render(true); toast('图片超过 4 MB', '⚠️'); return;
    }
    const rd = new FileReader();
    rd.onload = function () {
      const im = new Image();
      im.onload = function () {
        const side = Math.min(im.width, im.height);
        const sx = Math.round((im.width - side) / 2), sy = Math.round((im.height - side) / 2);
        const out = Math.min(200, side);
        const cv = document.createElement('canvas');
        cv.width = out; cv.height = out;
        const g = cv.getContext('2d');
        g.drawImage(im, sx, sy, side, side, 0, 0, out, out);
        let url = '';
        try { url = cv.toDataURL('image/jpeg', .85); } catch (err) { url = ''; }
        if (!url) { S.fileErr = '这张图处理失败，换一张试试'; render(true); toast('这张图处理失败', '⚠️'); return; }
        acct().avatar = { img: url }; S.fileErr = ''; saveState(); render(true);
        toast('头像已更新', '🖼️');
      };
      im.onerror = function () { S.fileErr = '图片读不出来，换一张试试'; render(true); toast('图片读不出来', '⚠️'); };
      im.src = rd.result;
    };
    rd.onerror = function () { S.fileErr = '图片读不出来，换一张试试'; render(true); };
    rd.readAsDataURL(f);
  }

  document.addEventListener('keydown', function (e) {
    const kEl = e.target;
    if (kEl instanceof HTMLElement && kEl.getAttribute('role') === 'button' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      kEl.click();
      return;
    }
    if (e.target.id === 'navq' && e.key === 'Enter') {
      smartSearch(e.target.value); e.target.blur();
    }
    if (e.target.id === 'mktq' && e.key === 'Enter') e.target.blur();
  });

  /* 右下浮动按钮：写日志 / 回到顶部 */
  const totop = document.getElementById('totop');
  const fabWrite = document.getElementById('fab-write');
  const fabTop = document.getElementById('fab-top');
  if (fabTop) fabTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: scrollMode() }));
  if (fabWrite) {
    /* ✎ 按路由分派：帖子详情回复本帖、社群发新帖、其余写日志。
       旧实现一律跳首页，会把回复框里打了一半的字静默吞掉。 */
    fabWrite.addEventListener('click', () => {
      let target = null;
      if (S.route === 'thread') {
        target = qs('#reply');
        if (!target) { toast('这一页没有回复框', '✍️'); return; }
      } else if (S.route === 'forum') {
        S.composerOpen = !S.composerOpen;
        render(true);
        target = qs('.newthread-card input') || qs('.newthread-card textarea');
        if (!target) { toast('已打开发新帖表单', '✍️'); return; }
      } else {
        if (S.route !== 'feed') { S.route = 'feed'; S.q = ''; S.pop = null; render(false); }
        target = qs('#composer');
        if (!target) { toast('已回到日志页，点输入框写点什么', '✍️'); return; }
      }
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'center', behavior: scrollMode() });
      /* 图标按钮的提示文案跟当前路由对齐 */
      const label = S.route === 'thread' ? '回复本帖' : S.route === 'forum' ? '发新帖' : '写日志';
      fabWrite.setAttribute('aria-label', label);
      fabWrite.setAttribute('title', label);
    });
  }
  /* ↑ 只在超过一屏后出现；隐藏时必须从 Tab 序列里退出去，
     否则键盘会停在一个看不见的按钮上 */
  window.addEventListener('scroll', () => {
    if (!totop) return;
    const show = window.scrollY > 320;
    totop.classList.toggle('show', show);
    if (fabTop) {
      fabTop.disabled = !show;
      fabTop.setAttribute('aria-hidden', show ? 'false' : 'true');
      fabTop.tabIndex = show ? 0 : -1;
    }
  }, { passive: true });

  try {
    const t = localStorage.getItem('dsh-forum-theme');
    if (t) document.documentElement.dataset.theme = t;
  } catch (err) {}

  /* 调试/自动化钩子：不参与业务逻辑 */
  window.__dsh = { render: function (k) { render(k); }, state: S, data: D, gate: gateRoute };
  window.__dshAuth = window.AUTH || null;

  /* 品牌名同步到标签页标题（配合 ?b= 预览时也能立刻看到） */
  document.title = BR.full;
  var md = document.querySelector('meta[name="description"]');
  if (md) md.setAttribute('content', BR.name + ' —— 仿 QQ 空间风格的社群前端：更新日志流、插件条目库、社群版块、聊天与个人空间。');

  /* 内核已经登录着某个账号时，把「我是谁」对齐到它 —— 刷新后不会掉回演示账号 u1。
     只对齐身份，不写会话：写会话是 AUTH 的事，页面只读。 */
  (function syncBootIdentity() {
    const st = authState();
    if (st.mode === 'authed' && st.uid) adoptAccount(st.uid, st.name);
  })();

  applyHash();
  window.addEventListener('hashchange', function () {
    /* 自己 pushState 写出的 hash 也会触发 hashchange，直接忽略；只有真实后退/前进才处理 */
    if (location.hash === lastHashShown) return;
    if (applyHash()) render(false);
  });

  render(false);
})();

/* ============ 品牌配置 · 只改这一个文件就能整体换名 ============ */
/* 现用名：鲸域（whale realm）· 定位语已清空（desc 为空串时 full 只等于 name）
   历史候选仍保留在数组里，地址后加 ?b=1 / ?b=2 …（或 ?b=坞 这样的关键字）可直接预览。
   定下来后只改 window.BRAND_INDEX 的默认返回值 i。 */
window.BRANDS = [
  {
    name: "鲸域", en: "whale realm", mark: "鲸",
    slogan: "深水里，聊点真的",
    desc: "",
    note: "鲸 = 深水里的大块头，域 = 一片开阔的水面。比「坞」大气，社群与聊天两条腿都撑得住。"
  },
  {
    name: "插件坞", en: "plugin dock", mark: "D",
    slogan: "把插件写成作品",
    desc: "DSH 插件社群",
    note: "坞 = 船停靠的地方，插件也是往宿主里 dock。短、好念、好做图标。"
  },
  {
    name: "插件巷", en: "plugin alley", mark: "巷",
    slogan: "一条有烟火气的巷子",
    desc: "DSH 插件社群",
    note: "最像 QQ 空间那种邻里串门感，社群味最足；略偏文艺。"
  },
  {
    name: "插件客栈", en: "plugin inn", mark: "栈",
    slogan: "来坐坐再走",
    desc: "DSH 插件社群",
    note: "社交感最强，天然配「留言 / 访客 / 打招呼」；名字偏长。"
  },
  {
    name: "插件广场", en: "plugin plaza", mark: "广",
    slogan: "广场上见",
    desc: "DSH 插件社群",
    note: "最稳、最不会出错，社群通用词；个性最弱。"
  },
  {
    name: "插件湾", en: "plugin bay", mark: "湾",
    slogan: "在这儿靠岸",
    desc: "DSH 插件社群",
    note: "比「坞」柔和，画面感强；偏向工具集散地。"
  },
  {
    name: "插件星图", en: "plugin atlas", mark: "星",
    slogan: "把插件连成星图",
    desc: "DSH 插件社群",
    note: "适合讲生态、依赖关系与发现；浪漫，但日常口语里叫不顺。"
  }
];

/* 支持 ?b=序号 或 ?b=关键字 预览 */
window.BRAND_INDEX = (function () {
  var i = 0;
  try {
    var q = new URLSearchParams(location.search).get('b');
    if (q !== null && q !== '') {
      var n = parseInt(q, 10);
      if (!isNaN(n) && window.BRANDS[n]) return n;
      for (var k = 0; k < window.BRANDS.length; k++) {
        if (window.BRANDS[k].name.indexOf(q) >= 0 || window.BRANDS[k].en.indexOf(q) >= 0) return k;
      }
    }
  } catch (e) {}
  return i;
})();

window.BRAND = (function () {
  var b = window.BRANDS[window.BRAND_INDEX] || window.BRANDS[0];
  return {
    name: b.name,
    full: b.desc ? b.name + " · " + b.desc : b.name,
    desc: b.desc,
    en: b.en,
    mark: b.mark,
    slogan: b.slogan,
    note: b.note,
    index: window.BRAND_INDEX,
    all: window.BRANDS
  };
})();

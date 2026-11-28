/* مخزن زهرة — stock app: materials, products, recipes, production */
(function () {
  'use strict';

  var LS = 'zahra_stock_v1';
  var db = null;
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; render(); });
  var ui = { screen: 'home', tab: 'materials', q: '', itemId: null, makeId: null, units: 1, sheet: null };

  /* ---------- storage ---------- */
  function save() {
    try { localStorage.setItem(LS, JSON.stringify(db)); } catch (e) { toast('المساحة على الجهاز اتملّت'); }
  }
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(LS); } catch (e) {}
    if (raw) { try { return JSON.parse(raw); } catch (e) {} }
    var fresh = { v: 1, items: [], moves: [], created: new Date().toISOString() };
    (window.SEED_PRODUCTS || []).forEach(function (p) {
      fresh.items.push({ id: 'pr_' + p.code, kind: 'product', name: p.name, cat: p.cat || '', code: p.code || '', photo: p.photo || '', unit: 'قطعة', min: 0, recipe: [] });
    });
    return fresh;
  }
  function uid(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- helpers ---------- */
  function fmt(n) {
    if (n == null || isNaN(n)) return '0';
    var r = Math.round(n * 1000) / 1000;
    return String(r).replace(/\.0+$/, '');
  }
  function item(id) { for (var i = 0; i < db.items.length; i++) if (db.items[i].id === id) return db.items[i]; return null; }
  function balMap() {
    var m = {};
    db.moves.forEach(function (mv) {
      m[mv.itemId] = (m[mv.itemId] || 0) + (mv.dir === 'in' ? mv.qty : -mv.qty);
    });
    return m;
  }
  var BAL = {};
  function recount() { BAL = balMap(); }
  function balance(id) { return BAL[id] || 0; }
  function movesFor(id) {
    return db.moves.filter(function (m) { return m.itemId === id; })
      .sort(function (a, b) { return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0; });
  }
  function materials() { return db.items.filter(function (i) { return i.kind === 'material'; }); }
  function products() { return db.items.filter(function (i) { return i.kind === 'product'; }); }
  function lowStock() {
    return db.items.filter(function (i) { return i.min > 0 && balance(i.id) <= i.min; })
      .sort(function (a, b) { return (balance(a.id) - a.min) - (balance(b.id) - b.min); });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function dt(ts) {
    var d = new Date(ts);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' — ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fmtTime(ts) {
    var d = new Date(ts), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function dayLabel(ts) {
    var d = new Date(ts), t = new Date();
    var same = function (a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
    if (same(d, t)) return 'النهارده';
    var y = new Date(t.getTime() - 86400000);
    if (same(d, y)) return 'امبارح';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  var KIND_LABEL = { opening: 'أول مدة', purchase: 'وارد', production: 'تصنيع', consume: 'صادر للتصنيع', sale: 'صادر', adjust: 'تسوية' };
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2200);
  }


  /* ---------- icons ---------- */
  var ICONS = {
    home: '<path d="M3 10.6 12 3.4l9 7.2"/><path d="M5.6 9.4V21h12.8V9.4"/><path d="M9.8 21v-5.6h4.4V21"/>',
    flask: '<path d="M9.5 3h5"/><path d="M10.4 3v5.7L5.9 18a2 2 0 0 0 1.8 3h8.6a2 2 0 0 0 1.8-3l-4.5-9.3V3"/><path d="M7.6 14.6h8.8"/>',
    box: '<path d="M20.5 8.2 12 3.3 3.5 8.2v7.6L12 20.7l8.5-4.9z"/><path d="M3.5 8.2 12 13.1l8.5-4.9"/><path d="M12 13.1v7.6"/>',
    receipt: '<path d="M6.2 3h11.6v18l-2.9-1.9-2.9 1.9-2.9-1.9L6.2 21z"/><path d="M9.3 8.2h5.4"/><path d="M9.3 12.2h5.4"/>',
    gear: '<circle cx="12" cy="12" r="3.1"/><path d="M19.2 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1h-.2a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5v-.2a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5.2v13.6"/><path d="M5.2 12h13.6"/>',
    minus: '<path d="M5.2 12h13.6"/>',
    edit: '<path d="M12.4 20.4H21"/><path d="M16.6 3.6a2.1 2.1 0 0 1 3 3L7.2 19l-4 1 1-4z"/>',
    down: '<path d="M12 3.4v12"/><path d="M7 10.6l5 5 5-5"/><path d="M4.4 20.6h15.2"/>',
    up: '<path d="M12 20.6v-12"/><path d="M7 13.4l5-5 5 5"/><path d="M4.4 3.4h15.2"/>',
    check: '<path d="M20 6.6 9.4 17.2 4 11.8"/>',
    x: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
    right: '<path d="M5 12h13"/><path d="M12.6 6.2 18.4 12l-5.8 5.8"/>',
    alert: '<path d="M12 4.2 2.9 20h18.2z"/><path d="M12 9.6v4.4"/><path d="M12 17.2h.01"/>',
    spark: '<path d="M12 3.4v4"/><path d="M12 16.6v4"/><path d="M3.4 12h4"/><path d="M16.6 12h4"/><path d="M6.4 6.4l2.4 2.4"/><path d="M15.2 15.2l2.4 2.4"/><path d="M17.6 6.4l-2.4 2.4"/><path d="M8.8 15.2l-2.4 2.4"/>'
  };
  function svg(name, size) {
    var p = ICONS[name] || '';
    return '<svg class="sv" width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }

  /* ---------- shell ---------- */
  function shell(title, sub, body, opts) {
    opts = opts || {};
    var back = opts.back ? '<button class="icon-btn" data-act="back" aria-label="رجوع">' + svg('right', 20) + '</button>' : '';
    var right = opts.right || '';
    return '<div class="topbar">' + back +
      '<div class="grow"><div class="t-title">' + title + '</div>' + (sub ? '<span class="t-sub">' + sub + '</span>' : '') + '</div>' +
      right + '</div>' + '<div class="wrap">' + body + '</div>' + nav();
  }
  function nav() {
    var tabs = [['home', 'home', 'الرئيسية'], ['make', 'flask', 'تصنيع'], ['store', 'box', 'المخزن'], ['log', 'receipt', 'السجل']];
    return '<div class="nav">' + tabs.map(function (t) {
      return '<button data-act="nav" data-v="' + t[0] + '" class="' + (ui.screen === t[0] ? 'on' : '') + '"><span class="ic">' + svg(t[1], 21) + '</span>' + t[2] + '</button>';
    }).join('') + '</div>';
  }
  function thumbHTML(it, cls) {
    if (it.photo) return '<img class="thumb ' + (cls || '') + '" loading="lazy" src="' + esc(it.photo) + '" alt="">';
    return '<div class="thumb ph ' + (cls || '') + '">' + svg(it.kind === 'material' ? 'flask' : 'box', 22) + '</div>';
  }

  /* ---------- home ---------- */
  function renderHome() {
    recount();
    var mats = materials(), prods = products(), low = lowStock();
    var withRecipe = prods.filter(function (p) { return p.recipe && p.recipe.length; }).length;
    var recent = db.moves.slice().sort(function (a, b) { return a.ts < b.ts ? 1 : -1; }).slice(0, 6);
    var body = '';
    body += '<div class="grid2">' +
      '<div class="stat"><div class="n num">' + mats.length + '</div><div class="l">خامة مسجّلة</div></div>' +
      '<div class="stat"><div class="n num">' + prods.length + '</div><div class="l">منتج مسجّل</div></div>' +
      '<div class="stat"><div class="n num" style="color:' + (low.length ? 'var(--red)' : 'inherit') + '">' + low.length + '</div><div class="l">تحت الحد الأدنى</div></div>' +
      '<div class="stat"><div class="n num">' + withRecipe + '<span class="muted" style="font-size:14px">/' + prods.length + '</span></div><div class="l">منتج ليه مكونات</div></div>' +
      '</div>';

    body += '<div class="card"><h3>ابدأ من هنا</h3><div class="stack">' +
      '<button class="btn" data-act="nav" data-v="make">' + svg('flask', 20) + ' سجّل تصنيع ونقص الخامات</button>' +
      '<div class="grid2"><button class="btn ghost sm" style="width:100%" data-act="newItem" data-kind="material">' + svg('plus', 17) + ' خامة جديدة</button>' +
      '<button class="btn ghost sm" style="width:100%" data-act="newItem" data-kind="product">' + svg('plus', 17) + ' منتج جديد</button></div>' +
      '</div>' + (mats.length === 0 ? '<div class="warn" style="margin-top:10px">لسه مفيش خامات. ابدأ بإضافة خاماتك (زيوت، زبدة شيا، عطور…) وأول مدة لكل واحدة.</div>' : '') + '</div>';

    if (low.length) {
      body += '<div class="card"><h3 class="h-ic">' + svg('alert', 17) + ' محتاجة توريد</h3><div class="list">' +
        low.slice(0, 6).map(function (it) {
          return '<button class="item" data-act="openItem" data-id="' + it.id + '">' + thumbHTML(it) +
            '<div class="grow"><div class="nm">' + esc(it.name) + '</div><div class="meta">الحد الأدنى ' + fmt(it.min) + ' ' + esc(it.unit) + '</div></div>' +
            '<div class="bal neg num">' + fmt(balance(it.id)) + '<small>' + esc(it.unit) + '</small></div></button>';
        }).join('') + '</div></div>';
    }

    body += '<div class="card"><h3>آخر الحركات</h3>' + (recent.length ? '<div class="list">' + recent.map(moveRow).join('') + '</div>'
      : '<div class="empty">مفيش حركات لسه. أول ما تسجّل تصنيع أو توريد هتلاقيها هنا.</div>') + '</div>';
    if (deferredPrompt) body += '<button class="btn gold" style="margin-bottom:12px" data-act="install">' + svg('down', 19) + ' ثبّت التطبيق على الشاشة</button>';
    body += '<div class="muted" style="text-align:center;padding:6px 0 2px">البيانات محفوظة على الموبايل ده. اعمل نسخة احتياطية من الإعدادات</div>';
    return shell('مخزن زهرة', 'ZAHRA NATURAL PRODUCTS', body,
      { right: '<button class="icon-btn" data-act="nav" data-v="settings" aria-label="إعدادات">' + svg('gear', 20) + '</button>' });
  }

  function moveRow(m) {
    var it = item(m.itemId) || { name: 'محذوف', unit: '' };
    var cls = m.dir === 'in' ? 'in' : 'out';
    var sign = m.dir === 'in' ? '+' : '−';
    var lbl = KIND_LABEL[m.kind] || m.kind;
    return '<div class="item" style="box-shadow:none;background:#fff">' +
      '<div class="grow"><div class="nm">' + esc(it.name) + ' <span class="tag ' + (m.dir === 'out' ? 'out' : '') + '">' + esc(lbl) + '</span></div>' +
      '<div class="meta">' + dayLabel(m.ts) + (m.note ? ' · ' + esc(m.note) : '') + '</div></div>' +
      '<div class="bal ' + cls + ' num" style="color:' + (m.dir === 'in' ? 'var(--green-2)' : 'var(--red)') + '">' + sign + fmt(m.qty) +
      '<small>' + esc(it.unit || '') + '</small></div></div>';
  }

  /* ---------- store list ---------- */
  function renderStore() {
    recount();
    var list = (ui.tab === 'materials' ? materials() : products());
    var q = ui.q.trim();
    if (q) list = list.filter(function (i) { return (i.name + ' ' + (i.cat || '') + ' ' + (i.code || '')).indexOf(q) > -1; });
    list = list.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
    var body = '<div class="seg">' +
      '<button data-act="tab" data-v="materials" class="' + (ui.tab === 'materials' ? 'on' : '') + '">الخامات (' + materials().length + ')</button>' +
      '<button data-act="tab" data-v="products" class="' + (ui.tab === 'products' ? 'on' : '') + '">المنتجات (' + products().length + ')</button></div>' +
      '<input class="search" data-act="q" value="' + esc(ui.q) + '" placeholder="دوّر بالاسم أو الكود">' +
      '<button class="btn ghost" style="margin-bottom:12px" data-act="newItem" data-kind="' + (ui.tab === 'materials' ? 'material' : 'product') + '">' + svg('plus', 18) + ' ' + (ui.tab === 'materials' ? 'خامة جديدة' : 'منتج جديد') + '</button>';
    if (!list.length) {
      body += '<div class="empty">' + (q ? 'مفيش نتايج للبحث ده.' : (ui.tab === 'materials' ? 'مفيش خامات لسه. اضغط «خامة جديدة».' : 'مفيش منتجات.')) + '</div>';
    } else {
      body += '<div class="list">' + list.map(function (it) {
        var b = balance(it.id);
        var meta = [];
        if (it.kind === 'product') {
          meta.push(it.recipe && it.recipe.length ? ('مكونات: ' + it.recipe.length) : 'محتاج مكونات');
        }
        if (it.min > 0) meta.push('حد أدنى ' + fmt(it.min));
        if (it.code) meta.push(it.code);
        return '<button class="item" data-act="openItem" data-id="' + it.id + '">' + thumbHTML(it) +
          '<div class="grow"><div class="nm">' + esc(it.name) + '</div><div class="meta">' + esc(meta.join(' · ')) + '</div></div>' +
          '<div class="bal num' + (b < 0 ? ' neg' : '') + '">' + fmt(b) + '<small>' + esc(it.unit) + '</small></div></button>';
      }).join('') + '</div>';
    }
    return shell(ui.tab === 'materials' ? 'الخامات' : 'المنتجات', 'اضغط على أي صنف تشوف كارت الصنف', body, {});
  }

  /* ---------- item card ---------- */
  function renderItem() {
    recount();
    var it = item(ui.itemId);
    if (!it) { ui.screen = 'store'; return renderStore(); }
    var ms = movesFor(it.id);
    var b = balance(it.id);
    var body = '';
    body += '<div class="card">' +
      '<div class="row" style="gap:12px">' + thumbHTML(it, 'thumb') +
      '<div class="grow"><h3 style="font-size:17px">' + esc(it.name) + '</h3><div class="muted">' +
      esc([it.kind === 'material' ? 'خامة' : 'منتج', it.cat, it.code].filter(Boolean).join(' · ')) + '</div></div></div>' +
      '<div class="hr"></div>' +
      '<div class="row between"><div><div class="muted">الرصيد الحالي</div><div class="n num" style="font-size:26px;font-weight:800;color:' + (b < 0 ? 'var(--red)' : 'var(--green)') + '">' + fmt(b) + ' <span style="font-size:15px;font-weight:600">' + esc(it.unit) + '</span></div></div>' +
      '<div style="text-align:left"><div class="muted">الحد الأدنى</div><div class="num" style="font-weight:700">' + (it.min ? fmt(it.min) + ' ' + esc(it.unit) : '—') + '</div></div></div>' +
      (b < 0 ? '<div class="bad" style="margin-top:10px">الرصيد بالسالب. راجع حركات الصنف أو سجّل وارد ناقص.</div>' : '') +
      '</div>';

    body += '<div class="grid2" style="margin-bottom:12px">' +
      '<button class="btn ghost" data-act="sheet" data-v="in">' + svg('plus', 18) + ' وارد</button>' +
      '<button class="btn soft" data-act="sheet" data-v="out">' + svg('minus', 18) + ' صادر</button>' +
      '</div><div class="grid2" style="margin-bottom:12px">' +
      (ms.length === 0 ? '<button class="btn soft" data-act="sheet" data-v="opening">أول مدة</button>' : '<button class="btn soft" data-act="sheet" data-v="adjust">تسوية</button>') +
      (it.kind === 'product' ? '<button class="btn soft" data-act="recipe">' + svg('flask', 18) + ' المكونات</button>' : '<button class="btn soft" data-act="editItem">' + svg('edit', 18) + ' تعديل</button>') +
      '</div>';
    if (it.kind === 'product') {
      body += '<div class="grid2" style="margin-bottom:12px"><button class="btn soft" data-act="editItem">' + svg('edit', 18) + ' تعديل الصنف</button>' +
        '<button class="btn ghost" data-act="makeThis">' + svg('flask', 18) + ' سجّل تصنيع</button></div>';
      if (!(it.recipe && it.recipe.length)) body += '<div class="warn" style="margin-bottom:12px">المنتج ده لسه مفيش ليه مكونات، فالتصنيع مش هينقص خامات. اضغط «المكونات» وحددها.</div>';
    }

    body += '<div class="card"><h3>كارت الصنف</h3>';
    if (!ms.length) body += '<div class="empty">مفيش حركات. ابدأ بـ«أول مدة» لو عندك رصيد موجود.</div>';
    else {
      var run = 0;
      body += '<table class="ledger"><thead><tr><th>التاريخ</th><th>البيان</th><th>وارد</th><th>صادر</th><th>الرصيد</th></tr></thead><tbody>' +
        ms.map(function (m) {
          run += (m.dir === 'in' ? m.qty : -m.qty);
          return '<tr><td class="d">' + dt(m.ts) + '</td><td style="text-align:right">' + esc(KIND_LABEL[m.kind] || '') +
            (m.note ? '<div class="muted" style="font-size:11.5px">' + esc(m.note) + '</div>' : '') + '</td>' +
            '<td class="in num">' + (m.dir === 'in' ? fmt(m.qty) : '') + '</td>' +
            '<td class="out num">' + (m.dir === 'out' ? fmt(m.qty) : '') + '</td>' +
            '<td class="num" style="font-weight:700">' + fmt(run) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    body += '</div>';
    return shell(esc(it.name), it.kind === 'material' ? 'خامة' : 'منتج', body, { back: true });
  }

  /* ---------- make (production) ---------- */
  function renderMake() {
    recount();
    var prods = products().slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
    if (!ui.makeId) {
      var q = ui.q.trim();
      var list = q ? prods.filter(function (p) { return p.name.indexOf(q) > -1; }) : prods;
      var body = '<div class="card"><h3>سجّل تصنيع</h3><div class="muted">اختار المنتج اللي صنعته، والأبليكيشن هينقص الخامات اللي في مكوناته.</div></div>' +
        '<input class="search" data-act="q" value="' + esc(ui.q) + '" placeholder="دوّر على المنتج">';
      body += '<div class="list">' + list.map(function (p) {
        var ok = p.recipe && p.recipe.length;
        return '<button class="item" data-act="pickProduct" data-id="' + p.id + '">' + thumbHTML(p) +
          '<div class="grow"><div class="nm">' + esc(p.name) + '</div><div class="meta">' +
          (ok ? ('مكونات: ' + p.recipe.length + ' خامة · رصيد ' + fmt(balance(p.id)) + ' ' + esc(p.unit))
              : '<span style="color:var(--amber)">محتاج مكونات الأول</span>') + '</div></div>' +
          '<div class="bal num">' + fmt(balance(p.id)) + '<small>' + esc(p.unit) + '</small></div></button>';
      }).join('') + '</div>';
      return shell('تصنيع', 'اختار المنتج', body, {});
    }
    var p = item(ui.makeId);
    if (!p) { ui.makeId = null; return renderMake(); }
    var units = ui.units || 1;
    var rows = (p.recipe || []).map(function (r) {
      var m = item(r.id);
      if (!m) return null;
      var need = r.qty * units;
      var have = balance(m.id);
      return { m: m, need: need, have: have, short: have < need };
    }).filter(Boolean);
    var shorts = rows.filter(function (r) { return r.short; });
    var body = '<div class="card"><div class="row" style="gap:12px">' + thumbHTML(p) +
      '<div class="grow"><h3>' + esc(p.name) + '</h3><div class="muted">' + esc(p.cat || '') + ' · الرصيد الحالي ' + fmt(balance(p.id)) + ' ' + esc(p.unit) + '</div></div>' +
      '<button class="btn sm soft" data-act="clearMake">تغيير</button></div></div>';

    body += '<div class="card"><h3>عدد الوحدات اللي اتصنعت</h3><div class="qty-in">' +
      '<button class="btn soft sm" style="width:52px" data-act="units" data-v="-1">−</button>' +
      '<input id="unitsIn" inputmode="decimal" value="' + fmt(units) + '" data-act="unitsInput">' +
      '<button class="btn soft sm" style="width:52px" data-act="units" data-v="1">+</button></div>' +
      '<div class="muted" style="margin-top:8px">الخامات هتنقص بنسبة عدد الوحدات.</div></div>';

    if (!(p.recipe && p.recipe.length)) {
      body += '<div class="warn" style="margin-bottom:12px">المنتج ده مفيش ليه مكونات مسجلة، فهيتسجل التصنيع من غير ما ينقص خامات.</div>';
    } else {
      body += '<div class="card"><h3>الخامات اللي هتنقص</h3><table class="ledger"><thead><tr><th>الخامة</th><th>المطلوب</th><th>المتاح</th><th>بعد التصنيع</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var after = r.have - r.need;
          return '<tr><td style="text-align:right">' + esc(r.m.name) + '</td><td class="num">' + fmt(r.need) + ' ' + esc(r.m.unit) + '</td>' +
            '<td class="num">' + fmt(r.have) + '</td><td class="num ' + (after < 0 ? 'out' : '') + '">' + fmt(after) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      if (shorts.length) {
        body += '<div class="bad" style="margin-bottom:12px">ناقص: ' + shorts.map(function (r) { return esc(r.m.name) + ' (' + fmt(r.need - r.have) + ' ' + esc(r.m.unit) + ')'; }).join('، ') + '. تقدر تكمل والرصيد هيبقى بالسالب، أو تسجّل وارد الأول.</div>';
      }
    }
    body += '<div class="field"><label class="f">ملاحظة (اختياري)</label><input class="input" id="makeNote" placeholder="مثال: تشغيلة رقم 3"></div>';
    body += '<button class="btn" data-act="doMake">' + svg('check', 19) + ' تم التصنيع</button>';
    return shell('تصنيع', 'تأكيد العملية', body, { back: true });
  }

  /* ---------- log ---------- */
  function renderLog() {
    recount();
    var ms = db.moves.slice().sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
    var body = '';
    if (!ms.length) body = '<div class="empty">السجل فاضي. أول حركة وارد أو تصنيع هتظهر هنا.</div>';
    else {
      var lastDay = null, html = '';
      ms.forEach(function (m) {
        var it = item(m.itemId) || { name: 'صنف محذوف', unit: '' };
        var day = dayLabel(m.ts);
        if (day !== lastDay) { html += '<div class="muted" style="font-weight:700;margin:14px 4px 6px">' + day + '</div>'; lastDay = day; }
        var undo = (m.group && (m.kind === 'production')) ? '<button class="btn sm soft" style="margin-right:6px" data-act="undo" data-v="' + m.group + '">تراجع</button>' : '';
        html += '<div class="item" style="box-shadow:none"><div class="grow"><div class="nm">' + esc(it.name) +
          ' <span class="tag ' + (m.dir === 'out' ? 'out' : '') + '">' + esc(KIND_LABEL[m.kind] || '') + '</span></div>' +
          '<div class="meta">' + fmtTime(m.ts) + (m.note ? ' · ' + esc(m.note) : '') + '</div></div>' +
          '<div class="bal num" style="color:' + (m.dir === 'in' ? 'var(--green-2)' : 'var(--red)') + '">' + (m.dir === 'in' ? '+' : '−') + fmt(m.qty) + '<small>' + esc(it.unit) + '</small></div>' + undo + '</div>';
      });
      body = html;
    }
    return shell('السجل', 'كل الحركات', body, { right: '<button class="icon-btn" data-act="nav" data-v="settings" aria-label="إعدادات">' + svg('gear', 20) + '</button>' });
  }

  /* ---------- settings ---------- */
  function renderSettings() {
    recount();
    var size = 0; try { size = (localStorage.getItem(LS) || '').length; } catch (e) {}
    var body = '<div class="card"><h3>نسخة احتياطية</h3><div class="muted" style="margin-bottom:10px">البيانات متخزنة على الموبايل ده بس. اعمل نسخة كل فترة، ولو غيّرت الموبايل حمّلها هنا.</div>' +
      '<div class="stack"><button class="btn" data-act="export">' + svg('down', 19) + ' نزّل نسخة (ملف)</button>' +
      '<button class="btn soft" data-act="importClick">' + svg('up', 19) + ' استرجاع من ملف</button>' +
      '<input type="file" id="importFile" accept="application/json,.json" hidden data-act="importFile"></div></div>';
    body += '<div class="card"><h3>المخزن</h3>' +
      '<div class="kv"><span class="k">خامات</span><span class="num">' + materials().length + '</span></div>' +
      '<div class="kv"><span class="k">منتجات</span><span class="num">' + products().length + '</span></div>' +
      '<div class="kv"><span class="k">حركات مسجلة</span><span class="num">' + db.moves.length + '</span></div>' +
      '<div class="kv"><span class="k">حجم البيانات</span><span class="num">' + Math.round(size / 1024) + ' كيلوبايت</span></div></div>';
    body += '<div class="card"><h3>تصفير</h3><div class="muted" style="margin-bottom:10px">بيمسح كل الخامات والمنتجات والحركات من الموبايل. اعمل نسخة الأول.</div>' +
      '<button class="btn danger" data-act="reset">امسح كل البيانات</button></div>';
    body += '<div class="card"><h3>عن التطبيق</h3><div class="muted">مخزن زهرة — متابعة خامات ومنتجات ZAHRA NATURAL PRODUCTS: أول مدة، وارد، صادر، وتصنيع بينقص الخامات حسب مكونات كل منتج. شغّال من غير نت بعد أول فتحة.</div></div>';
    return shell('إعدادات', 'نسخة احتياطية وبيانات', body, { back: true });
  }

  /* ---------- item form ---------- */
  var UNITS = ['قطعة', 'جم', 'كجم', 'مل', 'لتر', 'عبوة', 'كيس', 'علبة'];
  function renderItemForm(kind, id) {
    var it = id ? item(id) : null;
    var isNew = !it;
    var k = it ? it.kind : kind;
    var name = it ? it.name : '';
    var unit = it ? it.unit : (k === 'material' ? 'جم' : 'قطعة');
    var min = it ? it.min : 0;
    var cat = it ? (it.cat || '') : '';
    var code = it ? (it.code || '') : '';
    var body = '<div class="field"><label class="f">اسم ' + (k === 'material' ? 'الخامة' : 'المنتج') + '</label>' +
      '<input class="input" id="fName" value="' + esc(name) + '" placeholder="' + (k === 'material' ? 'مثال: زبدة شيا' : 'مثال: صابونة كولد بروسيس لافندر') + '"></div>';
    if (k === 'product') body += '<div class="field"><label class="f">النوع / القسم (اختياري)</label><input class="input" id="fCat" value="' + esc(cat) + '" placeholder="مثال: الصابون"></div>';
    body += '<div class="field"><label class="f">وحدة القياس</label><div class="chips" id="unitChips">' +
      UNITS.map(function (u) { return '<button class="chip ' + (u === unit ? 'on' : '') + '" data-act="pickUnit" data-v="' + u + '">' + u + '</button>'; }).join('') +
      '</div><input class="input" id="fUnit" style="margin-top:8px" value="' + esc(unit) + '" placeholder="أو اكتب وحدة تانية"></div>';
    body += '<div class="field"><label class="f">الحد الأدنى للتنبيه (اختياري)</label><input class="input" id="fMin" inputmode="decimal" value="' + (min ? fmt(min) : '') + '" placeholder="مثال: 500"></div>';
    if (isNew) body += '<div class="field"><label class="f">أول مدة (الرصيد الموجود دلوقتي)</label><input class="input" id="fOpen" inputmode="decimal" value="" placeholder="0"></div>';
    body += '<button class="btn" data-act="saveItem" data-kind="' + k + '" data-id="' + (id || '') + '">حفظ</button>';
    if (!isNew) body += '<button class="btn danger" style="margin-top:10px" data-act="delItem" data-id="' + id + '">حذف الصنف</button>';
    return shell(isNew ? (k === 'material' ? 'خامة جديدة' : 'منتج جديد') : 'تعديل', '', body, { back: true });
  }

  /* ---------- recipe editor ---------- */
  function renderRecipe() {
    recount();
    var p = item(ui.itemId);
    if (!p) { ui.screen = 'store'; return renderStore(); }
    var mats = materials().slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
    var rows = p.recipe || [];
    var body = '<div class="card"><h3>' + esc(p.name) + '</h3><div class="muted">حدد كل خامة وكميتها في الوحدة الواحدة من المنتج. لما تسجّل تصنيع، الكميات دي بتتضرب في عدد الوحدات وتنقص من الخامات.</div></div>';
    if (!mats.length) {
      body += '<div class="warn" style="margin-bottom:12px">مفيش خامات مسجلة. ضيف خاماتك الأول من «المخزن ← الخامات».</div>';
    }
    body += '<div class="card"><h3>المكونات</h3>';
    if (!rows.length) body += '<div class="empty" style="padding:14px">مفيش مكونات لسه.</div>';
    else {
      body += rows.map(function (r, i) {
        var m = item(r.id);
        return '<div class="recipe-row"><div class="grow">' + esc(m ? m.name : 'خامة محذوفة') + '</div>' +
          '<input class="rq num" inputmode="decimal" value="' + fmt(r.qty) + '" data-act="rq" data-i="' + i + '">' +
          '<span class="muted" style="min-width:34px">' + esc(m ? m.unit : '') + '</span>' +
          '<button class="btn sm danger" data-act="recipeDel" data-i="' + i + '" aria-label="حذف">' + svg('x', 16) + '</button></div>';
      }).join('');
    }
    body += '</div>';
    if (mats.length) {
      body += '<div class="card"><h3>ضيف خامة للمكونات</h3>' +
        '<div class="row" style="gap:8px"><select class="input grow" id="addMat"><option value="">اختار خامة…</option>' +
        mats.map(function (m) { return '<option value="' + m.id + '">' + esc(m.name) + ' (' + esc(m.unit) + ')</option>'; }).join('') + '</select>' +
        '<input class="input" id="addQty" inputmode="decimal" placeholder="الكمية" style="width:96px;text-align:center">' +
        '<button class="btn sm ghost" data-act="recipeAdd" aria-label="إضافة">' + svg('plus', 18) + '</button></div></div>';
      var others = products().filter(function (x) { return x.id !== p.id && x.recipe && x.recipe.length; });
      if (others.length) body += '<div class="card"><h3>انسخ مكونات من منتج تاني</h3><div class="muted" style="margin-bottom:8px">مفيد لو نفس التركيبة بريحة مختلفة.</div>' +
        '<div class="row" style="gap:8px"><select class="input grow" id="copyFrom">' + others.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + '</option>'; }).join('') + '</select>' +
        '<button class="btn sm soft" data-act="copyRecipe">انسخ</button></div></div>';
    }
    return shell('مكونات المنتج', esc(p.name), body, { back: true });
  }

  /* ---------- movement sheet ---------- */
  function renderSheet() {
    if (!ui.sheet) return '';
    var it = item(ui.itemId);
    if (!it) return '';
    var t = ui.sheet, title, hint, dir = 'in';
    if (t === 'in') { title = 'وارد — ' + it.name; hint = 'خامات جات المخزن (توريد).'; dir = 'in'; }
    else if (t === 'out') { title = 'صادر — ' + it.name; hint = 'كمية خرجت من المخزن (بيع أو استخدام).'; dir = 'out'; }
    else if (t === 'opening') { title = 'أول مدة — ' + it.name; hint = 'الرصيد الموجود عندك دلوقتي قبل أي حركة.'; dir = 'in'; }
    else { title = 'تسوية — ' + it.name; hint = 'تصحيح الرصيد بزيادة أو نقص.'; dir = 'in'; }
    var extra = (t === 'adjust') ? '<div class="field"><label class="f">النوع</label><div class="seg" id="adjDir"><button class="on" data-act="adjDir" data-v="in">زيادة</button><button data-act="adjDir" data-v="out">نقص</button></div></div>' : '';
    return '<div class="sheet" data-act="sheetBg"><div class="inner">' +
      '<h3>' + esc(title) + '</h3><div class="muted" style="margin-bottom:12px">' + esc(hint) + '</div>' +
      '<div class="field"><label class="f">الكمية (' + esc(it.unit) + ')</label><input class="input" id="mvQty" inputmode="decimal" autofocus placeholder="0"></div>' +
      '<div class="muted" style="margin-bottom:10px">الرصيد الحالي: <b class="num">' + fmt(balance(it.id)) + '</b> ' + esc(it.unit) + '</div>' + extra +
      '<div class="field"><label class="f">ملاحظة (اختياري)</label><input class="input" id="mvNote" placeholder="' + (t === 'in' ? 'مثال: من المورد' : t === 'out' ? 'مثال: طلب عميل' : '') + '"></div>' +
      '<div class="row" style="gap:8px"><button class="btn soft" data-act="closeSheet">إلغاء</button>' +
      '<button class="btn" data-act="doMove" data-v="' + t + '">تأكيد</button></div>' +
      '</div></div>';
  }

  /* ---------- render ---------- */
  function render() {
    recount();
    var app = document.getElementById('app');
    var act = document.activeElement && document.activeElement.getAttribute('data-act');
    var caret = null;
    try { caret = document.activeElement && document.activeElement.selectionStart; } catch (e) {}
    var html = '';
    if (ui.screen === 'home') html = renderHome();
    else if (ui.screen === 'store') html = renderStore();
    else if (ui.screen === 'item') html = renderItem();
    else if (ui.screen === 'make') html = renderMake();
    else if (ui.screen === 'log') html = renderLog();
    else if (ui.screen === 'settings') html = renderSettings();
    else if (ui.screen === 'itemForm') html = renderItemForm(ui.formKind, ui.formId);
    else if (ui.screen === 'recipe') html = renderRecipe();
    else html = renderHome();
    app.innerHTML = html + renderSheet();
    if (act === 'q') {
      var el = app.querySelector('[data-act="q"]');
      if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} }
    } else if (act === 'unitsInput') {
      var u = app.querySelector('[data-act="unitsInput"]');
      if (u) { u.focus(); try { u.setSelectionRange(u.value.length, u.value.length); } catch (e) {} }
    }
    if (render._last !== ui.screen) { render._last = ui.screen; window.scrollTo(0, 0); }
  }

  /* ---------- actions ---------- */
  function go(screen) { ui.screen = screen; ui.sheet = null; render(); }

  function doMove(kind, id) {
    var it = item(id);
    var qtyEl = document.getElementById('mvQty');
    var qty = parseFloat((qtyEl && qtyEl.value || '').replace(/[^\d.\-]/g, ''));
    if (!it) return;
    if (!qty || qty <= 0) { toast('اكتب كمية أكبر من صفر'); return; }
    var dir = kind === 'out' ? 'out' : 'in';
    if (kind === 'adjust') { var seg = document.querySelector('#adjDir button.on'); if (seg) dir = seg.getAttribute('data-v'); }
    var noteEl = document.getElementById('mvNote');
    db.moves.push({
      id: uid('mv'), ts: new Date().toISOString(), itemId: id, dir: dir,
      kind: kind === 'adjust' ? 'adjust' : kind, qty: qty,
      note: (noteEl && noteEl.value || '').trim()
    });
    save(); ui.sheet = null; render();
    toast((KIND_LABEL[kind === 'adjust' ? 'adjust' : kind] || 'تم') + ': ' + fmt(qty) + ' ' + it.unit);
  }

  function doMake() {
    var p = item(ui.makeId);
    if (!p) return;
    var uEl = document.getElementById('unitsIn');
    var units = parseFloat((uEl && uEl.value || '').replace(/[^\d.\-]/g, ''));
    if (!units || units <= 0) { toast('اكتب عدد وحدات أكبر من صفر'); return; }
    var noteEl = document.getElementById('makeNote');
    var note = (noteEl && noteEl.value || '').trim();
    var rows = (p.recipe || []).map(function (r) {
      var m = item(r.id); if (!m) return null;
      return { m: m, need: r.qty * units, have: balance(m.id) };
    }).filter(Boolean);
    var shorts = rows.filter(function (r) { return r.have < r.need; });
    if (shorts.length && !confirm('ناقص: ' + shorts.map(function (r) { return r.m.name + ' (' + fmt(r.need - r.have) + ' ' + r.m.unit + ')'; }).join('، ') + '\n\nتكمل وتسجّل التصنيع؟ الرصيد هيبقى بالسالب.')) return;
    var g = uid('grp'), ts = new Date().toISOString();
    rows.forEach(function (r) {
      db.moves.push({ id: uid('mv'), ts: ts, itemId: r.m.id, dir: 'out', kind: 'consume', qty: r.need, note: note || ('تصنيع ' + fmt(units) + ' ' + p.unit + ' ' + p.name), group: g });
    });
    db.moves.push({ id: uid('mv'), ts: ts, itemId: p.id, dir: 'in', kind: 'production', qty: units, note: note, group: g });
    save();
    ui.makeId = null; ui.units = 1; ui.screen = 'log'; render();
    toast('تم تسجيل تصنيع ' + fmt(units) + ' ' + p.unit + (rows.length ? ' ونقص ' + rows.length + ' خامة' : ''));
  }

  function undoGroup(g) {
    var n = db.moves.filter(function (m) { return m.group === g; }).length;
    if (!n) return;
    if (!confirm('تراجع عن عملية التصنيع دي؟ هترجع الخامات والرصيد زي قبلها.')) return;
    db.moves = db.moves.filter(function (m) { return m.group !== g; });
    save(); render(); toast('تم التراجع');
  }

  function saveItem(kind, id) {
    var name = (document.getElementById('fName').value || '').trim();
    var unit = (document.getElementById('fUnit').value || '').trim() || 'قطعة';
    var minV = parseFloat((document.getElementById('fMin').value || '').replace(/[^\d.\-]/g, '')) || 0;
    var catEl = document.getElementById('fCat');
    var openEl = document.getElementById('fOpen');
    if (!name) { toast('اكتب الاسم'); return; }
    var it = id ? item(id) : null;
    if (it) {
      it.name = name; it.unit = unit; it.min = minV;
      if (catEl) it.cat = (catEl.value || '').trim();
    } else {
      var nid = uid(kind === 'material' ? 'mt' : 'pr');
      it = { id: nid, kind: kind, name: name, unit: unit, min: minV, cat: catEl ? (catEl.value || '').trim() : '', code: '', photo: '', recipe: [] };
      db.items.push(it);
      var op = parseFloat((openEl && openEl.value || '').replace(/[^\d.\-]/g, '')) || 0;
      if (op > 0) db.moves.push({ id: uid('mv'), ts: new Date().toISOString(), itemId: nid, dir: 'in', kind: 'opening', qty: op, note: '' });
    }
    save();
    ui.itemId = it.id; ui.screen = 'item'; render();
    toast('تم الحفظ');
  }

  function delItem(id) {
    var it = item(id);
    if (!it) return;
    var used = products().filter(function (p) { return (p.recipe || []).some(function (r) { return r.id === id; }); });
    var msg = 'تحذف «' + it.name + '»؟ حركاته في السجل هتتشال كمان.';
    if (used.length) msg += '\n\nالخامة دي داخلة في مكونات: ' + used.map(function (p) { return p.name; }).join('، ');
    if (!confirm(msg)) return;
    db.items = db.items.filter(function (x) { return x.id !== id; });
    db.moves = db.moves.filter(function (m) { return m.itemId !== id; });
    db.items.forEach(function (p) { if (p.recipe) p.recipe = p.recipe.filter(function (r) { return r.id !== id; }); });
    save(); ui.screen = 'store'; render(); toast('تم الحذف');
  }

  function exportData() {
    var blob = new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' });
    var a = document.createElement('a');
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    a.href = URL.createObjectURL(blob);
    a.download = 'zahra-stock-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast('النسخة اتنزلت');
  }

  function importData(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        if (!d || !Array.isArray(d.items) || !Array.isArray(d.moves)) throw new Error('bad');
        if (!confirm('استرجاع نسخة فيها ' + d.items.length + ' صنف و' + d.moves.length + ' حركة؟ البيانات الحالية هتتبدل.')) return;
        db = d; save(); ui.screen = 'home'; render(); toast('تم الاسترجاع');
      } catch (e) { toast('الملف مش نسخة صحيحة'); }
    };
    r.readAsText(file);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act'), v = el.getAttribute('data-v'), id = el.getAttribute('data-id');
    if (act === 'sheetBg') { if (ev.target === el) { ui.sheet = null; render(); } return; }
    switch (act) {
      case 'nav': ui.screen = v; ui.makeId = null; ui.q = ''; ui.sheet = null; render(); break;
      case 'back':
        if (ui.screen === 'item') { ui.screen = 'store'; }
        else if (ui.screen === 'itemForm') { ui.screen = ui.formId ? 'item' : 'store'; }
        else if (ui.screen === 'recipe') { ui.screen = 'item'; }
        else if (ui.screen === 'settings') { ui.screen = 'home'; }
        else if (ui.screen === 'make' && ui.makeId) { ui.makeId = null; }
        else { ui.screen = 'home'; }
        render(); break;
      case 'tab': ui.tab = v; ui.q = ''; render(); break;
      case 'openItem': ui.itemId = id; ui.screen = 'item'; render(); break;
      case 'newItem': ui.formKind = el.getAttribute('data-kind') || 'material'; ui.formId = ''; ui.screen = 'itemForm'; render(); break;
      case 'editItem': ui.formKind = item(ui.itemId).kind; ui.formId = ui.itemId; ui.screen = 'itemForm'; render(); break;
      case 'recipe': ui.screen = 'recipe'; render(); break;
      case 'makeThis': ui.makeId = ui.itemId; ui.units = 1; ui.screen = 'make'; render(); break;
      case 'pickProduct':
        ui.makeId = id; ui.units = 1; ui.screen = 'make'; render(); break;
      case 'clearMake': ui.makeId = null; render(); break;
      case 'units': ui.units = Math.max(1, (ui.units || 1) + parseInt(v, 10)); render(); break;
      case 'sheet': ui.sheet = v; render(); break;
      case 'closeSheet': ui.sheet = null; render(); break;
      case 'adjDir':
        el.parentNode.querySelectorAll('button').forEach(function (b) { b.classList.remove('on'); });
        el.classList.add('on'); break;
      case 'doMove': doMove(v, ui.itemId); break;
      case 'doMake': doMake(); break;
      case 'undo': undoGroup(v); break;
      case 'pickUnit':
        document.getElementById('fUnit').value = v;
        el.parentNode.querySelectorAll('.chip').forEach(function (b) { b.classList.remove('on'); });
        el.classList.add('on'); break;
      case 'saveItem': saveItem(el.getAttribute('data-kind'), el.getAttribute('data-id')); break;
      case 'delItem': delItem(el.getAttribute('data-id')); break;
      case 'recipeAdd': {
        var sel = document.getElementById('addMat'), q = document.getElementById('addQty');
        var mid = sel && sel.value, qty = parseFloat((q && q.value || '').replace(/[^\d.\-]/g, ''));
        if (!mid || !qty || qty <= 0) { toast('اختار خامة واكتب كمية'); break; }
        var p = item(ui.itemId);
        p.recipe = p.recipe || [];
        var ex = p.recipe.filter(function (r) { return r.id === mid; })[0];
        if (ex) ex.qty = qty; else p.recipe.push({ id: mid, qty: qty });
        save(); render(); toast('تمت الإضافة'); break;
      }
      case 'recipeDel': {
        var p2 = item(ui.itemId);
        p2.recipe.splice(parseInt(el.getAttribute('data-i'), 10), 1);
        save(); render(); break;
      }
      case 'copyRecipe': {
        var src = item(document.getElementById('copyFrom').value);
        var dst = item(ui.itemId);
        if (!src || !dst) break;
        if (dst.recipe && dst.recipe.length && !confirm('المنتج ده ليه مكونات بالفعل. نستبدلها بمكونات «' + src.name + '»؟')) break;
        dst.recipe = (src.recipe || []).map(function (r) { return { id: r.id, qty: r.qty }; });
        save(); render(); toast('اتنسخت'); break;
      }
      case 'install':
        if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
        break;
      case 'export': exportData(); break;
      case 'importClick': document.getElementById('importFile').click(); break;
      case 'reset':
        if (!confirm('امسح كل البيانات من الموبايل؟')) break;
        if (!confirm('متأكد؟ الخطوة دي مش بترجع.')) break;
        db = load(); try { localStorage.removeItem(LS); } catch (e) {}
        db = load(); save(); ui.screen = 'home'; render(); toast('اتمسح'); break;
    }
  });

  document.addEventListener('input', function (ev) {
    var el = ev.target, act = el.getAttribute && el.getAttribute('data-act');
    if (!act) return;
    if (act === 'q') { ui.q = el.value; render(); }
    else if (act === 'unitsInput') {
      var u = parseFloat((el.value || '').replace(/[^\d.\-]/g, ''));
      if (u > 0) { ui.units = u; render(); }
    } else if (act === 'rq') {
      var p = item(ui.itemId), i = parseInt(el.getAttribute('data-i'), 10);
      var q = parseFloat((el.value || '').replace(/[^\d.\-]/g, ''));
      if (p && p.recipe[i] && q > 0) { p.recipe[i].qty = q; save(); }
    }
  });

  document.addEventListener('change', function (ev) {
    if (ev.target.id === 'importFile' && ev.target.files && ev.target.files[0]) importData(ev.target.files[0]);
  });

  /* ---------- boot ---------- */
  db = load();
  if (!db.moves) db.moves = [];
  if (!db.items) db.items = [];
  recount(); save();
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();

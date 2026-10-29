/* 선대 기관 이상 징후 검토 프로토타입 화면. 실데이터 아님(팀 생성 합성 자료).
   분석 결과는 data.js(파이썬 파이프라인 산출)를 읽기만 한다. 외부 네트워크 호출 없음. */
(function () {
  'use strict';
  var D = window.PROTO_DATA;
  var SHIPS = D.ships;
  var BY_ID = {};
  SHIPS.forEach(function (s) { BY_ID[s.id] = s; });
  var HOLD = D.meta.hold_reasons;
  var P = D.meta.params;
  var TODAY = D.meta.reference_date;
  var LS_KEY = 'proto.state.v1';
  var FIELD_ORDER = ['load_pct', 'rpm', 'speed_kn', 'wave_m', 'exh_temp_c', 'fuel_t_day', 'remarks'];
  var FIELD_NAME = { load_pct: '운전 부하', rpm: '회전수', speed_kn: '속력', wave_m: '파고', exh_temp_c: '대표 배기온도',
    fuel_t_day: '연료 소비', remarks: '비고' };
  var BUNDLE_LABEL = { ship: '선박', indicator: '지표', report_date: '보고일', signal_start: '한계 초과 시작일',
    run: '연속 초과 보고 수', expected_c: '기대값(°C)', actual_c: '보고값(°C)', resid_c: '잔차(°C)', ewma_z: 'EWMA',
    limit_z: '관리한계', load_pct: '부하(%)', rpm: '회전수(rpm)', speed_kn: '속력(kn)', wave_m: '파고(m)',
    load30_pct: '최근 30일 평균 부하(%)', maint_date: '최근 정비일', maint_item: '정비 내용', hold_reason: '보류 사유',
    raw_label: '원문 항목명', raw_loc: '원문 위치', instrument_changed: '계기 교체' };
  // 화면 표시용 한국어 라벨(data.js의 코드는 그대로 둔다)
  var FLAG_LABEL = { RANGE_ERROR: '범위 밖 값', DUPLICATE: '중복 행', MISSING_REQUIRED: '필수 항목 누락',
    UNIT_VALUE_CONVERTED: '단위 값 환산', BASIS_MISMATCH: '계측 기준 불일치', LABEL_VARIANT: '항목명 변형',
    UNIT_CONVERTED: '단위 표기 통일' };
  var ROLE_TEXT = {
    A: '10/15부터 대표 배기온도에 하루 +0.8°C씩 누적되는 지속 편차를 넣은 가상 선박',
    B: '정상 운전. 10/09부터 부하를 약 12%p 낮췄고(학습 범위 안), 10/03·10/04는 부하 47%(학습 범위 밖)',
    C: '10/23 배기밸브 교체(가상) 이후 배기온도 수준이 달라진 가상 선박',
    D: '9/20 신규 매입으로 보고가 40일분뿐인 가상 선박',
    E: '보고 양식 오류(10/04 자릿수 오류, 10/11 중복 행, 10/18 파고 누락)와 기준일 24시간 평균값 보고가 있는 가상 선박'
  };
  var TITLE_SUFFIX = ' · 선대 기관 이상 징후 검토(실데이터 아님)';
  var WARN = '⚠︎'; // ⚠ 텍스트 표시
  var REDUCE = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var NARROW = window.matchMedia ? window.matchMedia('(max-width: 640px)') : { matches: false };

  // ------------------------------------------------------------ state
  function freshState() { return { v: 1, approvals: {}, judgments: [], edits: {} }; }
  function loadState() {
    try {
      var s = JSON.parse(window.localStorage.getItem(LS_KEY) || 'null');
      if (s && s.v === 1) return s;
    } catch (e) { /* storage unavailable */ }
    return freshState();
  }
  var state = loadState();
  function saveState() {
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* keep in memory */ }
  }

  function approvalOf(s) { var a = state.approvals[s.id]; return a ? a.decision : 'pending'; }
  function variantOf(s) {
    var a = approvalOf(s);
    if (a === 'approved' && s.today.variants.approved) return 'approved';
    if (a === 'held') return 'held';
    return 'pending';
  }
  function statusOf(s) { return s.today.variants[variantOf(s)]; }
  function seriesOf(s) {
    return variantOf(s) === 'approved' ? s.series.concat([s.today.points.approved]) : s.series;
  }
  function todayRecord(s) { return s.reports[TODAY]; }

  // ------------------------------------------------------------ format
  function esc(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ok(x) { return x != null && isFinite(x); }
  var NA = '없음'; // 값이 없을 때
  function f1(x) { return !ok(x) ? NA : Number(x).toFixed(1); }
  function f2(x) {
    if (!ok(x)) return NA;
    var v = Number(x);
    if (Math.abs(v) < 0.005) v = 0;
    return (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
  }
  function s1(x) { return !ok(x) ? NA : (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1); }
  function fmtC(x) { return !ok(x) ? NA : f1(x) + '°C'; }
  function fmtSC(x) { return !ok(x) ? NA : s1(x) + '°C'; }
  function md(d) { return d ? Number(d.slice(5, 7)) + '/' + Number(d.slice(8, 10)) : ''; }
  function mdText(t) {
    return String(t == null ? '' : t).replace(/(\d{4})-(\d{2})-(\d{2})/g, function (_, y, m, d) { return Number(m) + '/' + Number(d); });
  }
  function nowLocal() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // ------------------------------------------------------------ toast (live region)
  var toastT = 0, toastW = 0, toastMs = 4000;
  function toastEl() { return document.getElementById('toast'); }
  function hideToast() { clearTimeout(toastT); clearTimeout(toastW); toastEl().classList.remove('show'); }
  function armToast() { clearTimeout(toastT); toastT = setTimeout(hideToast, toastMs); }
  function toast(msg) {
    var t = toastEl();
    clearTimeout(toastW);
    t.textContent = '';
    t.classList.add('show');
    toastMs = Math.max(4000, String(msg).length * 60);
    toastW = setTimeout(function () { t.textContent = msg; }, 50);
    armToast();
  }

  // ------------------------------------------------------------ status marks (색·모양·글자 세 겹)
  function holdText(st) { return esc(HOLD[st.hold_reason] || st.hold_reason) + (st.user_hold ? '(공무감독 보류)' : ''); }
  function badge(st) {
    if (!st) return '';
    if (st.status === 'signal') return '<span class="badge b-signal"><span aria-hidden="true">▲</span>검토 신호</span>';
    if (st.status === 'normal') return '<span class="badge b-normal"><span aria-hidden="true">○</span>신호 없음</span>';
    return '<span class="badge b-hold"><i class="sw" aria-hidden="true"></i>분석 보류 · ' + holdText(st) + '</span>';
  }
  function statusText(st) {
    if (!st) return '';
    if (st.status === 'signal') return '검토 신호';
    if (st.status === 'normal') return '신호 없음';
    return '분석 보류 · ' + (HOLD[st.hold_reason] || st.hold_reason);
  }
  function stateCap(st) { // 세그먼트 칸 안의 짧은 캡션
    if (st.status === 'signal') return '<span class="st-cap sig"><span aria-hidden="true">▲</span>검토 신호</span>';
    if (st.status === 'normal') return '<span class="st-cap"><span aria-hidden="true">○</span>신호 없음</span>';
    return '<span class="st-cap"><i class="sw" aria-hidden="true"></i>분석 보류</span>';
  }
  function approvalBadge(s, asLink) {
    var rec = todayRecord(s);
    var a = approvalOf(s), cls, body;
    if (a === 'approved') { cls = 'ap-ok'; body = '<span aria-hidden="true">✓</span> 승인'; }
    else if (a === 'held') { cls = 'ap-held'; body = '<i class="sw" aria-hidden="true"></i>보류함'; }
    else if (rec && !rec.approvable) { cls = 'ap-block'; body = WARN + ' 승인 불가'; }
    else { cls = 'ap-pend'; body = '… 승인 대기'; }
    if (asLink) return '<a class="ap ' + cls + '" href="#/reports/' + s.id + '">' + body + ' <span aria-hidden="true">›</span></a>';
    return '<span class="ap ' + cls + '">' + body + '</span>';
  }
  function persistText(st) {
    if (st.status === 'signal') return md(st.signal_start) + '부터 ' + st.run + '회 연속 한계 초과';
    if (st.run > 0) return '한계 초과 ' + st.run + '회(신호 전)';
    return '없음';
  }
  function persistCell(st) {
    if (st.status === 'signal') return st.run + '회 연속 초과<span class="cap">' + md(st.signal_start) + '부터</span>';
    if (st.run > 0) return '한계 초과 ' + st.run + '회<span class="cap">신호 전</span>';
    return '초과 없음';
  }
  function mean(a) { var v = a.filter(function (x) { return x != null; }); return v.length ? v.reduce(function (p, c) { return p + c; }, 0) / v.length : null; }

  // ------------------------------------------------------------ charts (실제 픽셀: 1 SVG 단위 = 1px)
  var CHARTS = {};
  var SPECS = {};
  var seq = 0;
  function niceTicks(a, b, n) {
    var span = b - a, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var cands = [1, 2, 2.5, 5, 10].map(function (c) { return c * mag; });
    var step = cands.filter(function (c) { return span / c <= n; })[0] || cands[cands.length - 1];
    var out = [];
    for (var v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(6));
    return out.length < 2 && n < 8 ? niceTicks(a, b, n + 1) : out;
  }
  function fmtTick(t) {
    var s = Math.abs(t) >= 100 || Number.isInteger(t) ? String(Math.round(t * 10) / 10) : t.toFixed(1);
    return s.replace(/^-/, '−');
  }
  function pathD(vals, X, Y) {
    var d = '', pen = false;
    vals.forEach(function (v, i) {
      if (!ok(v)) { pen = false; return; }
      d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1);
      pen = true;
    });
    return d;
  }
  function lastIdx(vals) { for (var i = vals.length - 1; i >= 0; i--) if (ok(vals[i])) return i; return -1; }
  function xLabelIdx(n, k) {
    if (n <= 1) return [0];
    var out = [], step = (n - 1) / (k - 1);
    for (var j = 0; j < k; j++) out.push(Math.round(j * step));
    return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
  }
  function textW(s) {
    var w = 0;
    String(s).split('').forEach(function (ch) { w += /[ᄀ-ᇿ㄰-㆏가-힣]/.test(ch) ? 12 : 7; });
    return w + 12;
  }
  function tri(x, y) { return 'M' + x.toFixed(1) + ',' + (y - 5).toFixed(1) + ' l4.5,8 h-9z'; }
  function hatchDefs(pid) {
    return '<defs><pattern id="' + pid + '" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">' +
      '<rect width="6" height="6" style="fill:var(--hold-bg)"/><line x1="0" y1="0" x2="0" y2="6" style="stroke:var(--hatch-area);stroke-width:3"/></pattern></defs>';
  }
  function chartSlot(o) { var k = 'p' + (++seq); SPECS[k] = o; return '<div class="chart" data-spec="' + k + '"></div>'; }

  /* o: {dates, series:[{label, cls, values}], refs:[{y,label,cls}], bands:[{from,to,cls,label}],
         holds:[i], marks:[{i,y}], zoneAbove, ribbons:[[a,b]], ribbonTop, ribbonBot, unit, padFrac,
         w, h, xCount, ticks, direct, tip(i), aria} */
  function chart(o, k) {
    var id = 'c' + (++seq);
    var W = Math.max(200, Math.round(o.w || 760)), H = o.h || 240;
    var narrow = W < 480;
    var xCount = narrow ? Math.min(4, o.xCount || 6) : (o.xCount || 6);
    var nTicks = narrow ? 3 : (o.ticks || 4);
    var n = o.dates.length;
    var vals = [];
    o.series.forEach(function (s) { s.values.forEach(function (v) { if (ok(v)) vals.push(v); }); });
    (o.refs || []).forEach(function (r) { vals.push(r.y); });
    if (!vals.length) vals = [0, 1];
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    var pad = (hi - lo) * (o.padFrac || 0.08); lo -= pad; hi += pad;
    // direct labels decide the right margin
    var defs = [];
    (o.refs || []).forEach(function (r) { if (r.label) defs.push({ text: r.label, cls: 'lbl', v: r.y, edge: true }); });
    if (o.direct !== false) o.series.forEach(function (s) {
      if (!s.label) return;
      var li = lastIdx(s.values);
      if (li >= 0) defs.push({ text: s.label, cls: 'lbl-strong', v: s.values[li], i: li });
    });
    var lw = 0;
    defs.forEach(function (d) { lw = Math.max(lw, textW(d.text)); });
    var hasTop = (o.bands || []).some(function (b) { return b.label; }) || !!o.unit;
    var m = { l: 40, r: defs.length ? lw + 6 : 12, t: hasTop ? 24 : 12, b: 24 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var step = n > 1 ? iw / (n - 1) : iw;
    function X(i) { return m.l + (n > 1 ? i * step : iw / 2); }
    function Y(v) { return m.t + (1 - (v - lo) / (hi - lo)) * ih; }
    var g = '', bandLabels = [];
    (o.bands || []).forEach(function (b) {
      if (b.from < 0 || b.to < 0) return;
      var x0 = Math.max(m.l, X(b.from) - step / 2), x1 = Math.min(m.l + iw, X(b.to) + step / 2);
      if (b.cls === 'band-mon') g += '<path class="band-mon" d="M' + x0.toFixed(1) + ' ' + (m.t + 3) + 'V' + (m.t - 3) + 'H' + x1.toFixed(1) + 'V' + (m.t + 3) + '"/>';
      else g += '<rect class="' + b.cls + '" x="' + x0.toFixed(1) + '" y="' + m.t + '" width="' + Math.max(0, x1 - x0).toFixed(1) + '" height="' + ih + '"/>';
      if (b.label) bandLabels.push({ x: x0 + 4, w: textW(b.label) - 12, text: b.label, pri: b.cls === 'band-mon' ? 0 : 1 });
    });
    // 구간 라벨: 감시 구간을 먼저 놓고, 겹치는 라벨은 뺀다(범례에 같은 뜻이 있음)
    var placed = [];
    bandLabels.slice().sort(function (a, b) { return a.pri - b.pri; }).forEach(function (l) {
      var hit = placed.some(function (p) { return l.x < p.x + p.w + 8 && p.x < l.x + l.w + 8; });
      if (!hit && l.x + l.w <= W) { placed.push(l); g += '<text x="' + l.x.toFixed(1) + '" y="' + (m.t - 8) + '">' + esc(l.text) + '</text>'; }
    });
    if (o.zoneAbove != null && o.zoneAbove < hi) {
      var zy = Math.max(m.t, Y(o.zoneAbove));
      g += '<rect class="zone-over" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + (zy - m.t).toFixed(1) + '"/>';
    }
    if ((o.holds || []).length) {
      g += hatchDefs('hp' + id);
      var hw = Math.max(step, 3);
      o.holds.forEach(function (i) {
        g += '<rect style="fill:url(#hp' + id + ')" x="' + (X(i) - hw / 2).toFixed(1) + '" y="' + m.t + '" width="' + hw.toFixed(1) + '" height="' + ih + '"/>';
      });
    }
    var ticks = niceTicks(lo, hi, nTicks);
    g += '<g class="grid">' + ticks.map(function (t) { return '<line x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '"/>'; }).join('') + '</g>';
    g += '<g class="axis">' + ticks.map(function (t) { return '<text x="' + (m.l - 6) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end">' + fmtTick(t) + '</text>'; }).join('');
    g += xLabelIdx(n, xCount).map(function (i) { return '<text x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + md(o.dates[i]) + '</text>'; }).join('') + '</g>';
    if (o.unit) g += '<text class="unit" x="0" y="' + (m.t - 8) + '">' + esc(o.unit) + '</text>';
    (o.ribbons || []).forEach(function (rb) {
      var top = [], bot = [];
      for (var i = rb[0]; i <= rb[1]; i++) {
        var a = o.ribbonTop[i], b = o.ribbonBot[i];
        if (!ok(a) || !ok(b)) continue;
        top.push([X(i), Y(a)]); bot.push([X(i), Y(b)]);
      }
      if (!top.length) return;
      if (top.length === 1) { var h2 = step / 2; top = [[top[0][0] - h2, top[0][1]], [top[0][0] + h2, top[0][1]]]; bot = [[bot[0][0] - h2, bot[0][1]], [bot[0][0] + h2, bot[0][1]]]; }
      var d = 'M' + top.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('L') +
        'L' + bot.reverse().map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('L') + 'Z';
      g += '<path class="res-ribbon" d="' + d + '"/>';
    });
    (o.refs || []).forEach(function (r) {
      g += '<line class="' + (r.cls || 'ref') + '" x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + Y(r.y).toFixed(1) + '" y2="' + Y(r.y).toFixed(1) + '"/>';
    });
    o.series.forEach(function (s) { g += '<path class="' + s.cls + '" d="' + pathD(s.values, X, Y) + '"/>'; });
    (o.marks || []).forEach(function (mk) { g += '<path class="mk-signal" d="' + tri(X(mk.i), Y(mk.y)) + '"/>'; });
    (o.points || []).forEach(function (pt, k) {
      if (pt.i < 0 || !ok(pt.y)) return;
      var px = X(pt.i), py = Y(pt.y), tw = textW(pt.label);
      g += '<circle class="pt ' + (pt.cls || 'pt-ok') + '" cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="5.5"/>';
      var tx = Math.max(m.l, Math.min(m.l + iw - tw, px - tw / 2));
      var ty = k % 2 === 0 ? Math.min(m.t + ih - 4, py + 20) : Math.max(m.t + 12, py - 12);
      g += '<text class="pt-lbl" x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '">' + esc(pt.label) + '</text>';
    });
    // labels: edge labels (refs, series ending at the right edge) are spaced ≥16px
    var edgeX = m.l + iw + 6;
    var labels = defs.map(function (d) {
      var x = d.edge ? edgeX : X(d.i) + 6;
      return { x: x, y: Y(d.v) + 4, text: d.text, cls: d.cls, edge: d.edge || Math.abs(x - edgeX) < 1 };
    });
    var edge = labels.filter(function (l) { return l.edge; }).sort(function (a, b) { return a.y - b.y; });
    for (var q = 1; q < edge.length; q++) if (edge[q].y - edge[q - 1].y < 16) edge[q].y = edge[q - 1].y + 16;
    var over = edge.length ? edge[edge.length - 1].y - (H - 4) : 0;
    if (over > 0) edge.forEach(function (l) { l.y -= over; });
    labels.forEach(function (l) { g += '<text class="' + l.cls + '" x="' + l.x.toFixed(1) + '" y="' + Math.max(12, l.y).toFixed(1) + '">' + esc(l.text) + '</text>'; });
    g += '<line class="crosshair" x1="0" x2="0" y1="' + m.t + '" y2="' + (m.t + ih) + '" visibility="hidden"/>';
    g += '<rect class="hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '"/>';
    CHARTS[id] = { o: o, W: W, X: X, n: n, step: step, m: m };
    return '<div class="chart" id="' + id + '"' + (k ? ' data-spec="' + k + '"' : '') + '><svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.aria || '') + '">' + g + '</svg><div class="tip" hidden></div></div>';
  }
  function bindChart(div) {
    var c = div && CHARTS[div.id];
    if (!c || !c.o.tip) return;
    var svg = div.querySelector('svg'), tip = div.querySelector('.tip');
    var ch = svg.querySelector('.crosshair'), hit = svg.querySelector('.hit');
    hit.addEventListener('pointermove', function (ev) {
      var r = svg.getBoundingClientRect();
      var sx = (ev.clientX - r.left) * c.W / r.width;
      var i = Math.round((sx - c.m.l) / c.step);
      i = Math.max(0, Math.min(c.n - 1, i));
      var x = c.X(i);
      ch.setAttribute('x1', x); ch.setAttribute('x2', x); ch.setAttribute('visibility', 'visible');
      tip.innerHTML = c.o.tip(i); tip.hidden = false;
      var px = x * r.width / c.W;
      var left = px + 14 + tip.offsetWidth > r.width ? px - tip.offsetWidth - 14 : px + 14;
      tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '6px';
    });
    hit.addEventListener('pointerleave', function () { tip.hidden = true; ch.setAttribute('visibility', 'hidden'); });
  }
  function bindCharts(root) { root.querySelectorAll('.chart[id]').forEach(bindChart); }
  function mountCharts(root) {
    root.querySelectorAll('.chart[data-spec]').forEach(function (slot) {
      var k = slot.getAttribute('data-spec'), o = SPECS[k];
      if (!o || slot.id) return;
      o.w = slot.clientWidth || (slot.parentNode && slot.parentNode.clientWidth) || 760;
      slot.outerHTML = chart(o, k);
    });
    bindCharts(root);
  }
  function remountOnResize() {
    document.querySelectorAll('#app .chart[data-spec]').forEach(function (div) {
      var k = div.getAttribute('data-spec'), o = SPECS[k], c = CHARTS[div.id];
      if (!o || !c) return;
      var w = div.clientWidth;
      if (!w || Math.abs(w - c.W) <= 8) return;
      o.w = w;
      div.outerHTML = chart(o, k);
      bindChart(document.querySelector('#app .chart[data-spec="' + k + '"]'));
    });
  }
  function sparkDomain(rows) {
    var all = [];
    rows.forEach(function (r) {
      seriesOf(r.s).filter(function (p) { return p.phase === 'monitor'; }).slice(-30).forEach(function (p) { if (ok(p.ewma)) all.push(p.ewma); });
    });
    return { lo: Math.min.apply(null, [-1].concat(all)), hi: Math.max.apply(null, [2.5].concat(all)) };
  }
  function sparkline(s, dom) {
    var mon = seriesOf(s).filter(function (p) { return p.phase === 'monitor'; }).slice(-30);
    if (!mon.length) return '<span class="cap">자료 없음</span>';
    var W = 200, H = 44, x0 = 2, x1 = 160, pad = 4;
    var lo = dom.lo, hi = dom.hi, lim = P.UCL_z, pid = 'sp-' + s.id;
    var st = statusOf(s);
    function X(i) { return x0 + i * (x1 - x0) / Math.max(1, mon.length - 1); }
    function Y(v) { return pad + (1 - (v - lo) / (hi - lo)) * (H - 2 * pad); }
    var vals = mon.map(function (p) { return p.ewma; });
    var g = '';
    var holds = [];
    mon.forEach(function (p, i) { if (p.hold && p.hold !== 'PENDING') holds.push(i); });
    if (holds.length) {
      g += hatchDefs(pid);
      var hw = Math.max(3, (x1 - x0) / Math.max(1, mon.length - 1));
      holds.forEach(function (i) { g += '<rect style="fill:url(#' + pid + ')" x="' + (X(i) - hw / 2).toFixed(1) + '" y="0" width="' + hw.toFixed(1) + '" height="' + H + '"/>'; });
    }
    g += '<rect class="zone-over" x="' + x0 + '" y="0" width="' + (x1 - x0) + '" height="' + Y(lim).toFixed(1) + '"/>';
    g += '<line class="ref" x1="' + x0 + '" x2="' + x1 + '" y1="' + Y(lim).toFixed(1) + '" y2="' + Y(lim).toFixed(1) + '"/>';
    g += '<path class="s-ewma" d="' + pathD(vals, X, Y) + '"/>';
    var sigVals = mon.map(function (p, i) {
      if (p.sig && ok(p.ewma)) return p.ewma;
      var nx = mon[i + 1];
      return nx && nx.sig && ok(p.ewma) && ok(nx.ewma) ? p.ewma : null;
    });
    g += '<path class="s-sig" d="' + pathD(sigVals, X, Y) + '"/>';
    var li = lastIdx(vals);
    var last = li >= 0 ? mon[li] : mon[mon.length - 1];
    var isSig = st.status === 'signal';
    if (li >= 0) {
      g += '<circle class="dot' + (last.sig ? ' sig' : '') + '" cx="' + X(li).toFixed(1) + '" cy="' + Y(last.ewma).toFixed(1) + '" r="3"/>';
      var ty = Math.max(12, Math.min(42, Y(last.ewma) + 4));
      g += '<text class="spark-end' + (isSig ? ' sig' : '') + '" x="166" y="' + ty.toFixed(1) + '">' + f2(last.ewma) + '</text>';
    }
    var tail = isSig ? md(st.signal_start) + '부터 한계 초과' : st.run > 0 ? '한계 초과 ' + st.run + '회(신호 전)' : '한계 초과 없음';
    var title = '최근 30일 EWMA: ' + md(last.d) + ' ' + f2(last.ewma) + ', 관리한계 ' + f2(lim) + ' · ' + tail;
    return '<div class="chart spark"><svg width="200" height="44" viewBox="0 0 200 44" role="img" aria-label="' + esc(title) + '"><title>' + esc(title) + '</title>' + g + '</svg></div>';
  }

  // ------------------------------------------------------------ small visualizations
  var FEAT_IDX = { load_pct: 0, rpm: 1, speed_kn: 2, wave_m: 3 };
  function svgBox(cls, W, H, title, g) {
    return '<span class="' + cls + '"><svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '"><title>' + esc(title) + '</title>' + g + '</svg>';
  }

  /* 최근 n일 보고값과 기대값(감시 구간). 한계 초과 구간은 두 선 사이를 칠한다 */
  function trendSpec(s, n, h, aria) {
    if (!s.model) return null;
    var mon = seriesOf(s).filter(function (p) { return p.phase === 'monitor'; }).slice(-n);
    if (!mon.length) return null;
    var act = mon.map(function (p) { return p.act; }), exp = mon.map(function (p) { return p.exp == null ? null : p.exp; });
    var holds = [], ribbons = [], r0 = -1;
    mon.forEach(function (p, i) {
      if (p.hold && p.hold !== 'PENDING') holds.push(i);
      var inRun = !p.hold && (p.exc || p.sig);
      if (inRun && r0 < 0) r0 = i;
      if (!inRun && r0 >= 0) { ribbons.push([r0, i - 1]); r0 = -1; }
    });
    if (r0 >= 0) ribbons.push([r0, mon.length - 1]);
    var la = lastIdx(act), le = lastIdx(exp);
    return {
      dates: mon.map(function (p) { return p.d; }), h: h || 120, xCount: 5, ticks: 3, unit: '°C',
      series: [{ label: '보고 ' + f1(act[la]), cls: 's-actual', values: act }, { label: '기대 ' + f1(exp[le]), cls: 's-expected', values: exp }],
      ribbons: ribbons, ribbonTop: act, ribbonBot: exp, holds: holds, aria: aria || (s.name + ' 최근 보고값과 기대값'),
      tip: function (i) {
        var q = mon[i];
        return '<b>' + md(q.d) + '</b><br>보고 ' + fmtC(q.act) + ' · 기대 ' + fmtC(q.exp) + '<br>잔차 ' + fmtSC(q.res) +
          (q.hold ? '<br>분석 보류: ' + esc(HOLD[q.hold] || q.hold) : q.sig ? '<br>검토 신호' : q.exc ? '<br>한계 초과' : '');
      }
    };
  }
  /* 연속 초과 점 띠: ● 한계 초과 · ○ 한계 아래 · ▨ 분석 보류 */
  function runStrip(s, n, noCap) {
    var mon = seriesOf(s).filter(function (p) { return p.phase === 'monitor'; }).slice(-(n || 14));
    if (!mon.length) return '';
    var R = 4.5, G = 12, W = mon.length * G, H = 12, on = 0, pid = 'rs' + (++seq);
    var g = '<defs><pattern id="' + pid + '" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)"><rect width="4" height="4" style="fill:var(--hold-bg)"/><line x1="0" y1="0" x2="0" y2="4" style="stroke:var(--hatch-area);stroke-width:2"/></pattern></defs>';
    mon.forEach(function (p, i) {
      var cx = i * G + G / 2;
      if (p.hold && p.hold !== 'PENDING') g += '<rect class="rs-hold" x="' + (cx - R) + '" y="' + (H / 2 - R) + '" width="' + 2 * R + '" height="' + 2 * R + '" rx="1.5" style="fill:url(#' + pid + ')"/>';
      else if (p.exc) { on++; g += '<circle class="rs-on" cx="' + cx + '" cy="' + H / 2 + '" r="' + R + '"/>'; }
      else g += '<circle class="rs-off" cx="' + cx + '" cy="' + H / 2 + '" r="' + (R - 0.6) + '"/>';
    });
    var t = '최근 ' + mon.length + '회 보고 중 한계 초과 ' + on + '회(● 초과 · ○ 한계 아래 · ▨ 분석 보류)';
    return svgBox('runstrip', W, H, t, g) + (noCap ? '' : '<span class="rs-cap" aria-hidden="true">최근 ' + mon.length + '회 중 ' + on + '회 초과</span>') + '</span>';
  }
  /* 편차 크기 = EWMA ÷ 관리한계, 세로선이 관리한계(1배) */
  function ratioBar(ratio, max) {
    if (!ok(ratio)) return '';
    var W = 120, H = 10, r = Math.max(0, Math.min(ratio, max)), x = r / max * W, lim = W / max;
    var g = '<rect class="rb-track" x="0" y="0" width="' + W + '" height="' + H + '" rx="3"/>' +
      '<rect class="rb-in" x="0" y="0" width="' + Math.min(x, lim).toFixed(1) + '" height="' + H + '"/>';
    if (x > lim) g += '<rect class="rb-over" x="' + lim.toFixed(1) + '" y="0" width="' + (x - lim).toFixed(1) + '" height="' + H + '"/>';
    g += '<line class="rb-lim" x1="' + lim.toFixed(1) + '" x2="' + lim.toFixed(1) + '" y1="-3" y2="' + (H + 3) + '"/>';
    return svgBox('ratio', W, H, '관리한계의 ' + f2(ratio) + '배(세로선 = 관리한계 1배)', g) + '</span>';
  }
  /* 허용 범위(규칙)·학습 범위(배별 정상 모델) 위 값 위치 */
  function rangeTrack(f, v, s) {
    var R = (D.meta.ranges || {})[f];
    if (!R || !ok(v)) return '';
    var lo = Math.min(R[0], v), hi = Math.max(R[1], v), W = 96, H = 10;
    function X(x) { return (x - lo) / ((hi - lo) || 1) * W; }
    var g = '<rect class="rt-rule" x="' + X(R[0]).toFixed(1) + '" y="2" width="' + (X(R[1]) - X(R[0])).toFixed(1) + '" height="6" rx="3"/>';
    var li = FEAT_IDX[f], lr = null;
    if (s.model && li != null) {
      lr = [s.model.range_lo[li], s.model.range_hi[li]];
      var a = X(Math.max(lo, lr[0])), b = X(Math.min(hi, lr[1]));
      g += '<rect class="rt-learn" x="' + a.toFixed(1) + '" y="2" width="' + Math.max(1, b - a).toFixed(1) + '" height="6" rx="3"/>';
    }
    var outRule = v < R[0] || v > R[1], outLearn = !!lr && (v < lr[0] || v > lr[1]);
    g += '<circle class="rt-val' + (outRule ? ' out' : outLearn ? ' lout' : '') + '" cx="' + X(v).toFixed(1) + '" cy="5" r="4.5"/>';
    var t = '허용 ' + R[0] + '~' + R[1] + (lr ? ' · 학습 범위 ' + f1(lr[0]) + '~' + f1(lr[1]) : '') + ' · 값 ' + v;
    var cap = outRule ? '<span class="rt-cap warn">' + WARN + ' 허용 범위 밖</span>' : outLearn ? '<span class="rt-cap">학습 범위 밖</span>' : '';
    return svgBox('rtrack', W, H, t, g) + cap + '</span>';
  }
  /* 오늘 보고 처리 현황: 칸 하나 = 선박 하나 */
  function todayBar(noCap) {
    var n = { ok: 0, held: 0, wait: 0, block: 0 };
    var segs = SHIPS.map(function (s) {
      var a = approvalOf(s), rec = todayRecord(s), cls = '', lab = '승인 대기';
      if (a === 'approved') { cls = 'ok'; lab = '승인'; n.ok++; }
      else if (a === 'held') { cls = 'held'; lab = '보류'; n.held++; }
      else if (rec && !rec.approvable) { cls = 'block'; lab = '승인 불가'; n.block++; }
      else n.wait++;
      return '<i class="' + cls + '" title="' + esc(s.name + ': ' + lab) + '">' + esc(s.id) + '</i>';
    }).join('');
    var parts = [];
    if (n.ok) parts.push('승인 ' + n.ok);
    if (n.held) parts.push('보류 ' + n.held);
    if (n.wait) parts.push('대기 ' + n.wait);
    if (n.block) parts.push('불가 ' + n.block);
    return '<span class="todaybar"' + (noCap ? ' role="img" aria-label="' + esc('오늘 보고 ' + parts.join(' · ')) + '"' : '') + '><span class="tb-seg" aria-hidden="true">' + segs + '</span>' +
      (noCap ? '' : '<span class="tb-cap">오늘 보고 ' + parts.join(' · ') + '</span>') + '</span>';
  }

  // ------------------------------------------------------------ shared pieces
  function sortedShips() {
    var rows = SHIPS.map(function (s) { return { s: s, st: statusOf(s) }; });
    var analyzed = rows.filter(function (r) { return r.st.status !== 'hold'; });
    analyzed.sort(function (a, b) { return (b.st.score || 0) - (a.st.score || 0) || a.s.id.localeCompare(b.s.id); });
    var held = rows.filter(function (r) { return r.st.status === 'hold'; });
    return { analyzed: analyzed, held: held };
  }
  function load30(s) { return mean(seriesOf(s).slice(-30).map(function (p) { return p.load; })); }
  function scoreLabel() { return '<p class="score-label">' + esc(D.meta.score_label) + '</p>'; }
  function pendingCount() {
    return SHIPS.filter(function (s) { return approvalOf(s) === 'pending'; }).length;
  }
  function shipLink(s, st) {
    return '<a class="rowlink" href="#/review/' + s.id + '" aria-label="' + esc(s.name + ' 근거 상세, ' + statusText(st) +
      (st.status === 'hold' ? '' : ', 검토점수 ' + f1(st.score))) + '">' + esc(s.name) + '</a>';
  }
  function holdHead(n, tail) {
    return '<div class="hb-head"><i class="sw" aria-hidden="true"></i>분석 보류 ' + n + '척 <span>· ' + tail + '</span></div>';
  }

  // ------------------------------------------------------------ screen 1
  function todayLine() {
    var pc = pendingCount();
    var blocked = SHIPS.filter(function (s) { return approvalOf(s) === 'pending' && !todayRecord(s).approvable; }).length;
    if (pc) {
      var parts = [];
      if (pc - blocked) parts.push('<b>' + (pc - blocked) + '건 승인 대기</b>');
      if (blocked) parts.push('<b>' + blocked + '건 승인 불가</b>(차단 플래그)');
      return '<span>오늘(' + md(TODAY) + ') noon report(정오 보고) ' + parts.join(' · ') + '. 승인 전 보고는 분석에 넣지 않습니다.</span>' +
        '<a class="btn sm" href="#/reports">원문 대조·승인 → 화면 3</a>';
    }
    var nOk = SHIPS.filter(function (s) { return approvalOf(s) === 'approved'; }).length;
    var nHeld = SHIPS.filter(function (s) { return approvalOf(s) === 'held'; }).length;
    return '<span class="ap ap-ok"><span aria-hidden="true">✓</span> 오늘(' + md(TODAY) + ') 보고 처리 완료(승인 ' + nOk + ' · 보류 ' + nHeld + ')</span>';
  }
  function heroCard(top, g) {
    var foot = '';
    if (!top) {
      return '<section class="card hero none" aria-label="먼저 볼 배"><div class="hero-id"><p class="eyebrow">먼저 볼 배</p><p class="hero-name">검토 신호 없음</p></div>' +
        '<div class="hero-metrics"><p class="hero-note"><span class="badge b-hold"><i class="sw" aria-hidden="true"></i>분석 보류 ' + g.held.length + '척</span> 정상이 아니라 확인이 필요한 상태입니다.</p></div>' +
        foot + '</section>';
    }
    var s = top.s, st = top.st, p = st.point;
    return '<section class="card hero" aria-label="먼저 볼 배">' +
      '<div class="hero-id"><p class="eyebrow">먼저 볼 배</p><p class="hero-name">' + esc(s.name) + '</p>' +
      '<p class="meta">' + esc(s.type) + ' · 선령 ' + s.age_years + '년 · ' + md(p.d) + ' 보고 기준</p>' + badge(st) +
      '<p class="hero-why">같은 운전 조건의 기대값보다 ' + s1(p.act - p.exp) + '°C 높게, ' + md(st.signal_start) + '부터 ' + st.run + '회 연속 보고</p></div>' +
      '<dl class="hero-metrics">' +
        '<div><dt>대표 배기온도 잔차</dt><dd class="num">' + s1(p.act - p.exp) + '<small>°C</small></dd><dd class="cap">기대 ' + f1(p.exp) + ' / 보고 ' + fmtC(p.act) + '</dd></div>' +
        '<div><dt>지속</dt><dd class="num">' + st.run + '<small>회 연속</small></dd><dd class="cap">' + md(st.signal_start) + '부터 한계 초과</dd><dd>' + runStrip(s, 14) + '</dd></div>' +
        '<div><dt>검토점수</dt><dd class="num">' + f1(st.score) + '</dd><dd class="cap">시연용 · 고장확률 아님</dd></div>' +
      '</dl>' +
      '<a class="btn primary go" href="#/review/' + s.id + '">왜 이 배인가? 근거 보기 →</a>' +
      '<div class="hero-viz"><p class="viz-cap">최근 30일 대표 배기온도: 보고값과 기대값<span class="cap">기대값 = 같은 운전 조건에서 이 배의 평소(배별 정상 모델) · 칠한 구간 = 관리한계 초과</span></p>' +
      chartSlot(trendSpec(s, 30, 130)) + '</div>' + foot + '</section>';
  }
  function viewFleet() {
    var g = sortedShips();
    var top = g.analyzed.filter(function (r) { return r.st.status === 'signal'; })[0];
    var dom = sparkDomain(g.analyzed);
    var h = '<h1 tabindex="-1">화면 1. 선대 이상 징후 대시보드</h1>' +
      '<p class="lead">선박별 대표 배기온도의 기대값과 실제값, 잔차 추세, 지속 편차 여부를 표시합니다. 공무감독이 우선 확인할 선박과 그 이유를 파악합니다.</p>';
    h += heroCard(top, g) + '<div class="fleet-today">' + todayBar(true) + todayLine() + '</div>';

    h += '<h2>분석 중 선박<span class="h-cap">검토점수 순</span></h2><div class="table-wrap"><table class="fleet">' +
      '<colgroup><col class="c-ship"><col><col><col><col><col><col><col><col class="c-chev"></colgroup>' +
      '<thead><tr><th>선박</th><th>상태</th><th class="r">검토점수<span class="th-cap">시연용 · 고장확률 아님</span></th><th class="r">잔차(°C)</th>' +
      '<th>지속 편차<span class="th-cap">최근 14회 · ● 초과 ○ 아래 ▨ 보류</span></th><th>잔차 추세(EWMA, 최근 30일)</th><th class="r">기대값 / 보고값(°C)</th><th>오늘 보고</th><th class="chev"><span class="sr-only">이동</span></th></tr></thead><tbody>';
    g.analyzed.forEach(function (r) {
      var p = r.st.point || {};
      h += '<tr class="click" data-href="#/review/' + r.s.id + '"><td>' + shipLink(r.s, r.st) + '<span class="cap meta">' + esc(r.s.type) + ' · ' + r.s.age_years + '년</span></td>' +
        '<td>' + badge(r.st) + '</td>' +
        '<td class="r"><span class="score' + (r.st.score ? '' : ' zero') + '">' + f1(r.st.score) + '</span></td>' +
        '<td class="r">' + s1(p.act - p.exp) + '</td>' +
        '<td>' + persistCell(r.st) + runStrip(r.s, 14, true) + '</td>' +
        '<td>' + sparkline(r.s, dom) + '</td>' +
        '<td class="r">' + f1(p.exp) + ' / ' + f1(p.act) + '<span class="cap">' + md(p.d) + ' 기준</span></td>' +
        '<td>' + approvalBadge(r.s, true) + '</td><td class="chev" aria-hidden="true">›</td></tr>';
    });
    h += '</tbody></table></div>' + scoreLabel();
    h += '<div class="legend"><span><i></i>EWMA(표준화 잔차)</span><span><i class="ref"></i>관리한계 ' + f2(P.UCL_z) + '</span>' +
      '<span><i class="sigline"></i>검토 신호 구간(두 보고 연속 초과)</span><span><i class="sw" aria-hidden="true"></i>분석 보류일(EWMA 건너뜀)</span></div>';

    h += '<section class="holdband" aria-label="분석 보류 선박">' + holdHead(g.held.length, '정상으로 넘기지 않음. 보완할 항목을 확인하세요.') +
      '<div class="hb-body"><table class="hold"><colgroup><col class="c-ship"><col class="c-reason"><col><col><col class="c-act"></colgroup>' +
      '<thead><tr><th>선박</th><th>보류 사유</th><th>내용</th><th>보완할 항목</th><th>이동</th></tr></thead><tbody>';
    g.held.forEach(function (r) {
      var hasQ = !!r.s.questions[variantOf(r.s)];
      h += '<tr><td><b>' + esc(r.s.name) + '</b><span class="cap meta">' + esc(r.s.type) + ' · ' + r.s.age_years + '년</span></td><td>' + badge(r.st) + '</td>' +
        '<td>' + esc(mdText(r.st.hold_detail)) + '</td><td>' + esc(r.st.remedy) + '</td>' +
        '<td class="actions"><div class="row nowrap"><a class="btn sm" href="#/review/' + r.s.id + '">근거</a><a class="btn sm" href="#/reports/' + r.s.id + '">원문</a>' +
        (hasQ ? '<a class="btn sm" href="#/requests/' + r.s.id + '">질문 초안</a>' : '<span class="btn sm ph" aria-hidden="true">질문 초안</span>') + '</div></td></tr>';
    });
    h += '</tbody></table></div></section>';
    h += '<details class="explain"><summary>이 시연의 합성 선박 5척(팀이 만든 가상 상황)</summary><ul>' +
      SHIPS.map(function (s) { return '<li><b>' + esc(s.name) + '</b>: ' + esc(ROLE_TEXT[s.id] || s.role) + '</li>'; }).join('') + '</ul></details>';
    return h;
  }

  // ------------------------------------------------------------ screen 2
  function viewReview() {
    var g = sortedShips();
    var h = '<h1 tabindex="-1">화면 2. 점검 순서 화면</h1>' +
      '<p class="lead">선박별 검토점수, 편차 추세와 근거 지표, 분석 보류 상태를 표시합니다. 공무감독이 검토점수와 근거를 대조해 우선 확인할 선박을 선택합니다.</p>' +
      '<p class="sub"><span class="scope">검토점수(시연용) 정렬입니다. 가용 시간·조치 효과를 반영한 점검 순서 최적화는 PoC 단계(2.5) 범위입니다.</span></p>' +
      '<div class="table-wrap"><table class="review"><colgroup><col class="c-rank"><col class="c-ship"><col><col><col><col><col><col class="c-chev"></colgroup>' +
      '<thead><tr><th class="r">순</th><th>선박</th><th>상태</th><th class="r">검토점수<span class="th-cap">시연용 · 고장확률 아님</span></th>' +
      '<th>편차 크기<span class="th-cap">관리한계 대비, 세로선 = 1배</span></th><th>지속 정도<span class="th-cap">최근 14회 · ● 초과 ○ 아래 ▨ 보류</span></th><th>근거 지표</th><th class="chev"><span class="sr-only">이동</span></th></tr></thead><tbody>';
    var rmax = Math.max.apply(null, [2.5].concat(g.analyzed.map(function (r) { var q = r.st.point || {}; return ok(q.ewma) ? q.ewma / P.UCL_z : 0; })));
    g.analyzed.forEach(function (r, i) {
      var p = r.st.point || {};
      var l30 = load30(r.s);
      h += '<tr class="click" data-href="#/review/' + r.s.id + '"><td class="r">' + (i + 1) + '</td><td>' + shipLink(r.s, r.st) + '</td>' +
        '<td>' + badge(r.st) + '</td>' +
        '<td class="r"><span class="score' + (r.st.score ? '' : ' zero') + '">' + f1(r.st.score) + '</span></td>' +
        '<td><span class="row nowrap">' + ratioBar(p.ewma / P.UCL_z, rmax) + '<b>' + f2(p.ewma / P.UCL_z) + '배</b></span><span class="cap">EWMA ' + f2(p.ewma) + ' ÷ 한계 ' + f2(P.UCL_z) + '</span></td>' +
        '<td>' + (r.st.run > 0 ? '연속 초과 ' + r.st.run + '회' : '초과 없음') + (r.st.signal_start ? '<span class="cap">' + md(r.st.signal_start) + '부터</span>' : '') + runStrip(r.s, 14, true) + '</td>' +
        '<td>대표 배기온도 잔차 <b>' + fmtSC(p.act - p.exp) + '</b><span class="cap">기대 ' + f1(p.exp) + ' / 보고 ' + f1(p.act) + ' · 부하 ' + f1(p.load) + '%(30일 평균 ' + f1(l30) + '%)</span></td>' +
        '<td class="chev" aria-hidden="true">›</td></tr>';
    });
    h += '</tbody></table></div>' + scoreLabel() +
      '<p class="sub">분석 보류 선박은 점수를 매기지 않고 아래쪽에 따로 둡니다(정상으로 합치지 않음). 행을 누르면 근거 상세가 열립니다.</p>';
    h += '<section class="holdband" aria-label="분석 보류 선박">' + holdHead(g.held.length, '점수 없음 · 정상으로 넘기지 않음') +
      '<div class="hb-body"><table class="hold"><colgroup><col class="c-ship"><col class="c-reason"><col><col><col class="c-chev"></colgroup>' +
      '<thead><tr><th>선박</th><th>보류 사유</th><th>내용</th><th>보완할 항목</th><th class="chev"><span class="sr-only">이동</span></th></tr></thead><tbody>';
    g.held.forEach(function (r) {
      h += '<tr class="click" data-href="#/review/' + r.s.id + '"><td>' + shipLink(r.s, r.st) + '<span class="cap meta">' + esc(r.s.type) + ' · ' + r.s.age_years + '년</span></td>' +
        '<td>' + badge(r.st) + '</td><td>' + esc(mdText(r.st.hold_detail)) + '</td><td>' + esc(r.st.remedy) + '</td><td class="chev" aria-hidden="true">›</td></tr>';
    });
    h += '</tbody></table></div></section>' + fixedThresholdNote();
    return h;
  }

  function fixedThresholdNote() {
    var th = P.fixed_threshold_example_c, parts = [], sigLine = '';
    SHIPS.forEach(function (s) {
      var ser = seriesOf(s);
      var over = ser.filter(function (p) { return p.act != null && !p.hold && p.act > th && !p.exc && !p.sig; }).length;
      if (over) parts.push(s.name + ' ' + over + '일');
      var st = statusOf(s);
      if (st.status === 'signal') {
        var exc = ser.filter(function (p) { return p.exc; });
        var excOver = exc.filter(function (p) { return p.act > th; }).length;
        sigLine = s.name + '는 관리도 한계를 넘은 ' + exc.length + '회 가운데 고정 임계값을 넘은 날이 ' + excOver + '일';
      }
    });
    return '<p class="compare"><b>고정 임계값과의 차이(같은 합성 자료)</b><br>예시 고정 임계값 ' + th + '°C로 판정했다면 ' +
      (sigLine ? sigLine + '이고, ' : '') + '신호 없는 날 가운데 임계값을 넘는 날이 ' + (parts.length ? parts.join(' · ') : '없음') +
      '입니다. 배·부하·기상마다 “평소”가 달라서, 배별 정상 모델의 잔차로 보면 판정이 달라집니다(예시선은 비교용이며 분석에 쓰지 않음).</p>';
  }
  function compareCandidate(s, st) {
    // "같은 배기온도, 다른 판정": 같은 감시 구간에서 신호 없던 날 중 보고값이 가장 가까운 날
    if (!st.point || st.status !== 'signal') return null;
    var act = st.point.act, resNow = st.point.act - st.point.exp, best = null;
    s.series.forEach(function (p) {
      if (p.phase !== 'monitor' || p.res == null || p.hold || p.sig || p.exc || p.ewma == null) return;
      if (Math.abs(p.res) > Math.abs(resNow) / 2) return;
      if (!best || Math.abs(p.act - act) < Math.abs(best.act - act)) best = p;
    });
    if (!best || Math.abs(best.act - act) > 5) return null;
    return best;
  }
  function comparePoints(s, st, dates) {
    var best = compareCandidate(s, st);
    if (!best) return [];
    return [{ i: dates.indexOf(best.d), y: best.act, label: md(best.d) + ' ' + f1(best.act) + '°C · 신호 없음', cls: 'pt-ok' },
            { i: dates.indexOf(st.point.d), y: st.point.act, label: md(st.point.d) + ' ' + f1(st.point.act) + '°C · 한계 초과', cls: 'pt-sig' }];
  }
  function closestCompare(s, st) {
    var best = compareCandidate(s, st);
    if (!best) return '';
    var act = st.point.act;
    return '<p class="compare"><b>같은 배기온도, 다른 판정</b><br>' + md(best.d) + ' 보고 ' + fmtC(best.act) + '는 같은 감시 구간에서 그날 운전 조건(부하 ' + f1(best.load) + '%)의 기대값과 ' +
      fmtSC(best.res) + ' 차이로 관리도가 한계 아래였고, ' + md(st.point.d) + ' 보고 ' + fmtC(act) + '는 기대값보다 ' + fmtSC(act - st.point.exp) + ' 높아 한계를 넘었습니다. ' +
      '고정 임계값 예시(' + P.fixed_threshold_example_c + '°C)로는 두 날 모두 정상으로 보입니다. 아래 차트에 두 날짜를 점으로 표시했습니다.</p>';
  }

  function viewDetail(id) {
    var s = BY_ID[id];
    if (!s) return '<h1 tabindex="-1">선박을 찾을 수 없습니다</h1><p><a class="back" href="#/review">‹ 화면 2. 점검 순서</a></p>';
    var st = statusOf(s);
    var ser = seriesOf(s);
    var dates = ser.map(function (p) { return p.d; });
    var hasQ = !!s.questions[variantOf(s)];
    var h = '<header class="page-head"><div><p class="eyebrow"><a class="back" href="#/review">‹ 화면 2. 점검 순서</a></p>' +
      '<h1 tabindex="-1">' + esc(s.name) + ' 근거 상세</h1>' +
      '<p class="meta"><span>' + esc(s.type) + ' · 선령 ' + s.age_years + '년 · 주기관 ' + esc(s.engine_id) + ' · ' + (s.form === 'K' ? 'K형(국문 메일 본문)' : 'E형(영문 엑셀)') + '</span> ' + badge(st) + ' ' + approvalBadge(s) + '</p></div>' +
      '<div class="page-actions row">' + (hasQ
        ? '<a class="btn" href="#/reports/' + s.id + '">오늘 원문 → 화면 3</a><a class="btn primary" href="#/requests/' + s.id + '">기관장 확인 질문 초안 보기 → 화면 4</a>'
        : '<a class="btn primary" href="#/reports/' + s.id + '">오늘 원문 → 화면 3</a>') + '</div></header>' +
      '<p class="sub"><span class="scope">합성 시나리오(팀이 만든 가상 상황): ' + esc(ROLE_TEXT[s.id] || s.role) + (s.form_note ? ' · ' + esc(s.form_note) : '') + '</span></p>';
    var p = st.point || {};
    if (st.status === 'hold') {
      h += '<section class="holdband flush" aria-label="분석 보류"><div class="hb-head"><i class="sw" aria-hidden="true"></i>분석 보류 · ' + holdText(st) + '</div><div class="hb-text">' +
        '<p>' + esc(mdText(st.hold_detail)) + '</p><p><b>보완할 항목:</b> ' + esc(st.remedy) + '</p>' +
        '<p class="cap">자동으로 정상 여부를 판단하지 않고 공무감독의 확인을 기다립니다. 아래 차트의 보류 이후 구간은 판정에 쓰지 않습니다(잔차는 참고로 보존).</p></div></section>';
    }
    var last = s.maintenance.length ? s.maintenance[s.maintenance.length - 1] : null;
    if (s.model) {
      h += '<div class="facts">' +
        (st.status === 'hold'
          ? '<div class="fact key"><div class="k">판정</div><div class="v"><i class="sw" aria-hidden="true"></i> 판정 중지</div><div class="s">분석 보류 · ' + holdText(st) + (st.hold_reason === 'POST_MAINTENANCE' && last ? ' · ' + md(last.date) + '부터' : '') + '</div></div>'
          : '<div class="fact key"><div class="k">며칠째</div><div class="v">' + (st.run > 0 ? st.run + '회 연속' : '초과 없음') + '</div><div class="s">' + (st.signal_start ? md(st.signal_start) + '부터 한계 초과' : '두 보고 연속 초과 시 검토 신호') + '</div>' + runStrip(s, 14) + '</div>') +
        '<div class="fact key"><div class="k">' + (st.status === 'hold' ? '보류 전 마지막 판정 잔차' : '대표 배기온도 잔차') + '</div><div class="v">' + fmtSC(p.act - p.exp) + '</div><div class="s">기대 ' + f1(p.exp) + ' / 보고 ' + fmtC(p.act) + ' · ' + md(p.d) + ' 보고</div></div>' +
        '<div class="fact"><div class="k">검토점수</div><div class="v">' + (st.score == null ? '산출 안 함' : f1(st.score)) + '</div><div class="s">편차 크기 × 지속 정도 · 시연용 · 고장확률 아님</div></div>' +
        '<div class="fact"><div class="k">EWMA / 관리한계</div><div class="v">' + f2(p.ewma) + ' / ' + f2(P.UCL_z) + '</div><div class="s">λ=' + P.lambda + ', L=' + P.L + ', 표준화 잔차 단위</div></div>' +
        '<div class="fact"><div class="k">최근 정비</div><div class="v">' + (last ? md(last.date) + ' ' + esc(last.item) : '기록 없음') + '</div><div class="s">' + (last ? (last.baseline_affected ? '기준 영향 의심 → 분석 보류' : '기준 영향 없음으로 기록') : '') + '</div></div>' +
        '</div>';
      h += closestCompare(s, st);
      // chart 1: actual vs expected
      var trainIdx = dates.indexOf(s.model.train[0]), trainEnd = dates.indexOf(s.model.train[1]);
      var calIdx = dates.indexOf(s.model.calib[0]), calEnd = dates.indexOf(s.model.calib[1]);
      var monIdx = -1;
      ser.forEach(function (q, i) { if (monIdx < 0 && q.phase === 'monitor') monIdx = i; });
      var holds = [], ribbons = [], run0 = -1;
      ser.forEach(function (q, i) {
        if (q.hold && q.hold !== 'PENDING') holds.push(i);
        var inRun = q.phase === 'monitor' && !q.hold && (q.exc || q.sig);
        if (inRun && run0 < 0) run0 = i;
        if (!inRun && run0 >= 0) { ribbons.push([run0, i - 1]); run0 = -1; }
      });
      if (run0 >= 0) ribbons.push([run0, ser.length - 1]);
      var actV = ser.map(function (q) { return q.act; }), expV = ser.map(function (q) { return q.exp == null ? null : q.exp; });
      var la = lastIdx(actV), le = lastIdx(expV);
      h += '<h2>대표 배기온도의 보고값과 배별 정상 모델의 기대값</h2>' +
        '<div class="legend"><span><i></i>보고값</span><span><i class="exp"></i>기대값(부하·회전수·속력·파고 → Ridge)</span><span><i class="btrain"></i>학습 80일</span><span><i class="bcalib"></i>잔차 보정 30일</span>' +
        '<span><i class="bmon"></i>감시 30일</span>' + (ribbons.length ? '<span><i class="zone"></i>잔차(한계 초과 구간)</span>' : '') +
        '<span><i class="sw" aria-hidden="true"></i>분석 보류일</span><span><i class="fixed"></i>고정 임계값 예시(비교용, 분석에 안 씀)</span></div>' +
        '<div class="card chart-card">' + chartSlot({
          dates: dates, h: 240, unit: '°C',
          series: [{ label: '보고 ' + f1(actV[la]), cls: 's-actual', values: actV },
                   { label: '기대 ' + f1(expV[le]), cls: 's-expected', values: expV }],
          bands: [{ from: trainIdx, to: trainEnd, cls: 'band-train', label: '학습 80일' }, { from: calIdx, to: calEnd, cls: 'band-calib', label: '보정 30일' },
                  { from: monIdx, to: ser.length - 1, cls: 'band-mon', label: '감시 30일' }],
          refs: [{ y: P.fixed_threshold_example_c, label: '예시 ' + P.fixed_threshold_example_c + '°C', cls: 'ref-fixed' }],
          ribbons: ribbons, ribbonTop: actV, ribbonBot: expV, points: comparePoints(s, st, dates),
          holds: holds, aria: s.name + ' 대표 배기온도 보고값과 기대값',
          tip: function (i) {
            var q = ser[i];
            return '<b>' + md(q.d) + '</b><br>보고 ' + fmtC(q.act) + ' · 기대 ' + fmtC(q.exp) + '<br>잔차 ' + fmtSC(q.res) +
              (q.hold ? '<br>분석 보류: ' + esc(HOLD[q.hold] || q.hold) : '') + '<br><span class="cap">부하 ' + f1(q.load) + '% · ' + f1(q.rpm) + ' rpm · ' + f1(q.speed) + ' kn · 파고 ' + f1(q.wave) + ' m</span>';
          }
        }) + '</div>';
      // chart 2: EWMA
      var mon = ser.filter(function (q) { return q.phase === 'monitor'; });
      var mDates = mon.map(function (q) { return q.d; });
      var marks = [], mHolds = [];
      mon.forEach(function (q, i) { if (q.sig) marks.push({ i: i, y: q.ewma }); if (q.hold && q.hold !== 'PENDING') mHolds.push(i); });
      var ewV = mon.map(function (q) { return q.ewma; });
      var lw = lastIdx(ewV);
      var eps = (s.episodes || {})[variantOf(s)] || [];
      h += '<h2>감시 구간의 표준화 잔차 EWMA(λ=' + P.lambda + ')와 관리한계</h2>' +
        '<p class="sub">이 감시 구간의 검토 신호 에피소드: ' + (eps.length ? eps.map(function (e, i) {
          var ongoing = i === eps.length - 1 && st.status === 'signal';
          return md(e.start) + '~' + md(e.end) + (ongoing ? '(진행 중)' : '(이후 한계 아래로 복귀)');
        }).join(', ') : '없음') + ' · 합성 정상 운전에도 기본 오경보가 있을 수 있어 신호는 확인 요청의 계기일 뿐입니다.</p>' +
        '<div class="legend"><span><i></i>EWMA</span><span><i class="ref"></i>관리한계 ' + f2(P.UCL_z) + ' = L·√(λ/(2−λ)), L=' + P.L + ', 표준화 잔차 단위(μ·σ는 보정 30일 합성 정상자료 잔차)</span>' +
        '<span><span class="tri" aria-hidden="true">▲</span>검토 신호(두 보고 연속 초과)</span><span><i class="sw" aria-hidden="true"></i>보류일(EWMA 건너뜀, 보간 없음)</span></div>' +
        '<div class="card chart-card">' + chartSlot({
          dates: mDates, h: 200, xCount: 8, unit: '표준화 잔차',
          series: [{ label: lw >= 0 ? 'EWMA ' + f2(ewV[lw]) : 'EWMA', cls: 's-ewma', values: ewV }],
          refs: [{ y: P.UCL_z, label: '관리한계 ' + f2(P.UCL_z) }, { y: 0, cls: 'zero' }],
          zoneAbove: P.UCL_z,
          marks: marks, holds: mHolds, aria: s.name + ' EWMA 관리도',
          tip: function (i) {
            var q = mon[i];
            return '<b>' + md(q.d) + '</b><br>EWMA ' + f2(q.ewma) + ' (한계 ' + f2(P.UCL_z) + ')<br>표준화 잔차 ' + f2(q.z) +
              (q.hold ? '<br>분석 보류: ' + esc(HOLD[q.hold] || q.hold) : q.sig ? '<br>검토 신호 · 연속 ' + q.run + '회' : q.exc ? '<br>한계 초과 ' + q.run + '회째' : '');
          }
        }) + '</div>';
    } else {
      h += '<div class="facts"><div class="fact key"><div class="k">배별 정상 모델</div><div class="v">없음</div><div class="s">유효 보고 ' + s.n_valid_baseline + '일(학습 ' + P.train_days + '일 + 보정 ' + P.calib_days + '일 필요)</div></div></div>';
      var av = ser.map(function (q) { return q.act; }), lav = lastIdx(av);
      h += '<h2>대표 배기온도 보고값(기대값 없음)</h2><div class="card chart-card">' + chartSlot({
        dates: dates, h: 220, unit: '°C',
        series: [{ label: '보고 ' + f1(av[lav]), cls: 's-actual', values: av }],
        aria: s.name + ' 대표 배기온도', tip: function (i) { var q = ser[i]; return '<b>' + md(q.d) + '</b><br>보고 ' + fmtC(q.act) + '<br><span class="cap">부하 ' + f1(q.load) + '%</span>'; }
      }) + '</div>';
    }
    // conditions
    var recent = ser.slice(-60);
    var rd = recent.map(function (q) { return q.d; });
    var conds = [['load', '운전 부하(%)', 0], ['rpm', '회전수(rpm)', 1], ['speed', '속력(kn)', 2], ['wave', '파고(m)', 3]];
    h += '<h2>최근 60일 운전 조건 변화</h2><div class="legend"><span><i></i>보고값</span>' + (s.model ? '<span><i class="fixed"></i>학습 범위(±5%) 경계(밖이면 학습 범위 이탈 보류)</span>' : '') + '</div><div class="grid4">';
    conds.forEach(function (c) {
      h += '<div class="card"><h3>' + c[1] + '</h3>' + chartSlot({
        dates: rd, h: 120, xCount: 4, ticks: 3, direct: false, padFrac: 0.10,
        series: [{ cls: 's-cond', values: recent.map(function (q) { return q[c[0]]; }) }],
        refs: s.model ? [{ y: s.model.range_lo[c[2]], cls: 'range-line' }, { y: s.model.range_hi[c[2]], cls: 'range-line' }] : [],
        aria: c[1],
        tip: function (i) { var q = recent[i]; return '<b>' + md(q.d) + '</b><br>' + c[1] + ' ' + f1(q[c[0]]) + (q.hold === 'OUT_OF_RANGE' ? '<br>학습 범위 이탈 보류' : ''); }
      }) + '</div>';
    });
    h += '</div>';
    h += '<details class="tv"><summary>표로 보기(최근 30일)</summary><div class="table-wrap"><table><thead><tr><th>보고일</th><th class="r">부하(%)</th><th class="r">회전수(rpm)</th><th class="r">속력(kn)</th><th class="r">파고(m)</th><th class="r">보고값(°C)</th><th class="r">기대값(°C)</th><th class="r">잔차(°C)</th><th class="r">EWMA</th><th>상태</th></tr></thead><tbody>' +
      ser.slice(-30).reverse().map(function (q) {
        return '<tr><td><a href="#/reports/' + s.id + '/' + q.d + '">' + md(q.d) + '</a></td><td class="r">' + f1(q.load) + '</td><td class="r">' + f1(q.rpm) + '</td><td class="r">' + f1(q.speed) + '</td><td class="r">' + f1(q.wave) + '</td><td class="r">' + f1(q.act) + '</td><td class="r">' + f1(q.exp) + '</td><td class="r">' + s1(q.res) + '</td><td class="r">' + f2(q.ewma) + '</td><td>' +
          (q.hold ? '보류: ' + esc(HOLD[q.hold] || (q.hold === 'PENDING' ? '승인 대기' : q.hold)) : q.sig ? '검토 신호' : q.exc ? '한계 초과' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></details>';
    // maintenance & raw
    h += '<div class="grid2" style="margin-top:var(--sp-6)"><div class="card"><h3>정비·계측 변경 이력</h3>' +
      (s.maintenance.length ? '<table><thead><tr><th>일자</th><th>내용</th><th>계기 변경</th><th>기준 영향</th></tr></thead><tbody>' + s.maintenance.map(function (m) {
        return '<tr><td>' + md(m.date) + '</td><td>' + (m.cylinder ? m.cylinder + '번 실린더 ' : '') + esc(m.item) + '</td><td>' + (m.instrument_changed ? '예' : '아니오') + '</td><td>' + (m.baseline_affected ? '의심 → 분석 보류' : '없음') + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="cap">기록 없음</p>') + '</div>' +
      '<div class="card"><h3>원문 보고와 대조</h3><p class="sub">분석 결과가 단순 입력 오류나 정비 후 기준 변화 때문인지 원문으로 확인합니다.</p><div class="row">' +
      '<a class="btn sm" href="#/reports/' + s.id + '">오늘(' + md(TODAY) + ') 원문</a>' +
      Object.keys(s.reports).sort().reverse().filter(function (d) { return d !== TODAY; }).slice(0, 5).map(function (d) { return '<a class="btn sm" href="#/reports/' + s.id + '/' + d + '">' + md(d) + '</a>'; }).join('') +
      '</div>' + (s.model ? '<p class="sub" style="margin-top:var(--sp-3)">배별 정상 모델: Ridge(α=' + P.ridge_alpha + ', 특징 4개 표준화) · 학습 ' + md(s.model.train[0]) + '~' + md(s.model.train[1]) + '(80일) · 잔차 보정 ' + md(s.model.calib[0]) + '~' + md(s.model.calib[1]) + '(30일, 잔차 σ ' + f2(s.model.sigma) + '°C). 시연 조건이며 실제 선박에 충분한 학습 기간이라는 뜻은 아닙니다.</p>' : '') +
      '</div></div>';
    if (hasQ) h += '<p style="margin-top:var(--sp-5)"><a class="btn" href="#/requests/' + s.id + '">기관장 확인 질문 초안 보기 → 화면 4</a></p>';
    return h;
  }

  // ------------------------------------------------------------ screen 3
  function locKey(loc) { return loc ? (loc.line != null ? 'L' + loc.line : loc.cell) : ''; }
  function flagName(code) { return '<span class="c">' + esc(FLAG_LABEL[code] || code) + '</span><code class="code">' + esc(code) + '</code>'; }
  function rawView(rec, flaggedLocs) {
    if (rec.form === 'K') {
      return '<div class="raw" aria-label="원문(메일 본문)">' + rec.raw.map(function (line, i) {
        var k = 'L' + (i + 1);
        var cls = line.indexOf('※') === 0 ? 'note' : flaggedLocs[k] ? 'flag' : '';
        return '<div class="ln ' + cls + '" data-loc="' + k + '"><span class="no">' + (i + 1) + '</span><span>' + esc(line) + '</span></div>';
      }).join('') + '</div>';
    }
    var maxc = 0;
    rec.raw.forEach(function (r) { maxc = Math.max(maxc, r.length); });
    var h = '<div class="raw xlwrap"><table class="xl" aria-label="원문(엑셀)"><thead><tr><th></th>';
    for (var c = 0; c < maxc; c++) h += '<th>' + String.fromCharCode(65 + c) + '</th>';
    h += '</tr></thead><tbody>';
    rec.raw.forEach(function (r, ri) {
      h += '<tr><th>' + (ri + 1) + '</th>';
      if (ri === 0) { h += '<td colspan="' + maxc + '" class="muted">' + esc(r[0]) + '</td>'; }
      else for (var c2 = 0; c2 < maxc; c2++) {
        var k = String.fromCharCode(65 + c2) + (ri + 1);
        var v = r[c2] == null ? '' : r[c2];
        h += '<td data-loc="' + k + '" class="' + (flaggedLocs[k] ? 'flag' : '') + '">' + esc(v) + '</td>';
      }
      h += '</tr>';
    });
    return h + '</tbody></table></div>';
  }
  function approveResult(s, a) {
    var at = esc(a.at);
    if (a.decision === 'held') {
      var hv = s.today.variants.held;
      return '<div class="result held" tabindex="-1"><i class="sw" aria-hidden="true"></i><span>보류함 ' + at + ' · ' + esc(a.reason) +
        '. 화면 1·2에 분석 보류(' + esc(HOLD[hv.hold_reason] || hv.hold_reason) + ')로 표시</span></div>';
    }
    var pv = s.today.variants.pending, av = s.today.variants.approved || pv, parts = [];
    if (pv.status === 'signal' && av.status === 'signal') {
      parts.push('검토점수 ' + f1(pv.score) + ' → ' + f1(av.score));
      parts.push('연속 초과 ' + pv.run + ' → ' + av.run + '회');
    } else if (pv.status === av.status && av.status === 'normal') parts.push('신호 없음 유지');
    else if (pv.status === av.status && av.status === 'hold') parts.push('분석 보류 유지(' + (HOLD[av.hold_reason] || av.hold_reason) + ')');
    else parts.push(statusText(pv) + ' → ' + statusText(av));
    var pd = pv.point && pv.point.d, ad = av.point && av.point.d;
    if (pd && ad && pd !== ad) parts.push('기준 보고 ' + md(pd) + ' → ' + md(ad));
    else if (!ad && av.hold_detail && pv.hold_detail !== av.hold_detail) parts.push(mdText(av.hold_detail));
    return '<div class="result" tabindex="-1"><span aria-hidden="true">✓</span> 승인 ' + at + ', 분석 반영: ' + esc(parts.join(' · ')) + '</div>';
  }
  function holdGroup(s, primary) {
    return '<div class="hold-grp"><label class="field-label" for="holdReason">보류 사유 <span class="cap">선택, 비우면 \'공무감독 보류\'</span></label>' +
      '<div class="row nowrap"><input type="text" id="holdReason" placeholder="예: 기관장에게 재확인 필요">' +
      '<button class="btn' + (primary ? ' primary' : '') + '" data-act="hold" data-id="' + s.id + '">' + (primary ? '보류(분석 보류로 표시)' : '보류') + '</button></div></div>';
  }
  function viewReports(id, date) {
    var s = BY_ID[id] || SHIPS.filter(function (x) { return approvalOf(x) === 'pending'; })[0] || SHIPS[0];
    date = date || TODAY;
    var rec = s.reports[date];
    var isPast = date !== TODAY;
    var h = '<h1 tabindex="-1">화면 3. 보고 표준화·확인 화면</h1>' +
      '<p class="lead">noon report의 항목·값·단위를 표준 형식으로 정리하고 원문, 누락 항목, 확인 필요 사항을 표시합니다. 공무감독이 분석에 사용할 입력값을 원문과 대조하고 승인합니다.</p>' +
      '<div class="s3"><div class="s3side"><p class="rlist-head">오늘(' + md(TODAY) + ') 보고</p>' + todayBar() + '<nav class="rlist today" aria-label="오늘 보고">';
    SHIPS.forEach(function (x) {
      var cur = x.id === s.id && !isPast;
      h += '<a href="#/reports/' + x.id + '"' + (cur ? ' aria-current="true"' : '') + '><span class="rl-main"><span class="t">' + esc(x.name) + '</span><span class="cap">' + (x.form === 'K' ? 'K형 메일' : 'E형 엑셀') + '</span></span>' + approvalBadge(x) + '</a>';
    });
    h += '</nav>';
    var flagged = [];
    SHIPS.forEach(function (x) { x.flagged_dates.forEach(function (d) { flagged.push([x, d]); }); });
    if (flagged.length) {
      var openHist = isPast || !NARROW.matches;
      h += '<details class="flaghist"' + (openHist ? ' open' : '') + '><summary class="rlist-head">지난 보고의 플래그 이력</summary><nav class="rlist" aria-label="지난 보고의 플래그 이력">';
      flagged.forEach(function (fd) {
        var cur = fd[0].id === s.id && fd[1] === date;
        var r = fd[0].reports[fd[1]];
        var codes = r.flags.filter(function (f) { return f.code !== 'LABEL_VARIANT' && f.code !== 'UNIT_CONVERTED'; }).map(function (f) { return f.code; });
        h += '<a href="#/reports/' + fd[0].id + '/' + fd[1] + '"' + (cur ? ' aria-current="true"' : '') + '><span class="rl-main"><span class="t">' + esc(fd[0].name) + ' ' + md(fd[1]) + '</span>' +
          '<span class="cap">' + codes.map(function (c) { return esc(FLAG_LABEL[c] || c) + ' <code class="code">' + esc(c) + '</code>'; }).join(', ') + '</span></span></a>';
      });
      h += '</nav></details>';
    }
    h += '</div>';
    if (!rec) return h + '<div><p class="sub">보고가 없습니다.</p></div></div>';
    var flaggedLocs = {}, fieldFlags = {};
    rec.flags.forEach(function (f) {
      if (!f.field) return;
      (fieldFlags[f.field] = fieldFlags[f.field] || []).push(f);
      var loc = rec.fields[f.field] && rec.fields[f.field].loc;
      if (loc && f.blocking) flaggedLocs[locKey(loc)] = true;
    });
    h += '<div class="s3main">';
    if (isPast) h += '<div class="pastbar"><span>지난 보고 보기: ' + esc(s.name) + ' ' + md(date) + '(접수 시점에 처리됨)</span><a class="btn sm" href="#/reports/' + s.id + '">오늘 보고로 →</a></div>';
    h += '<div><h3 style="margin-top:0">원문: ' + esc(rec.source_file) + '</h3>' + rawView(rec, flaggedLocs) +
      '<p class="sub">원문은 바꾸지 않고 그대로 보존합니다. 표의 행을 누르면 원문 위치가 강조됩니다.</p></div>';
    h += '<div><h3 style="margin-top:0">표준 표: ' + esc(s.name) + ' ' + md(rec.report_date) + '</h3><div class="table-wrap"><table class="std"><thead><tr><th>항목</th><th class="r">값</th><th>단위</th><th>범위<span class="th-cap">허용 범위 · 학습 범위 위 값</span></th><th>원문 표기</th><th>위치</th><th>확인</th></tr></thead><tbody>';
    function checkCell(ff) {
      if (!ff.length) return '<span class="info">이상 없음</span>';
      return ff.map(function (x) { return x.blocking ? '<b class="blk">' + WARN + ' 차단 · ' + esc(x.message) + '</b>' : '<span class="info">' + esc(x.message) + '</span>'; }).join('<br>');
    }
    FIELD_ORDER.forEach(function (f) {
      var fd = rec.fields[f];
      var ff = fieldFlags[f] || [];
      var bad = ff.some(function (x) { return x.blocking; });
      if (!fd) {
        h += '<tr class="flagged"><td>' + FIELD_NAME[f] + '</td><td colspan="5" class="muted">원문에 없음</td><td>' + (ff.length ? checkCell(ff) : '') + '</td></tr>';
        return;
      }
      var val = f === 'remarks' ? esc(fd.value) : (fd.value == null ? '빈 칸' : esc(fd.value));
      h += '<tr class="click' + (bad ? ' flagged' : '') + '" data-loc="' + locKey(fd.loc) + '"><td>' + FIELD_NAME[f] + '</td><td class="r">' + val + '</td><td>' + esc(fd.unit || '') + '</td><td>' + (f === 'remarks' ? '' : rangeTrack(f, fd.value, s)) + '</td>' +
        '<td>' + esc(fd.raw_label) + (f === 'remarks' ? '' : ': ' + esc(fd.raw_value == null ? '(빈 칸)' : fd.raw_value) + (fd.raw_unit ? ' ' + esc(fd.raw_unit) : '')) + '</td>' +
        '<td class="loc">' + esc(fd.loc.line != null ? fd.loc.line + '행' : fd.loc.cell) + '</td><td>' + checkCell(ff) + '</td></tr>';
    });
    h += '</tbody></table></div>' +
      '<div class="legend"><span><i class="rtl-rule"></i>허용 범위(규칙)</span>' + (s.model ? '<span><i class="rtl-learn"></i>학습 범위(배별 정상 모델, ±5%)</span>' : '') +
      '<span><i class="rtl-dot"></i>값</span><span><i class="rtl-dot out"></i>허용 범위 밖</span>' + (s.model ? '<span><i class="rtl-dot lout"></i>학습 범위 밖</span>' : '') + '</div>';
    var others = rec.flags.filter(function (f) { return !f.field; });
    if (others.length) h += '<ul class="flags">' + others.map(function (f) { return '<li class="' + (f.blocking ? 'block' : '') + '">' + (f.blocking ? WARN + ' ' : '') + flagName(f.code) + esc(f.message) + '</li>'; }).join('') + '</ul>';
    var blocking = rec.flags.filter(function (f) { return f.blocking; });
    if (!isPast) {
      var a = state.approvals[s.id];
      h += '<div class="decide">';
      if (!a) {
        h += '<p class="decide-head"><b>오늘(' + md(TODAY) + ') 보고: ' + esc(s.name) + '</b>' + approvalBadge(s) + '</p>';
        if (rec.approvable) {
          h += '<div class="decide-row"><button class="btn primary" data-act="approve" data-id="' + s.id + '">승인(분석에 넣기)</button>' + holdGroup(s, false) + '</div>' +
            '<p class="sub">승인된 보고만 분석에 들어갑니다. 보류하면 이 선박은 \'분석 보류(입력 누락)\'로 표시됩니다.</p>';
        } else {
          h += '<div class="decide-row"><button class="btn" data-act="approve" data-id="' + s.id + '" disabled aria-describedby="whyBlocked">승인(분석에 넣기)</button>' + holdGroup(s, true) + '</div>' +
            '<p class="field-error" id="whyBlocked">' + WARN + ' 차단 플래그(' + esc(blocking.map(function (f) { return f.code; }).join(', ')) + ')가 있어 승인할 수 없습니다. 이 보고는 분석에 넣지 않고 선박을 \'분석 보류\'로 표시합니다.</p>';
        }
      } else {
        var nextS = SHIPS.filter(function (x) { return approvalOf(x) === 'pending' && todayRecord(x).approvable; })[0];
        h += approveResult(s, a) + '<div class="row">' +
          (nextS ? '<a class="btn primary" href="#/reports/' + nextS.id + '">다음 승인 대기: ' + esc(nextS.name) + ' →</a><a class="btn" href="#/fleet">화면 1에서 결과 보기 →</a>'
                 : '<a class="btn primary" href="#/fleet">화면 1에서 결과 보기 →</a>') +
          '<button class="btn quiet" data-act="undo" data-id="' + s.id + '">되돌리기</button></div>';
      }
      h += '</div>';
    } else {
      h += '<p class="sub">지난 보고입니다(시연에서는 접수 시점에 처리된 것으로 둡니다). ' +
        (rec.status === 'ok' ? '분석에 사용됨.' : '차단 플래그로 이 날은 분석 보류이며 EWMA를 건너뜁니다(보간 없음).') + '</p>';
    }
    h += '<p class="sub">알려진 합성 양식 2종(K형·E형)만 규칙(양식 사전·단위 변환·범위 검사)으로 처리합니다. 양식이 일정하지 않은 보고의 언어모델 추출은 PoC 단계(2.5) 범위입니다.</p>';
    h += '</div></div></div>';
    return h;
  }

  // ------------------------------------------------------------ screen 4
  function checkSentence(sent, bundle) { return window.ProtoCheck.checkSentence(sent, bundle, BUNDLE_LABEL); }
  function bundleShow(k, v) {
    if (k === 'hold_reason') return HOLD[v] || v;
    if (typeof v !== 'number') return v;
    if (k === 'resid_c') return s1(v);
    if (k === 'ewma_z' || k === 'limit_z') return f2(v);
    if (k === 'run') return String(v);
    return f1(v);
  }
  function draftKey(s) { return s.id + ':' + variantOf(s); }
  function sentencesOf(s) {
    var q = s.questions[variantOf(s)];
    if (!q) return null;
    var e = state.edits[draftKey(s)];
    return e || q.sentences.map(function (x) { return { text: x.text, evidence: x.evidence.slice() }; });
  }
  function questionText(s) {
    var ss = sentencesOf(s) || [];
    return ss.map(function (x) { return x.text; }).join('\n');
  }
  var uiDraft = { decision: null, reason: '', replies: {} };
  function captureForm() {
    var r = document.getElementById('reason');
    if (!r) return;
    var d = document.querySelector('input[name="decision"]:checked');
    uiDraft.reason = r.value; uiDraft.decision = d ? d.value : null;
    document.querySelectorAll('[data-reply-memo]').forEach(function (e) { uiDraft.replies[e.getAttribute('data-reply-memo')] = e.value; });
  }
  function defaultDecision(st, q) {
    if (st.status === 'hold') return '보류';
    if (q && st.status === 'signal') return '확인 요청';
    return q ? '확인 요청' : '추가 조치 없음';
  }
  function stepCheckText(bad) { return bad ? WARN + ' 출처 확인 필요 ' + bad + '건' : '✓ 모든 문장에 근거 연결'; }
  function checkSummary(bad) {
    return bad ? WARN + ' 근거 검사 경고 ' + bad + '건. 출처를 확인하거나 문장을 고치세요.' : '✓ 모든 문장에 근거가 연결되어 있습니다.';
  }
  function viewRequests(id) {
    var g = sortedShips();
    var defaultShip = (g.analyzed.filter(function (r) { return r.st.status === 'signal'; })[0] || {}).s;
    var s = BY_ID[id] || defaultShip || SHIPS.filter(function (x) { return x.questions[variantOf(x)]; })[0] || SHIPS[0];
    var st = statusOf(s);
    var q = s.questions[variantOf(s)];
    var h = '<h1 tabindex="-1">화면 4. 확인 요청·검토 기록 화면</h1>' +
      '<p class="lead">기관장에게 확인할 질문 초안과 공무감독의 확인 요청·보류·추가 조치 없음 등의 판단 기록을 표시합니다. 공무감독이 질문을 수정하고 판단 사유를 기록합니다.</p>' +
      '<nav class="ship-pick" aria-label="선박 선택">' + SHIPS.map(function (x) {
        return '<a href="#/requests/' + x.id + '"' + (x.id === s.id ? ' aria-current="true"' : '') + '>' + esc(x.name) + ' ' + stateCap(statusOf(x)) + '</a>';
      }).join('') + '</nav>';
    if (!q) {
      h += '<div class="card"><b>' + esc(s.name) + '</b>: ' + (st.status === 'hold' ? '기준자료를 쌓는 중이라 기관장에게 물을 항목이 없습니다.' : '검토 신호가 없어 질문 초안을 만들지 않았습니다.') + ' 판단 기록은 아래에서 남길 수 있습니다.</div>';
    } else {
      var sents = sentencesOf(s);
      var bad = 0;
      var ap = state.approvals[s.id];
      if (st.user_hold && ap) h += '<p class="hold-note"><i class="sw" aria-hidden="true"></i> 공무감독 보류 사유(화면 3): <b>' + esc(ap.reason) + '</b></p>';
      var preBad = sents.filter(function (x) { return checkSentence(x, q.bundle).length; }).length;
      var myJ = state.judgments.filter(function (j) { return j.ship_id === s.id; });
      var waitR = myJ.filter(function (j) { return j.decision === '확인 요청' && !j.reply; }).length;
      h += '<ol class="stepper" aria-label="연계 구조">' +
        '<li class="done"><span class="st-n" aria-hidden="true">가</span><span class="st-t">신호 묶음</span><span class="st-c">분석 결과·원문 근거 ' + Object.keys(q.bundle).length + '항목</span></li>' +
        '<li class="mock"><span class="st-n" aria-hidden="true">나</span><span class="st-t">언어모델 자리</span><span class="st-c">템플릿 모의 응답 ' + sents.length + '문장(실제 호출 없음)</span></li>' +
        '<li id="stepCheck" class="' + (preBad ? 'warn' : 'done') + '"><span class="st-n" aria-hidden="true">다</span><span class="st-t">근거 검사(규칙)</span><span class="st-c">' + stepCheckText(preBad) + '</span></li>' +
        '<li class="' + (myJ.length ? 'done' : '') + '"><span class="st-n" aria-hidden="true">라</span><span class="st-t">공무감독 수정·판단</span><span class="st-c">' +
          (myJ.length ? '판단 기록 ' + myJ.length + '건' + (waitR ? ' · 회신 대기 ' + waitR + '건' : '') : '아직 판단 없음') + '</span></li></ol>';
      var ts = trendSpec(s, 30, 110, s.name + ' 근거: 최근 30일 보고값과 기대값');
      h += '<div class="grid2"><div class="card bundle"><h3>가. 신호 묶음: ' + esc(s.name) + ' ' + badge(st) + '</h3>' + (ts ? chartSlot(ts) : '') + '<div class="kv">' +
        Object.keys(q.bundle).map(function (k) { return '<span class="k">' + esc(BUNDLE_LABEL[k] || k) + '</span><span class="num">' + esc(bundleShow(k, q.bundle[k])) + '</span>'; }).join('') +
        '</div><p class="sub" style="margin-top:var(--sp-3)"><a href="#/review/' + s.id + '">근거 상세(화면 2)</a> · <a href="#/reports/' + s.id + '">오늘 원문(화면 3)</a></p></div>';
      h += '<div class="card"><h3>나·다. 확인 질문 초안과 근거 검사 <span class="tag-mock">모의 응답(실제 언어모델 호출 없음)</span></h3><div id="sents">';
      sents.forEach(function (x, i) {
        var probs = checkSentence(x, q.bundle);
        if (probs.length) bad++;
        h += '<div class="sent"><textarea data-sent="' + i + '" rows="' + Math.max(2, Math.ceil(x.text.length / 46)) + '" aria-label="문장 ' + (i + 1) + '">' + esc(x.text) + '</textarea>' +
          '<button class="btn quiet sm plain" data-act="del-sent" data-i="' + i + '" aria-label="문장 ' + (i + 1) + ' 삭제">삭제</button>' +
          '<div class="chips">' + (x.evidence.length ? x.evidence.map(function (k) { return '<span class="chip">근거: ' + esc(BUNDLE_LABEL[k] || k) + '</span>'; }).join('') : '<span class="chip">근거 없음</span>') + '</div>' +
          '<div class="check ' + (probs.length ? 'bad' : 'ok') + '" data-check="' + i + '">' + (probs.length ? WARN + ' ' + esc(probs.join(' / ')) : '✓ 근거 확인') + '</div></div>';
      });
      h += '</div><div class="row" style="margin-top:var(--sp-3)"><button class="btn sm" data-act="add-sent">문장 추가</button><button class="btn sm" data-act="copy">질문 복사</button>' +
        '<button class="btn quiet sm" data-act="reset-sent">초안으로 되돌리기</button></div>' +
        '<p class="sub' + (bad ? ' bad' : '') + '" id="checksum">' + checkSummary(bad) + '</p>' +
        '<p class="sub">실제 전송 없음. 검토한 질문은 기존 업무 채널(메일 등)로 직접 전달합니다. 질문은 계측값·운전 조건·정비 이력의 재확인만 담고 원인을 단정하지 않습니다.</p></div></div>';
    }
    h += '<h2>공무감독 판단 기록</h2><div class="card judge"><fieldset class="seg-radio"><legend class="field-label">판단</legend><div class="seg">' +
      ['확인 요청', '보류', '추가 조치 없음'].map(function (d) { return '<label><input type="radio" name="decision" value="' + d + '"' + (d === defaultDecision(st, q) && !uiDraft.decision || d === uiDraft.decision ? ' checked' : '') + '>' + d + '</label>'; }).join('') +
      '</div></fieldset><label class="field-label" for="reason">판단 사유 <b class="req">필수</b></label>' +
      '<textarea id="reason" rows="2" placeholder="예: 회신의 실린더별 수동 계측값이 보고와 같고 운전 조건 변화 없음">' + esc(uiDraft.reason || '') + '</textarea>' +
      '<p id="reasonErr" class="field-error" hidden>' + WARN + ' 판단 사유를 적어 주세요</p>' +
      '<div class="row"><button class="btn primary" data-act="save-judgment" data-id="' + s.id + '">' + esc(s.name) + ' 판단 기록 저장</button><span class="cap">최종 판단은 공무감독이 합니다. 자동 정비 지시는 없습니다.</span></div></div>';
    h += '<h2>검토 기록</h2>';
    if (!state.judgments.length) h += '<p class="cap">아직 기록이 없습니다.</p>';
    else {
      h += '<div class="table-wrap"><table><thead><tr><th>일시(이 브라우저)</th><th>선박</th><th>판단</th><th>사유</th><th>질문</th><th>기관장 회신</th></tr></thead><tbody>' +
        state.judgments.slice().reverse().map(function (j) {
          var reply = j.reply ? '<b>' + esc(j.reply.result) + '</b>' + (j.reply.memo ? ': ' + esc(j.reply.memo) : '') + '<span class="cap">' + esc(j.reply.at) + '</span>'
            : j.decision === '확인 요청' ? '<div class="row reply-row"><select data-reply-result="' + j.id + '" aria-label="회신 결과"><option value="" disabled selected>회신 결과 선택</option><option>무이상</option><option>이상</option><option>보류</option></select>' +
              '<input type="text" data-reply-memo="' + j.id + '" placeholder="회신 요지(사람이 입력)" aria-label="회신 요지" value="' + esc((uiDraft.replies || {})[j.id] || '') + '"><button class="btn sm" data-act="save-reply" data-j="' + j.id + '">회신 기록</button></div>' : '<span class="cap">해당 없음</span>';
          return '<tr><td class="num" style="white-space:nowrap">' + esc(j.at) + '</td><td>' + esc(j.ship_name) + '</td><td><b>' + esc(j.decision) + '</b></td><td>' + esc(j.reason) +
            (j.check_warnings ? '<span class="cap">근거 검사 경고 ' + j.check_warnings + '건 상태로 기록</span>' : '') + '</td><td class="q">' + esc(j.question_text || '질문 없음') + '</td><td>' + reply + '</td></tr>';
        }).join('') + '</tbody></table></div><p class="sub">회신은 공무감독이 직접 입력합니다. 회신을 언어모델로 \'이상/무이상/보류\' 라벨로 해석하는 기능은 PoC 단계(2.5) 범위입니다.</p>';
    }
    h += '<div class="row" style="margin-top:var(--sp-3)"><button class="btn sm" data-act="export">기록 내보내기(JSON)</button></div>';
    return h;
  }

  // ------------------------------------------------------------ router & events
  var keepScroll = false;
  var pendingFocus = null;
  function updateStickyBottom() {
    var d = document.querySelector('#app .decide');
    var hgt = d && window.getComputedStyle(d).position === 'sticky' ? d.offsetHeight : 0;
    document.documentElement.style.setProperty('--sticky-bottom', hgt + 'px');
    var top = document.querySelector('.top'); // 실제 sticky 헤더 높이(표기 띠 줄 수·터치 크기에 따라 다름)
    if (top && top.offsetHeight) document.documentElement.style.setProperty('--header-h', top.offsetHeight + 'px');
  }
  function revealCurrent() {
    var cur = document.querySelector('.rlist.today a[aria-current="true"]');
    if (!cur) return;
    var list = cur.parentNode;
    if (list.scrollWidth > list.clientWidth) list.scrollLeft = Math.max(0, cur.offsetLeft - list.offsetLeft - 16);
  }
  function render() {
    var hash = window.location.hash || '#/fleet';
    var parts = hash.replace(/^#\/?/, '').split('/');
    var tab = parts[0] || 'fleet';
    var html;
    CHARTS = {}; SPECS = {};
    if (tab === 'review' && parts[1]) html = viewDetail(parts[1]);
    else if (tab === 'review') html = viewReview();
    else if (tab === 'reports') html = viewReports(parts[1], parts[2]);
    else if (tab === 'requests') html = viewRequests(parts[1]);
    else { tab = 'fleet'; html = viewFleet(); }
    var app = document.getElementById('app');
    app.innerHTML = html;
    mountCharts(app);
    document.querySelectorAll('.gnb a').forEach(function (a) {
      if (a.getAttribute('data-tab') === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    app.dataset.view = tab;
    app.dataset.ship = parts[1] || '';
    var h1 = app.querySelector('h1');
    if (h1) document.title = h1.textContent + TITLE_SUFFIX;
    updateStickyBottom();
    if (pendingFocus) {
      var f = app.querySelector(pendingFocus);
      pendingFocus = null;
      if (f) f.focus({ preventScroll: true });
    }
    revealCurrent();
  }

  function onClick(ev) {
    var t = ev.target;
    var row = t.closest('tr[data-href]');
    if (row && !t.closest('a,button,input,select,textarea')) { window.location.hash = row.getAttribute('data-href'); return; }
    var locRow = t.closest('tr[data-loc]');
    if (locRow) {
      var k = locRow.getAttribute('data-loc');
      var first = null;
      document.querySelectorAll('.raw [data-loc]').forEach(function (e) {
        var on = e.getAttribute('data-loc') === k;
        e.classList.toggle('hl', on);
        if (on && !first) first = e;
      });
      document.querySelectorAll('tr.sel').forEach(function (e) { e.classList.remove('sel'); e.removeAttribute('aria-selected'); });
      locRow.classList.add('sel'); locRow.setAttribute('aria-selected', 'true');
      if (first && first.scrollIntoView) first.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: REDUCE.matches ? 'auto' : 'smooth' });
    }
    var b = t.closest('[data-act]');
    if (!b || b.disabled) return;
    var act = b.getAttribute('data-act');
    var app = document.getElementById('app');
    var s = BY_ID[b.getAttribute('data-id')] || BY_ID[app.dataset.ship] || null;
    if (act === 'approve') {
      state.approvals[s.id] = { decision: 'approved', reason: '', at: nowLocal() }; saveState();
      pendingFocus = '.result'; stayOn('#/reports/' + s.id); toast(s.name + ' 보고를 승인해 분석에 반영했습니다.');
    } else if (act === 'hold') {
      var r = (document.getElementById('holdReason') || {}).value || '';
      state.approvals[s.id] = { decision: 'held', reason: r.trim() || '공무감독 보류', at: nowLocal() }; saveState();
      pendingFocus = '.result'; stayOn('#/reports/' + s.id); toast(s.name + ' 보고를 보류해 분석 보류로 표시합니다.');
    } else if (act === 'undo') {
      var was = (state.approvals[s.id] || {}).decision;
      delete state.approvals[s.id]; saveState();
      pendingFocus = '[data-act="approve"]:not([disabled]), [data-act="hold"]';
      render(); toast((was === 'held' ? '보류를' : '승인을') + ' 취소했습니다. 승인 대기로 돌아갑니다.');
    } else if (act === 'del-sent' || act === 'add-sent' || act === 'reset-sent') {
      captureForm();
      s = currentRequestShip();
      var ss = sentencesOf(s);
      if (act === 'del-sent') ss.splice(Number(b.getAttribute('data-i')), 1);
      if (act === 'add-sent') ss.push({ text: '', evidence: [] });
      if (act === 'reset-sent') { delete state.edits[draftKey(s)]; saveState(); render(); return; }
      state.edits[draftKey(s)] = ss; saveState(); render();
    } else if (act === 'copy') {
      s = currentRequestShip();
      var txt = '[' + D.meta.note + ' · 시연용 초안]\n' + questionText(s);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toast('질문을 복사했습니다. 기존 업무 채널에 붙여 넣으세요(자동 전송 없음).'); }, function () { toast('복사할 수 없습니다. 직접 선택해 복사하세요.'); });
      else toast('복사할 수 없습니다. 직접 선택해 복사하세요.');
    } else if (act === 'save-judgment') {
      var dec = (document.querySelector('input[name="decision"]:checked') || {}).value;
      var rEl = document.getElementById('reason');
      var reason = (rEl.value || '').trim();
      if (!dec) { toast('판단을 고르세요.'); return; }
      if (!reason) {
        rEl.setAttribute('aria-invalid', 'true'); rEl.setAttribute('aria-describedby', 'reasonErr');
        document.getElementById('reasonErr').hidden = false; rEl.focus();
        return;
      }
      var q = s.questions[variantOf(s)];
      var warn = 0;
      if (q) (sentencesOf(s) || []).forEach(function (x) { if (checkSentence(x, q.bundle).length) warn++; });
      state.judgments.push({ id: 'j' + Date.now(), at: nowLocal(), ship_id: s.id, ship_name: s.name, decision: dec, reason: reason,
        status_at_decision: statusOf(s).status, hold_reason: statusOf(s).hold_reason,
        basis: (function (x) { var p = x.point || {}; return { report_date: p.d || null, score: x.score, ewma: p.ewma == null ? null : Math.round(p.ewma * 1000) / 1000,
          run: x.run, expected_c: p.exp == null ? null : Math.round(p.exp * 10) / 10, actual_c: p.act == null ? null : Math.round(p.act * 10) / 10 }; })(statusOf(s)),
        data_version: { build: D.meta.build_code_version, seed: D.meta.seed, input_variant: variantOf(s) },
        question_text: dec === '확인 요청' && q ? questionText(s) : '', check_warnings: dec === '확인 요청' ? warn : 0, reply: null });
      uiDraft = { decision: null, reason: '', replies: uiDraft.replies };
      saveState(); render(); toast('판단을 기록했습니다(이 브라우저에 저장).');
    } else if (act === 'save-reply') {
      var jid = b.getAttribute('data-j');
      var j = state.judgments.filter(function (x) { return x.id === jid; })[0];
      var sel = document.querySelector('[data-reply-result="' + jid + '"]');
      if (!sel.value) { sel.setAttribute('aria-invalid', 'true'); sel.focus(); return; }
      j.reply = { result: sel.value,
        memo: (document.querySelector('[data-reply-memo="' + jid + '"]').value || '').trim(), at: nowLocal() };
      captureForm(); delete uiDraft.replies[jid];
      saveState(); render(); toast('회신을 기록했습니다. 원문과 추세를 다시 대조한 뒤 판단을 남기세요.');
    } else if (act === 'export') {
      var blob = new Blob([JSON.stringify({ note: D.meta.note, exported_at: nowLocal(), reference_date: TODAY, data_version: { build: D.meta.build_code_version, seed: D.meta.seed }, params: P, approvals: state.approvals, judgments: state.judgments }, null, 1)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'review_records_synthetic.json'; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }
  }
  function stayOn(hash) {
    if (window.location.hash !== hash) { keepScroll = true; window.location.hash = hash; }
    else render();
  }
  function currentRequestShip() {
    var id = document.getElementById('app').dataset.ship;
    if (BY_ID[id]) return BY_ID[id];
    var g = sortedShips();
    return (g.analyzed.filter(function (r) { return r.st.status === 'signal'; })[0] || {}).s ||
      SHIPS.filter(function (x) { return x.questions[variantOf(x)]; })[0];
  }
  function onInput(ev) {
    var t = ev.target;
    if (t.id === 'reason' && t.getAttribute('aria-invalid')) {
      t.removeAttribute('aria-invalid'); t.removeAttribute('aria-describedby');
      var er = document.getElementById('reasonErr'); if (er) er.hidden = true;
    }
    if (t.hasAttribute('data-reply-result')) t.removeAttribute('aria-invalid');
    if (!t.hasAttribute('data-sent')) return;
    var s = currentRequestShip();
    var ss = sentencesOf(s);
    var i = Number(t.getAttribute('data-sent'));
    ss[i].text = t.value;
    state.edits[draftKey(s)] = ss; saveState();
    var q = s.questions[variantOf(s)];
    var probs = checkSentence(ss[i], q.bundle);
    var c = document.querySelector('[data-check="' + i + '"]');
    c.className = 'check ' + (probs.length ? 'bad' : 'ok');
    c.textContent = probs.length ? WARN + ' ' + probs.join(' / ') : '✓ 근거 확인';
    var bad = ss.filter(function (x) { return checkSentence(x, q.bundle).length; }).length;
    var cs = document.getElementById('checksum');
    cs.textContent = checkSummary(bad);
    cs.className = 'sub' + (bad ? ' bad' : '');
    var sc = document.getElementById('stepCheck');
    if (sc) { sc.className = bad ? 'warn' : 'done'; sc.querySelector('.st-c').textContent = stepCheckText(bad); }
  }

  // 시연 초기화: 실제 개수를 보여 주는 확인 대화상자
  function confirmReset() {
    var nA = Object.keys(state.approvals).length, nJ = state.judgments.length, nE = Object.keys(state.edits).length;
    function doReset() { state = freshState(); uiDraft = { decision: null, reason: '', replies: {} }; saveState(); render(); toast('시연 기록을 지웠습니다.'); }
    if (!nA && !nJ && !nE) { doReset(); return; }
    var dlg = document.createElement('dialog');
    if (typeof dlg.showModal !== 'function') { if (window.confirm('시연 기록(승인·보류 ' + nA + '건, 판단 기록 ' + nJ + '건, 질문 수정 ' + nE + '건)을 지울까요?')) doReset(); return; }
    dlg.className = 'dlg';
    dlg.setAttribute('aria-labelledby', 'dlgTitle');
    dlg.innerHTML = '<h2 id="dlgTitle">시연 기록을 지울까요?</h2><p>이 브라우저에 저장된 승인·보류 ' + nA + '건, 판단 기록 ' + nJ + '건, 질문 수정 ' + nE + '건이 지워지고 아침(승인 전) 상태로 돌아갑니다.</p>' +
      '<div class="row"><button type="button" class="btn" value="cancel">취소</button><button type="button" class="btn primary" value="clear">지우기</button></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      dlg.close();
      if (btn.value === 'clear') doReset();
    });
    dlg.addEventListener('close', function () { dlg.remove(); });
    dlg.showModal();
    dlg.querySelector('button[value="cancel"]').focus();
  }

  document.getElementById('refdate').textContent = TODAY;
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && toastEl().classList.contains('show')) hideToast(); });
  (function () {
    var t = toastEl();
    t.addEventListener('mouseenter', function () { clearTimeout(toastT); });
    t.addEventListener('mouseleave', function () { if (t.classList.contains('show')) armToast(); });
    t.addEventListener('focusin', function () { clearTimeout(toastT); });
    t.addEventListener('focusout', function () { if (t.classList.contains('show')) armToast(); });
  })();
  document.getElementById('reset').addEventListener('click', confirmReset);
  window.addEventListener('hashchange', function () {
    render();
    if (keepScroll) { keepScroll = false; return; }
    window.scrollTo(0, 0);
    var h1 = document.querySelector('#app h1');
    if (h1) h1.focus({ preventScroll: true });
  });
  var rzT = 0;
  function onResize() {
    clearTimeout(rzT);
    rzT = setTimeout(function () { remountOnResize(); updateStickyBottom(); }, 150);
  }
  window.addEventListener('resize', onResize);
  // 창 크기 이벤트 없이 본문 폭만 바뀌는 경우(스크롤바 등)도 차트를 실제 폭으로 다시 그린다
  if (window.ResizeObserver) new window.ResizeObserver(onResize).observe(document.getElementById('app'));
  render();
})();

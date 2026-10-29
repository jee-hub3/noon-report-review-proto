/* 첫 방문 안내(코치마크). 실데이터 아님(팀 생성 합성 자료).
   번호 말풍선 5개를 한 번에 띄우고 [닫기] 하나로 끝낸다(이전·다음 같은 단계 진행 없음).
   문구는 docs/20_spec_screens.md '첫 방문 안내' 표 그대로이고, 줄표만 화면 줄표 규칙(12_design_hig 18:35)대로 쉼표로 쓴다(10/29 사용자 결정).
   한 번 닫으면 이 브라우저에서 자동으로 뜨지 않는다(localStorage). 상단 [? 다시 보기]로 언제든 다시 띄운다.
   주소에 ?tour=off가 있으면 자동 표시만 하지 않는다(화면 캡처·스모크 시험용). 외부 파일·호스트 없이 직접 구현. */
(function () {
  'use strict';
  var KEY = 'proto.tour.v1';
  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  // 보류 묶음 머리의 앞쪽 표시('▨ 분석 보류 n척', 뒤의 설명 글 앞까지)가 차지하는 상자. 가로 자르기는 그 머리 기준
  function holdLabel() {
    var h = q('#app .holdband .hb-head'); if (!h) return null;
    var rg = document.createRange(), sp = h.querySelector('span');
    rg.setStart(h, 0); if (sp) rg.setEndBefore(sp); else rg.setEnd(h, h.childNodes.length);
    return { parentElement: h, getBoundingClientRect: function () { return rg.getBoundingClientRect(); } };
  }
  // 화면 1 보류 묶음 아래 '이 시연의 합성 선박 5척(팀이 만든 가상 상황)' 줄: 앞의 펼침 표시(▶)부터 글자 끝까지
  function synthLine() {
    var s = q('#app details.explain > summary'); if (!s) return null;
    var rg = document.createRange(); rg.selectNodeContents(s);
    return { parentElement: s, getBoundingClientRect: function () {
      var t = rg.getBoundingClientRect(), left = s.getBoundingClientRect().left;
      return { left: left, top: t.top, right: t.right, bottom: t.bottom, width: t.right - left, height: t.height }; } };
  }
  // at: 가리킬 요소(여러 개면 묶은 상자), head: 헤더 안의 대상(말풍선·번호는 헤더 바로 아래 줄에 둠)
  // text: 명세 표의 한 줄, sub: 둘째 줄(할 수 있는 일, 10/30 팀 결정. 기획서 2.3·2.4 문장을 줄인 것)
  var MARKS = [
    // 합성 자료 표기: 상단 띠는 10/30 팀 결정으로 없애고 바닥글로 옮겼으므로 화면 1 본문의 합성 선박 줄을 가리킴
    { at: function () { return synthLine(); }, text: '모든 수치는 팀이 만든 합성 자료, 실제 선박·실데이터 아님',
      sub: '가상 선박 자료로 보고 표준화 · 배기온도 편차 분석 · 확인 요청 초안을 시연' },
    { at: function () { return q('#app .table-wrap'); }, text: '선박별 기대값 · 실제값 · 잔차 추세 · 지속 편차 여부',
      sub: '배를 누르면 근거(며칠째 얼마나 벗어났는지)와 정비 이력으로' },
    { at: function () { return qa('#app table.fleet tr > :nth-child(3)'); }, text: '우선 확인할 선박을 고르는 보조 정보, 고장확률 아님',
      sub: '검토점수와 근거를 대조해 우선 확인할 선박을 선택' },
    // 분석 보류 배지: 보류 묶음 머리의 빗금 표시 '▨ 분석 보류 n척'(뒤에 '정상으로 넘기지 않음'이 이어짐. 표 바로 아래라 낮은 창에도 함께 들어감)
    { at: function () { return holdLabel() || q('#app .badge.b-hold'); }, text: '자료 부족 · 계측 기준 불일치 선박은 정상으로 표시하지 않음',
      sub: '자동 판단 대신 보류 사유·보완할 항목을 보이고 공무감독이 확인' },
    { head: true, at: function () { return qa('.gnb a[data-tab="review"], .gnb a[data-tab="reports"], .gnb a[data-tab="requests"]'); }, text: '2 점검 순서 → 3 원문 대조 · 승인 → 4 확인 질문 · 판단 기록(자동 전송 없음)',
      sub: '3은 누락 항목·확인 필요 사항을 표시, 4는 질문을 고치고 판단 사유를 기록' }
  ];
  var FOOT = '최종 점검 여부와 정비 조치는 공무감독과 기관장이 결정합니다';
  var M = 16, G = 12, GAP = 8, PAD = 6, RING = 6, PIN = 22;
  var BODY = [0, 1, 2, 3];  // 본문 대상(테는 헤더 아래 틀 안, 어둡게 하는 층에 구멍). ⑤만 헤더 대상
  var INERT = ['.top', '#app', '.foot'];  // 안내 중 화면 읽기·초점에서 빼는 곳
  var ui = null, opener = null, back = null, returning = null, navigating = false, raf = 0, restore = null, shownAt = '';

  function seen() { try { return window.localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function mark() { try { window.localStorage.setItem(KEY, '1'); } catch (e) { /* 저장 불가: 이번 방문에만 적용 */ } }
  function targets(m) { var t = m.at(); return !t ? [] : (Array.isArray(t) ? t : [t]); }
  function clampN(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function grow(r, d) { return { left: r.left - d, top: r.top - d, right: r.right + d, bottom: r.bottom + d }; }
  function hit(a, b) { return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; }
  function vw() { return document.documentElement.clientWidth; }
  // 줄바꿈이 뜻 단위를 끊지 않게: 화면 번호와 이름, '합성 자료', '자동 전송 없음' 안은 줄바꿈 없는 공백으로(글자는 그대로)
  function glue(t) { return t.replace(/합성 자료|자동 전송 없음|\d [^\s→]+/g, function (s) { return s.replace(/ /g, ' '); }); }
  // 가로로 스크롤되는 틀(표 등) 안의 요소는 보이는 부분만
  function clip(b, el) { var r = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (window.getComputedStyle(p).overflowX === 'visible') continue;
      var c = p.getBoundingClientRect(); r.left = Math.max(r.left, c.left); r.right = Math.min(r.right, c.right); }
    return r; }
  function rectOf(els) { var r = null; els.forEach(function (el) { var b = clip(el.getBoundingClientRect(), el);
    if (b.right - b.left <= 0 || b.bottom - b.top <= 0) return;
    r = !r ? b : { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) }; }); return r; }
  function rects() { return MARKS.map(function (m) { return rectOf(targets(m)); }); }

  function build() {
    var u = {}, holder = document.createElement('div');
    function item(m, i, cls) {
      return '<li' + cls + '><span class="cm-no" aria-hidden="true">' + (i + 1) + '</span><span class="cm-body"><span class="cm-text">' + glue(m.text) +
        '</span><span class="cm-sub">' + glue(m.sub) + '</span></span></li>';
    }
    // 어둡게 하는 층: 본문 대상 넷(합성 선박 줄·선대 목록·검토점수 칸·보류 표시) 자리만 뚫은 가림막. 헤더(10)보다 아래(9)
    holder.innerHTML = '<svg class="cm-dim" aria-hidden="true" focusable="false"><defs><mask id="cmMask">' +
      '<rect width="100%" height="100%" fill="#fff"></rect>' + '<rect class="cm-hole" rx="10" fill="#000"></rect>'.repeat(BODY.length) +
      '</mask></defs><rect class="cm-shade" width="100%" height="100%" mask="url(#cmMask)"></rect></svg>' +
      '<div class="cm-block"></div>' + '<div class="cm-ring cm-head"></div>'.repeat(3) +
      '<div class="cm-root" role="dialog" aria-modal="true" aria-labelledby="cmTitle"><h2 class="sr-only" id="cmTitle">화면 안내</h2>' +
      '<div class="cm-clip">' + '<div class="cm-ring"></div>'.repeat(BODY.length) + '<ol class="cm-list" id="cmList">' +
      MARKS.map(function (m, i) { return item(m, i, ' class="cm-item" data-i="' + i + '"'); }).join('') + '</ol>' +
      MARKS.map(function (m, i) { return '<span class="cm-pin" aria-hidden="true">' + (i + 1) + '</span>'; }).join('') + '</div>' +
      '<div class="cm-sheet"><div class="cm-sheet-in"><ol class="cm-legend" id="cmLegend">' + MARKS.map(function (m, i) { return item(m, i, ''); }).join('') +
      '</ol><div class="cm-foot"><p id="cmFoot">' + FOOT + '</p><button type="button" class="btn primary" data-cm="close">닫기</button></div></div></div></div>';
    u.parts = Array.prototype.slice.call(holder.children);
    u.parts.forEach(function (e) { document.body.appendChild(e); });
    u.root = q('.cm-root'); u.block = q('.cm-block'); u.clip = q('.cm-clip', u.root); u.sheet = q('.cm-sheet');
    u.heads = qa('.cm-ring.cm-head'); u.rings = qa('.cm-ring', u.clip); u.holes = qa('.cm-hole');
    u.items = qa('.cm-item', u.root); u.pins = qa('.cm-pin', u.root); u.legend = qa('.cm-legend li', u.root);
    u.close = q('[data-cm="close"]'); u.listed = [];
    u.close.addEventListener('click', function () { close(); });
    return u;
  }
  function setMode(mode) {
    ui.mode = mode; ui.root.classList.toggle('cm-wide', mode === 'wide'); ui.root.classList.toggle('cm-compact', mode === 'compact');
  }
  // 넓은 폭에서 말풍선 대신 바닥 판 목록에 둘 문구(대상이 바닥 판 위에 들어오지 않는 ①). 좁은 폭은 목록에 다섯 모두
  function setListed(list) {
    ui.listed = list; ui.root.classList.toggle('cm-some', list.length > 0);
    ui.items.forEach(function (li, i) { li.hidden = list.indexOf(i) >= 0; });
    ui.legend.forEach(function (li, i) { li.hidden = ui.mode === 'wide' && list.indexOf(i) < 0; });
    // 화면 읽기: 지금 보이는 말풍선·목록 + 바닥 문장
    ui.root.setAttribute('aria-describedby', ui.mode === 'wide' ? (list.length ? 'cmList cmLegend cmFoot' : 'cmList cmFoot') : 'cmLegend cmFoot');
  }
  function frame(head) { ui.clip.style.top = Math.round(head.bottom) + 'px'; ui.clip.style.bottom = ui.sheet.offsetHeight + 'px'; }
  // 선대 목록 위쪽이 화면의 y 위치에 오게 스크롤(본문 대상 셋이 한 화면에 들어오도록)
  function scrollTableTo(y) {
    var t = rectOf(targets(MARKS[1])); if (!t) return;
    var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, clampN(Math.round(window.pageYOffset + t.top - y), 0, max));
  }

  // 말풍선 후보 자리: 헤더 대상(메뉴)은 헤더 바로 아래 한 줄, 본문 대상은 아래 → 위 → 옆(짧은 줄인 보류 표시·합성 선박 줄은 옆이 먼저)
  function spots(i, R, s, A) {
    var r = R[i], cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, out = [], xs;
    function fit(x) { return clampN(x, A.left, A.right - s.w); }
    if (MARKS[i].head) {
      [r.right - s.w, cx - s.w / 2, A.right - s.w, r.left].forEach(function (x) { out.push({ x: fit(x), y: A.top, side: 'below' }); });
      return out;
    }
    xs = [cx - s.w / 2, r.right - s.w, r.left].map(fit);
    // 검토점수 칸은 선대 목록 틀 안에 있으므로 위·아래 자리는 틀 바깥(가로 스크롤 막대 아래)
    var rv = i === 2 && R[1] ? { top: Math.min(r.top, R[1].top), bottom: Math.max(r.bottom, R[1].bottom) } : r;
    var mid = clampN(cy - s.h / 2, A.top, A.bottom - s.h), vert = [];
    var side = [{ x: r.right + PAD + G, y: mid, side: 'right' }, { x: r.left - PAD - G - s.w, y: mid, side: 'left' }];
    xs.forEach(function (x) { vert.push({ x: x, y: rv.bottom + PAD + G, side: 'below' }); });
    xs.forEach(function (x) { vert.push({ x: x, y: rv.top - PAD - G - s.h, side: 'above' }); });
    return i === 3 || i === 0 ? side.concat(vert) : vert.concat(side);
  }
  // 겹치지 않는 자리를 고름: 말풍선끼리·본문 대상 테·헤더·바닥 줄과 겹치면 다음 후보. ⑤ → rest(③ → ② → 보류 표시 → 합성 선박 줄) 순서로
  // 앞 후보부터 놓되, 뒤에서 막히면 앞의 다른 후보로 되돌아가 모든 조합을 시험한다(앞 후보가 먼저라 고르는 결과는 같은 순서). 없으면 null
  function arrange(R, S, A, rest) {
    var guards = rest.map(function (i) { return grow(R[i], PAD + RING); }), order = [4].concat(rest);
    function box(c, s) { return { left: c.x, top: c.y, right: c.x + s.w, bottom: c.y + s.h }; }
    var cand = order.map(function (i) {
      return spots(i, R, S[i], A).map(function (c) { return { side: c.side, box: box(c, S[i]) }; }).filter(function (c) {
        var b = c.box;
        return b.left >= A.left && b.top >= A.top && b.right <= A.right && b.bottom <= A.bottom && !guards.some(function (g) { return hit(b, g); });
      });
    });
    var P = [], placed = [];
    function go(k) {
      if (k === order.length) return true;
      for (var j = 0; j < cand[k].length; j++) {
        var c = cand[k][j];
        if (placed.some(function (p) { return hit(grow(c.box, GAP), p); })) continue;
        placed.push(c.box); P[order[k]] = c;
        if (go(k + 1)) return true;
        placed.pop();
      }
      delete P[order[k]];
      return false;
    }
    return go(0) ? P : null;
  }
  // 말풍선 폭: 두 줄(문구·둘째 줄)이 각각 한 줄에 들어가면 그 폭, 넘치면 최대 폭일 때와 높이가 같은 가장 좁은 폭(줄 길이가 고르게)
  function fit(li, max) {
    li.style.left = '0px'; li.style.top = '0px'; li.style.maxWidth = 'none'; li.style.width = ''; li.style.whiteSpace = 'nowrap';
    var one = Math.ceil(li.getBoundingClientRect().width) + 1, w = Math.min(one, max);
    li.style.whiteSpace = ''; li.style.width = w + 'px';
    if (one > max) {
      var h = li.offsetHeight;
      for (; w - 8 >= 160; w -= 8) { li.style.width = (w - 8) + 'px'; if (li.offsetHeight > h) break; }
      li.style.width = w + 'px';
    }
    li.style.maxWidth = '';
    return { w: li.offsetWidth, h: li.offsetHeight };
  }
  // 넓은 폭: 말풍선 다섯. 합성 선박 줄(보류 묶음 아래)이 바닥 판 위에 들어오지 않는 낮은 창이면 ①만 바닥 판 목록에 두고 넷을 말풍선으로
  function wide(V, head) {
    setMode('wide'); ui.sheet.style.maxHeight = '';
    var S = ui.items.map(function (li, i) { li.hidden = false; return fit(li, Math.floor(Math.min(i === 4 ? 560 : 440, V.w / 2 - 32))); });
    for (var pass = 0; pass < 2; pass++) {
      setListed(pass ? [0] : []); frame(head);
      var A = { left: M, top: head.bottom + G, right: V.w - M, bottom: V.h - ui.sheet.offsetHeight - GAP };
      var base = A.top + S[4].h + GAP + PAD + RING, rest = pass ? [2, 1, 3] : [2, 1, 3, 0];
      for (var extra = 0; extra <= 120; extra += 40) {
        scrollTableTo(base + extra);
        var R = rects();
        if ([1, 2, 3, 4].some(function (i) { return !R[i]; }) || R[3].bottom + PAD + RING > A.bottom) return false;
        if (!pass && (!R[0] || R[0].bottom + PAD + RING > A.bottom)) break;  // 더 내리면 더 안 들어감
        var P = arrange(R, S, A, rest);
        if (P) { bubbles(P, R, head); return true; }
      }
    }
    return false;
  }
  function bubbles(P, R, head) {
    ui.items.forEach(function (li, i) {
      if (!P[i]) return;  // 바닥 판 목록에 둔 문구
      var b = P[i].box, r = R[i], side = P[i].side, lo, hi;
      li.style.left = Math.round(b.left) + 'px'; li.style.top = Math.round(b.top - head.bottom) + 'px';
      if (side === 'below' || side === 'above') {
        lo = Math.max(r.left, b.left) + 12; hi = Math.min(r.right, b.right) - 12;
        if (lo > hi) side = 'none'; else li.style.setProperty('--ax', Math.round(clampN((r.left + r.right) / 2, lo, hi) - b.left) + 'px');
      } else {
        lo = Math.max(r.top, b.top) + 10; hi = Math.min(r.bottom, b.bottom) - 10;
        if (lo > hi) side = 'none'; else li.style.setProperty('--ay', Math.round(clampN((r.top + r.bottom) / 2, lo, hi) - b.top) + 'px');
      }
      li.setAttribute('data-side', side);
    });
  }
  // 좁은 폭(말풍선 자리가 없을 때): 대상에는 번호만, 문구는 아래 목록으로. 번호는 헤더 아래·바닥 판 위에 통째로 보이고,
  // 다른 번호와 겹치지 않는 곳에만. 헤더 대상 번호(⑤)는 본문 대상 테 위에도 놓지 않는다. 자리가 없는 번호는 목록에만
  function compact(V, head) {
    setMode('compact'); setListed([]);
    var room = V.h - head.bottom - 8;  // 바닥 판은 헤더를 덮지 않음(아주 낮은 창에서도)
    ui.sheet.style.maxHeight = Math.round(room >= 96 ? Math.max(96, Math.min(V.h * 0.7, room)) : Math.max(0, room)) + 'px';
    frame(head);
    var row = head.bottom + GAP, corner = PAD + PIN / 2, bottom = V.h - ui.sheet.offsetHeight - GAP;
    scrollTableTo(row + PIN + GAP + RING + corner);  // 헤더 번호 줄 아래에 선대 목록
    var R = rects();
    // 보류 표시가 바닥 판 밑이면 선대 목록 머리(열 이름·첫 배)가 헤더 아래에 남는 만큼까지만 더 올림. 그래도 안 되면 ④는 목록에만
    if (R[1] && R[3] && R[3].bottom + PAD + RING > bottom) {
      var dy = R[3].bottom + PAD + RING - bottom;
      if (dy <= R[1].top - head.bottom) { window.scrollTo(0, Math.round(window.pageYOffset + dy)); R = rects(); }
    }
    var placed = [], guards = BODY.filter(function (i) { return R[i]; }).map(function (i) { return grow(R[i], PAD + RING); });
    [2, 1, 3, 0, 4].forEach(function (i) {
      var r = R[i], pin = ui.pins[i], got = null, c, isHead = MARKS[i].head;
      if (r && !isHead) r = { left: r.left, right: r.right, top: Math.max(r.top, row + corner), bottom: Math.min(r.bottom, bottom) };  // 보이는 부분만
      if (!r || r.bottom - r.top < PIN / 2) { pin.hidden = true; return; }
      if (isHead) {
        // 메뉴 번호는 메뉴 오른쪽 끝 아래(표 왼쪽 위 모서리는 ② 자리)
        c = [r.right - PIN, (r.left + r.right - PIN) / 2, r.left].map(function (x) { return [x, row]; });
      } else {
        c = [[r.left, r.top, -1, -1], [r.right, r.top, 1, -1], [r.left, r.bottom, -1, 1], [r.right, r.bottom, 1, 1]].map(function (p) {
          return [p[0] + p[2] * PAD - PIN / 2, p[1] + p[3] * PAD - PIN / 2]; });
      }
      for (var j = 0; j < c.length && !got; j++) {
        var b = { left: clampN(c[j][0], 4, V.w - 4 - PIN), top: c[j][1] };
        b.right = b.left + PIN; b.bottom = b.top + PIN;
        if (b.top < row - 0.5 || b.bottom > bottom + GAP) continue;  // 헤더 아래, 바닥 판 위에 통째로 보일 때만
        if (placed.some(function (p) { return hit(grow(b, 4), p); })) continue;
        if (isHead && guards.some(function (g) { return hit(b, g); })) continue;  // 헤더 번호가 표 글자를 가리지 않게
        got = b;
      }
      pin.hidden = !got;  // 놓을 자리가 없으면 번호를 빼고 아래 목록만(겹치거나 잘리게 두지 않음)
      if (!got) return;
      placed.push(got);
      pin.style.left = Math.round(got.left) + 'px'; pin.style.top = Math.round(got.top - head.bottom) + 'px';
    });
  }
  // 대상 테(헤더 대상은 헤더 위 층, 본문 대상은 헤더 아래 틀 안)와 어둡게 하는 층의 구멍. 바닥 판 목록에 둔 문구의 대상은 테 없음
  function paint(head) {
    var R = rects(), w = vw();
    function ring(e, r, dy) {
      var l = Math.max(2, r.left - PAD), t = Math.max(2, r.top - PAD);
      e.hidden = false; e.style.left = l + 'px'; e.style.top = (t - dy) + 'px';
      e.style.width = Math.max(0, Math.min(w - 2, r.right + PAD) - l) + 'px'; e.style.height = Math.max(0, r.bottom + PAD - t) + 'px';
    }
    ui.heads.forEach(function (e) { e.hidden = true; });
    // 메뉴 테: 한 줄이면 2~4를 한 테로, 두 줄(좁은 폭 2×2)이면 메뉴마다 따로(1번 메뉴는 감싸지 않음)
    var links = targets(MARKS[4]).map(function (a) { return rectOf([a]); }).filter(Boolean);
    var oneRow = links.every(function (r) { return Math.abs(r.top - links[0].top) < 2; });
    (oneRow && R[4] ? [R[4]] : links).forEach(function (r, k) { ring(ui.heads[k], r, 0); });
    BODY.forEach(function (i, k) {
      var r = ui.listed.indexOf(i) < 0 ? R[i] : null, h = ui.holes[k], g;
      ui.rings[k].hidden = !r;
      if (!r) { h.setAttribute('width', 0); h.setAttribute('height', 0); return; }
      ring(ui.rings[k], r, head.bottom); g = grow(r, PAD);
      h.setAttribute('x', Math.round(g.left)); h.setAttribute('y', Math.round(g.top));
      h.setAttribute('width', Math.round(g.right - g.left)); h.setAttribute('height', Math.round(g.bottom - g.top));
    });
  }
  function layout() {
    raf = 0; if (!ui || ui.root.hidden) return;
    var V = { w: vw(), h: window.innerHeight }, head = q('.top').getBoundingClientRect();
    if (V.w < 600 || !wide(V, head)) compact(V, head);  // 휴대폰 폭은 말풍선이 너무 좁아지므로 번호 + 아래 목록
    paint(head);
  }
  // 다음 그림 틀에서 다시 놓음. 숨은 탭처럼 그림 틀이 멈춘 곳에서는 짧은 타이머로 대신 놓는다
  function schedule() {
    if (!ui || raf) return;
    raf = window.requestAnimationFrame(layout);
    window.setTimeout(function () { if (raf) { window.cancelAnimationFrame(raf); layout(); } }, 150);
  }

  // 열 때 스크롤을 잠그고(스크롤 막대 폭만큼 오른쪽을 채워 본문이 움직이지 않게, 그 틈은 헤더 색으로), 닫으면 원래 자리로
  function lock(on) {
    var de = document.documentElement, sbw = window.innerWidth - de.clientWidth;
    if (on) {
      de.classList.add('cm-on');
      if (sbw > 0) { de.style.paddingRight = sbw + 'px'; de.style.setProperty('--cm-sbw', sbw + 'px'); }
    } else { de.classList.remove('cm-on'); de.style.paddingRight = ''; de.style.removeProperty('--cm-sbw'); }
    INERT.forEach(function (s) { var e = q(s); if (e) { if (on) e.setAttribute('inert', ''); else e.removeAttribute('inert'); } });
  }
  // 다른 화면에서 열 때 그 화면의 입력값을 보관했다가 돌아온 뒤 되살린다(앱은 화면을 다시 그린다)
  function fieldKey(e) {
    if (e.id) return '#' + e.id;
    if (e.name && (e.type === 'radio' || e.type === 'checkbox')) return e.name + '=' + e.value;
    for (var i = 0; i < e.attributes.length; i++) if (e.attributes[i].name.indexOf('data-') === 0) return e.attributes[i].name + '=' + e.attributes[i].value;
    return null;
  }
  function fields() { return qa('#app input, #app textarea, #app select').filter(fieldKey); }
  function snapshot() { return fields().map(function (e) { return { k: fieldKey(e), v: e.value, c: e.checked }; }); }
  function refill(list) {
    var now = {}; fields().forEach(function (e) { now[fieldKey(e)] = e; });
    list.forEach(function (f) {
      var e = now[f.k]; if (!e) return;
      if (e.type === 'radio' || e.type === 'checkbox') { if (f.c && !e.checked) { e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); } }
      else if (e.value !== f.v) { e.value = f.v; e.dispatchEvent(new Event('input', { bubbles: true })); }
    });
  }
  function focusBack() { var t = opener && document.contains(opener) ? opener : q('#app h1'); if (t) t.focus({ preventScroll: true }); }
  function show() {
    ui.root.hidden = false; shownAt = window.location.href;
    var tw = q('#app .table-wrap'); if (tw && tw.scrollLeft) { ui.tableLeft = tw.scrollLeft; tw.scrollLeft = 0; }  // 옆으로 밀어 둔 표는 처음 칸부터
    layout(); ui.close.focus({ preventScroll: true });
    // 나타날 때의 옅은 밝아짐(CSS)은 그림 틀이 멈춘 곳(숨은 탭 등)에서 멈춘 채 투명하게 남을 수 있으므로, 잠시 뒤 끝난 상태로 고정
    var u = ui; window.setTimeout(function () { u.parts.forEach(function (e) { e.style.animation = 'none'; }); }, 400);
  }
  function start(fromButton) {
    if (ui) return;
    opener = fromButton ? document.getElementById('tour-again') : null;  // 눌러도 초점이 가지 않는 브라우저가 있어 버튼을 직접 기억
    ui = build(); lock(true);
    // 안내는 화면 1에서 뜬다. 다른 화면에서 열면 화면 1을 방문 기록에 한 칸 쌓아 띄우고, 닫으면(뒤로 가기도 같음) 한 칸 돌아온다.
    // 그 화면에 쓰던 입력값·스크롤은 보관했다가 돌아온 뒤 되살린다(앱은 화면을 다시 그린다)
    var app = q('#app');
    if (app && app.dataset.view !== 'fleet') {
      back = { hash: window.location.hash, x: window.pageXOffset, y: window.pageYOffset, fields: snapshot() };
      restore = null; navigating = true; ui.root.hidden = true; window.location.hash = '#/fleet';
      return;
    }
    back = null; restore = [window.pageXOffset, window.pageYOffset]; show();
  }
  function teardown() {  // 안내 층을 걷고 잠금·inert를 풂
    var u = ui; ui = null; navigating = false;
    u.parts.forEach(function (e) { e.remove(); });
    lock(false); mark();
    var tw = q('#app .table-wrap'); if (tw && u.tableLeft) tw.scrollLeft = u.tableLeft;
  }
  function close() {
    if (!ui) return;
    teardown();
    if (back) { returning = back; back = null; window.history.back(); return; }  // 쌓아 둔 화면 1 한 칸을 되돌림
    if (restore) { window.scrollTo(restore[0], restore[1]); restore = null; }
    focusBack();
  }
  function arrive(r) { refill(r.fields); window.scrollTo(r.x, r.y); focusBack(); }  // 원래 화면에 돌아온 뒤
  function onKey(e) {
    if (!ui || ui.root.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') { e.preventDefault(); ui.close.focus({ preventScroll: true }); }  // 누를 수 있는 것은 [닫기] 하나
  }
  // 앱(app.js)의 hashchange가 먼저 화면을 그린 뒤 이 처리기가 돈다
  function onNav() {
    if (returning) { var r = returning; returning = null; arrive(r); return; }
    if (!ui) return;
    if (navigating) { navigating = false; show(); return; }
    // 안내 중 다른 이동(뒤로 가기 등): 다른 화면에서 연 안내가 원래 화면으로 돌아왔으면 [닫기]와 같게 되살리고,
    // 그 밖에는 안내만 닫고 새 화면 제목으로 초점(앱이 주려던 초점이 inert에 막혔으므로)
    var b = back; back = null; restore = null; teardown();
    if (b && window.location.hash === b.hash) { arrive(b); return; }
    var h1 = q('#app h1'); if (h1) h1.focus({ preventScroll: true });
  }
  window.addEventListener('hashchange', onNav);
  // 주소가 같은 기록 사이를 오가면 hashchange 없이 popstate만 온다. 그때도 다른 이동으로 처리
  // (주소가 바뀌는 이동은 뒤따르는 hashchange에서, 앱이 새 화면을 그린 뒤 처리)
  window.addEventListener('popstate', function () { if (ui && !navigating && window.location.href === shownAt) onNav(); });
  // 스크롤은 잠겨 있으므로 다시 놓을 때는 창 크기 변화와 로드 끝뿐(자기 스크롤에 다시 반응해 계속 도는 일이 없게)
  window.addEventListener('resize', schedule); window.addEventListener('load', schedule);
  document.addEventListener('keydown', onKey);
  var again = document.getElementById('tour-again'); if (again) again.addEventListener('click', function () { start(true); });
  window.ProtoTour = { start: start, close: function () { close(); }, texts: MARKS.map(function (m) { return m.text; }), subs: MARKS.map(function (m) { return m.sub; }), foot: FOOT, mode: function () { return ui ? ui.mode : null; },
    listed: function () { return ui ? ui.listed.slice() : null; } };
  if (!/(?:^|[?&])tour=off(?:&|$)/.test(window.location.search.slice(1)) && !seen()) {
    // 첫 방문 자동 표시는 화면 1에서. 다른 화면 주소로 들어왔으면 주소를 옮기지 않고, 처음 화면 1을 열 때 띄운다
    // (사람이 누르지 않은 주소 이동은 브라우저가 기록을 덮어쓰거나 뒤로 가기에서 건너뛰어 돌아올 곳이 사라짐)
    var app0 = q('#app');
    if (!app0 || app0.dataset.view === 'fleet') start(false);
    else window.addEventListener('hashchange', function firstFleet() {
      if (q('#app').dataset.view !== 'fleet') return;
      window.removeEventListener('hashchange', firstFleet);
      if (!ui && !seen()) start(false);
    });
  }
})();

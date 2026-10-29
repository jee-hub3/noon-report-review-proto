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
  // at: 가리킬 요소(여러 개면 묶은 상자), head: 헤더 안의 대상(말풍선·번호는 헤더 바로 아래 줄에 둠)
  var MARKS = [
    { head: true, at: function () { return q('.notice'); }, text: '모든 수치는 팀이 만든 합성 자료, 실제 선박·실데이터 아님' },
    { at: function () { return q('#app .table-wrap'); }, text: '선박별 기대값 · 실제값 · 잔차 추세 · 지속 편차 여부' },
    { at: function () { return qa('#app table.fleet tr > :nth-child(3)'); }, text: '우선 확인할 선박을 고르는 보조 정보, 고장확률 아님' },
    { at: function () { return q('#app .holdband .badge.b-hold'); }, text: '자료 부족 · 계측 기준 불일치 선박은 정상으로 표시하지 않음' },
    { head: true, at: function () { return qa('.gnb a[data-tab="review"], .gnb a[data-tab="reports"], .gnb a[data-tab="requests"]'); }, text: '2 점검 순서 → 3 원문 대조 · 승인 → 4 확인 질문 · 판단 기록(자동 전송 없음)' }
  ];
  var FOOT = '최종 점검 여부와 정비 조치는 공무감독과 기관장이 결정합니다';
  var ORDER = [4, 0, 2, 1, 3];  // 자리 고르는 순서: 헤더 대상 둘 → 작은 대상 → 큰 대상 → 보류 배지
  var M = 16, G = 12, GAP = 8, PAD = 6, RING = 6, PIN = 22;
  var ui = null, opener = null, back = null, navigating = false, raf = 0, restore = null;

  function seen() { try { return window.localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function mark() { try { window.localStorage.setItem(KEY, '1'); } catch (e) { /* 저장 불가: 이번 방문에만 적용 */ } }
  function targets(m) { var t = m.at(); return !t ? [] : (Array.isArray(t) ? t : [t]); }
  function clampN(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function grow(r, d) { return { left: r.left - d, top: r.top - d, right: r.right + d, bottom: r.bottom + d }; }
  function hit(a, b) { return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; }
  function vw() { return document.documentElement.clientWidth; }
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
    // 어둡게 하는 층: 본문 대상 셋(선대 목록·검토점수 칸·보류 배지) 자리만 뚫은 가림막. 헤더(10)보다 아래(9)
    holder.innerHTML = '<svg class="cm-dim" aria-hidden="true" focusable="false"><defs><mask id="cmMask">' +
      '<rect width="100%" height="100%" fill="#fff"></rect>' +
      '<rect class="cm-hole" rx="10" fill="#000"></rect><rect class="cm-hole" rx="10" fill="#000"></rect><rect class="cm-hole" rx="10" fill="#000"></rect>' +
      '</mask></defs><rect class="cm-shade" width="100%" height="100%" mask="url(#cmMask)"></rect></svg>' +
      '<div class="cm-block"></div><div class="cm-ring cm-head"></div><div class="cm-ring cm-head"></div>' +
      '<div class="cm-root" role="dialog" aria-modal="true" aria-labelledby="cmTitle"><h2 class="sr-only" id="cmTitle">화면 안내</h2>' +
      '<div class="cm-clip"><div class="cm-ring"></div><div class="cm-ring"></div><div class="cm-ring"></div><ol class="cm-list">' +
      MARKS.map(function (m, i) { return '<li class="cm-item" data-i="' + i + '"><span class="cm-no" aria-hidden="true">' + (i + 1) + '</span><span class="cm-text">' + m.text + '</span></li>'; }).join('') +
      '</ol>' + MARKS.map(function (m, i) { return '<span class="cm-pin" aria-hidden="true">' + (i + 1) + '</span>'; }).join('') + '</div>' +
      '<div class="cm-sheet"><div class="cm-sheet-in"><ol class="cm-legend">' +
      MARKS.map(function (m, i) { return '<li><span class="cm-no" aria-hidden="true">' + (i + 1) + '</span><span class="cm-text">' + m.text + '</span></li>'; }).join('') +
      '</ol><div class="cm-foot"><p>' + FOOT + '</p><button type="button" class="btn primary" data-cm="close">닫기</button></div></div></div></div>';
    u.parts = Array.prototype.slice.call(holder.children);
    u.parts.forEach(function (e) { document.body.appendChild(e); });
    u.root = q('.cm-root'); u.block = q('.cm-block'); u.clip = q('.cm-clip', u.root); u.sheet = q('.cm-sheet');
    u.heads = qa('.cm-ring.cm-head'); u.rings = qa('.cm-ring', u.clip); u.holes = qa('.cm-hole');
    u.items = qa('.cm-item', u.root); u.pins = qa('.cm-pin', u.root);
    u.close = q('[data-cm="close"]');
    u.close.addEventListener('click', close);
    return u;
  }
  function setMode(mode) { ui.mode = mode; ui.root.classList.toggle('cm-wide', mode === 'wide'); ui.root.classList.toggle('cm-compact', mode === 'compact'); }
  function frame(head) { ui.clip.style.top = Math.round(head.bottom) + 'px'; ui.clip.style.bottom = ui.sheet.offsetHeight + 'px'; }
  // 선대 목록 위쪽이 화면의 y 위치에 오게 스크롤(본문 대상 셋이 한 화면에 들어오도록)
  function scrollTableTo(y) {
    var t = rectOf(targets(MARKS[1])); if (!t) return;
    var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, clampN(Math.round(window.pageYOffset + t.top - y), 0, max));
  }

  // 말풍선 후보 자리: 헤더 대상은 헤더 바로 아래 한 줄, 본문 대상은 아래 → 위 → 옆(보류 배지는 옆이 먼저)
  function spots(i, R, s, A) {
    var r = R[i], cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, out = [], xs;
    function fit(x) { return clampN(x, A.left, A.right - s.w); }
    if (MARKS[i].head) {
      xs = i === 0 ? [cx - s.w / 2, cx - s.w, cx, A.left, A.right - s.w] : [r.right - s.w, cx - s.w / 2, A.right - s.w, r.left];
      xs.forEach(function (x) { out.push({ x: fit(x), y: A.top, side: 'below' }); });
      return out;
    }
    xs = [cx - s.w / 2, r.right - s.w, r.left].map(fit);
    // 검토점수 칸은 선대 목록 틀 안에 있으므로 위·아래 자리는 틀 바깥(가로 스크롤 막대 아래)
    var rv = i === 2 && R[1] ? { top: Math.min(r.top, R[1].top), bottom: Math.max(r.bottom, R[1].bottom) } : r;
    var mid = clampN(cy - s.h / 2, A.top, A.bottom - s.h), vert = [];
    var side = [{ x: r.right + PAD + G, y: mid, side: 'right' }, { x: r.left - PAD - G - s.w, y: mid, side: 'left' }];
    xs.forEach(function (x) { vert.push({ x: x, y: rv.bottom + PAD + G, side: 'below' }); });
    xs.forEach(function (x) { vert.push({ x: x, y: rv.top - PAD - G - s.h, side: 'above' }); });
    return i === 3 ? side.concat(vert) : vert.concat(side);
  }
  // 겹치지 않는 자리를 차례로 고름: 말풍선끼리·본문 대상 테·헤더·바닥 줄과 겹치면 다음 후보. 하나라도 못 놓으면 null
  function arrange(R, S, A) {
    var guards = [1, 2, 3].map(function (i) { return grow(R[i], PAD + RING); }), placed = [], P = [];
    for (var k = 0; k < ORDER.length; k++) {
      var i = ORDER[k], s = S[i], c = spots(i, R, s, A), got = null;
      for (var j = 0; j < c.length && !got; j++) {
        var b = { left: c[j].x, top: c[j].y, right: c[j].x + s.w, bottom: c[j].y + s.h };
        if (b.left < A.left || b.top < A.top || b.right > A.right || b.bottom > A.bottom) continue;
        if (guards.some(function (g) { return hit(b, g); }) || placed.some(function (p) { return hit(grow(b, GAP), p); })) continue;
        got = { side: c[j].side, box: b }; placed.push(b);
      }
      if (!got) return null;
      P[i] = got;
    }
    return P;
  }
  // 말풍선 폭: 한 줄에 들어가면 한 줄 그대로, 넘치면 줄 수를 정해 두고 줄 길이가 고르게 되는 가장 좁은 폭(끝줄에 낱말 하나만 남지 않게)
  function fit(li, max) {
    var cs = window.getComputedStyle(li), text = li.querySelector('.cm-text');
    li.style.left = '0px'; li.style.top = '0px'; li.style.maxWidth = 'none'; li.style.width = ''; li.style.whiteSpace = 'nowrap';
    var one = Math.ceil(li.getBoundingClientRect().width) + 1, side = one - Math.floor(text.getBoundingClientRect().width), w = Math.min(one, max);
    li.style.whiteSpace = '';
    if (one > max) {
      var n = Math.ceil((one - side) / (max - side));
      var padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), lh = parseFloat(window.getComputedStyle(text).lineHeight) || 20;
      w = Math.min(max, Math.ceil((one - side) / n) + side);
      for (li.style.width = w + 'px'; Math.round((li.offsetHeight - padV) / lh) > n && w < max; li.style.width = w + 'px') w = Math.min(max, w + 8);
    }
    li.style.width = w + 'px'; li.style.maxWidth = '';
    return { w: li.offsetWidth, h: li.offsetHeight };
  }
  function wide(V, head) {
    setMode('wide'); frame(head);
    var S = ui.items.map(function (li, i) { return fit(li, Math.floor(Math.min(i === 4 ? 440 : 360, V.w / 2 - 32))); });
    var A = { left: M, top: head.bottom + G, right: V.w - M, bottom: V.h - ui.sheet.offsetHeight - GAP };
    var base = A.top + Math.max(S[0].h, S[4].h) + GAP + PAD + RING;
    for (var extra = 0; extra <= 120; extra += 40) {
      scrollTableTo(base + extra);
      var R = rects();
      if (R.some(function (r) { return !r; }) || R[3].bottom + PAD + RING > A.bottom) return false;
      var P = arrange(R, S, A);
      if (P) { bubbles(P, R, head); return true; }
    }
    return false;
  }
  function bubbles(P, R, head) {
    ui.items.forEach(function (li, i) {
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
  // 좁은 폭·낮은 창: 대상에는 번호만, 문구는 아래 목록으로. 번호끼리·헤더와 겹치지 않게
  function compact(V, head) {
    setMode('compact'); frame(head);
    scrollTableTo(head.bottom + GAP + PIN + GAP + PAD + RING + PIN / 2);
    var R = rects(), placed = [];
    ui.pins.forEach(function (pin, i) {
      var r = R[i], c, got = null;
      pin.hidden = !r; if (!r) return;
      // 띠 번호는 헤더 아래 오른쪽 끝(메뉴 번호와 떨어지게), 메뉴 번호는 메뉴 가운데 아래
      c = MARKS[i].head ? (i === 0 ? [V.w - M - PIN, r.left + M] : [(r.left + r.right - PIN) / 2, r.right - PIN, r.left]).map(function (x) { return [x, head.bottom + GAP]; })
        : [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].map(function (p) {
          return [p[0] + (p[0] === r.left ? -PAD : PAD) - PIN / 2, p[1] + (p[1] === r.top ? -PAD : PAD) - PIN / 2]; });
      for (var j = 0; j < c.length && !got; j++) {
        var b = { left: clampN(c[j][0], 4, V.w - 4 - PIN), top: Math.max(c[j][1], head.bottom + GAP) };
        b.right = b.left + PIN; b.bottom = b.top + PIN;
        if (!placed.some(function (p) { return hit(grow(b, 4), p); })) got = b;
      }
      if (!got) { pin.hidden = true; return; }  // 자리가 없으면 번호를 빼고 아래 목록만(겹치게 두지 않음)
      placed.push(got);
      pin.style.left = Math.round(got.left) + 'px'; pin.style.top = Math.round(got.top - head.bottom) + 'px';
    });
  }
  // 대상 테(헤더 대상은 헤더 위 층, 본문 대상은 헤더 아래 틀 안)와 어둡게 하는 층의 구멍
  function paint(head) {
    var R = rects(), w = vw();
    function ring(e, r, dy) {
      var l = Math.max(2, r.left - PAD), t = Math.max(2, r.top - PAD);
      e.style.left = l + 'px'; e.style.top = (t - dy) + 'px';
      e.style.width = Math.max(0, Math.min(w - 2, r.right + PAD) - l) + 'px'; e.style.height = Math.max(0, r.bottom + PAD - t) + 'px';
    }
    [0, 4].forEach(function (i, k) { ui.heads[k].hidden = !R[i]; if (R[i]) ring(ui.heads[k], R[i], 0); });
    [1, 2, 3].forEach(function (i, k) {
      var r = R[i], h = ui.holes[k], g;
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
    ui.block.style.top = Math.round(q('.notice').getBoundingClientRect().bottom) + 'px';
    if (!wide(V, head)) compact(V, head);
    paint(head);
  }
  // 다음 그림 틀에서 다시 놓음. 숨은 탭처럼 그림 틀이 멈춘 곳에서는 짧은 타이머로 대신 놓는다
  function schedule() {
    if (!ui || raf) return;
    raf = window.requestAnimationFrame(layout);
    window.setTimeout(function () { if (raf) { window.cancelAnimationFrame(raf); layout(); } }, 150);
  }

  // 열 때 스크롤을 잠그고(스크롤 막대 폭만큼 오른쪽을 채워 본문이 움직이지 않게), 닫으면 원래 자리로
  function lock(on) {
    var de = document.documentElement, sbw = window.innerWidth - de.clientWidth;
    if (on) { de.classList.add('cm-on'); if (sbw > 0) de.style.paddingRight = sbw + 'px'; }
    else { de.classList.remove('cm-on'); de.style.paddingRight = ''; }
  }
  function show() { ui.root.hidden = false; layout(); ui.close.focus({ preventScroll: true }); }
  function start(fromButton) {
    if (ui) return;
    opener = fromButton ? document.getElementById('tour-again') : null;  // 눌러도 초점이 가지 않는 브라우저가 있어 버튼을 직접 기억
    ui = build(); lock(true);
    // 안내는 화면 1에서 뜬다. 다른 화면에서 열면 화면 1로 갔다가 닫을 때 돌아온다
    var app = q('#app');
    if (app && app.dataset.view !== 'fleet') { back = window.location.hash; restore = null; navigating = true; ui.root.hidden = true; window.location.hash = '#/fleet'; return; }
    back = null; restore = [window.pageXOffset, window.pageYOffset]; show();
  }
  function close() {
    if (!ui) return;
    var u = ui; ui = null; u.parts.forEach(function (e) { e.remove(); });
    lock(false); mark();
    if (back) { var b = back; back = null; window.location.hash = b; return; }
    if (restore) { window.scrollTo(restore[0], restore[1]); restore = null; }
    if (opener && document.contains(opener)) { opener.focus({ preventScroll: true }); return; }
    var h1 = q('#app h1'); if (h1) h1.focus({ preventScroll: true });
  }
  function onKey(e) {
    if (!ui || ui.root.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') { e.preventDefault(); ui.close.focus({ preventScroll: true }); }  // 누를 수 있는 것은 [닫기] 하나
  }
  window.addEventListener('hashchange', function () { if (!ui) return; if (navigating) { navigating = false; show(); return; } close(); });
  window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('load', schedule);
  document.addEventListener('keydown', onKey);
  var again = document.getElementById('tour-again'); if (again) again.addEventListener('click', function () { start(true); });
  window.ProtoTour = { start: start, close: close, texts: MARKS.map(function (m) { return m.text; }), foot: FOOT, mode: function () { return ui ? ui.mode : null; } };
  if (!/(?:^|[?&])tour=off(?:&|$)/.test(window.location.search.slice(1)) && !seen()) start(false);
})();

/* 첫 방문 투어(코치마크 + 스텝 가이드). 실데이터 아님(팀 생성 합성 자료).
   단계 문구는 docs/20_spec_screens.md '첫 방문 투어' 표의 문장 그대로(고정). 외부 파일·호스트 없이 직접 구현.
   한 번 뜬 뒤에는 이 브라우저에서 자동으로 뜨지 않는다(localStorage). 상단 [다시 보기]로 언제든 다시 띄운다.
   주소에 ?tour=off가 있으면 자동 시작만 하지 않는다(화면 캡처·스모크 시험용). */
(function () {
  'use strict';
  var KEY = 'proto.tour.v1';
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  // at: 가리킬 요소(여러 개면 묶은 상자), view: 화면 안으로 스크롤할 요소(없으면 at의 첫 요소)
  var STEPS = [
    { at: function () { return q('.notice'); },
      text: '이 화면의 모든 수치는 팀이 만든 합성 자료입니다. 실제 선박·실데이터가 아닙니다.' },
    { at: function () { return q('#app table.fleet'); },
      text: '선박별 대표 배기온도의 기대값과 실제값, 잔차 추세, 지속 편차 여부를 표시합니다.' },
    { at: function () { return qa('#app table.fleet tr > :nth-child(3)'); }, view: '#app table.fleet',
      text: '검토점수는 우선 확인할 선박을 살펴보기 위한 보조 정보이며, 고장확률이 아닙니다.' },
    { at: function () { return qa('#app .holdband .badge.b-hold'); }, view: '#app .holdband',
      text: '자료가 부족하거나 계측 기준이 일치하지 않는 선박은 정상으로 표시하지 않고 \'분석 보류\'로 구분합니다.' },
    { at: function () { return q('.gnb a[data-tab="review"]'); },
      text: '검토점수와 근거를 대조해 우선 확인할 선박을 선택합니다.' },
    { at: function () { return q('.gnb a[data-tab="reports"]'); },
      text: '분석에 사용할 입력값을 원문과 대조하고 승인합니다.' },
    { at: function () { return q('.gnb a[data-tab="requests"]'); },
      text: '기관장에게 확인할 질문 초안과 판단 기록. 실제 메일·정비 명령은 자동 전송하지 않습니다.' },
    { at: null,
      text: '최종 점검 여부와 정비 조치는 공무감독과 기관장이 결정합니다.' }
  ];

  var ui = null, idx = 0, opener = null, back = null, navigating = false, raf = 0;

  function seen() { try { return window.localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function mark() { try { window.localStorage.setItem(KEY, '1'); } catch (e) { /* 저장 불가: 이번 방문에만 적용 */ } }
  function reduced() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  function targets(s) {
    var t = s.at ? s.at() : null;
    return !t ? [] : (Array.isArray(t) ? t : [t]);
  }
  // 가로로 스크롤되는 틀(표 등) 안의 요소는 보이는 부분만
  function clip(b, el) {
    var r = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (window.getComputedStyle(p).overflowX === 'visible') continue;
      var c = p.getBoundingClientRect();
      r.left = Math.max(r.left, c.left); r.right = Math.min(r.right, c.right);
    }
    return r;
  }
  function rectOf(els) {
    var r = null;
    els.forEach(function (el) {
      var b = clip(el.getBoundingClientRect(), el);
      if (b.right - b.left <= 0 || b.bottom - b.top <= 0) return;
      r = !r ? b : { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) };
    });
    return r;
  }
  function setBox(el, r, pad) {
    var vw = document.documentElement.clientWidth;
    var l = Math.max(2, r.left - pad), t = Math.max(2, r.top - pad);
    el.style.left = l + 'px'; el.style.top = t + 'px';
    el.style.width = Math.max(0, Math.min(vw - 2, r.right + pad) - l) + 'px';
    el.style.height = Math.max(0, r.bottom + pad - t) + 'px';
  }

  function build() {
    var u = {};
    ['hole', 'block', 'ring', 'pop'].forEach(function (k) {
      u[k] = document.createElement('div');
      u[k].className = 'tour-' + k;
      document.body.appendChild(u[k]);
    });
    u.pop.setAttribute('role', 'dialog');
    u.pop.setAttribute('aria-modal', 'true');
    u.pop.setAttribute('aria-labelledby', 'tourCount');
    u.pop.setAttribute('aria-describedby', 'tourText');
    u.pop.innerHTML = '<p class="tour-count" id="tourCount"></p><p class="tour-text" id="tourText"></p>' +
      '<div class="tour-actions"><button type="button" class="btn quiet plain" data-tour="skip">건너뛰기</button>' +
      '<span class="tour-nav"><button type="button" class="btn" data-tour="prev">이전</button>' +
      '<button type="button" class="btn primary" data-tour="next">다음</button></span></div>';
    u.pop.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tour]');
      if (!b) return;
      var a = b.getAttribute('data-tour');
      if (a === 'skip') close(); else go(a === 'next' ? 1 : -1);
    });
    return u;
  }

  // 어둡게 하는 층은 헤더 아래, 말풍선은 상단 띠 아래에만 둔다(띠는 어느 단계에서도 가리지 않음)
  function place() {
    if (!ui) return;
    var r = rectOf(targets(STEPS[idx]));
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var notice = q('.notice').getBoundingClientRect(), head = q('.top').getBoundingClientRect();
    var pw = ui.pop.offsetWidth, ph = ui.pop.offsetHeight, gap = 12, m = 16, x, y;
    ui.block.style.top = notice.bottom + 'px';
    if (r) {
      setBox(ui.hole, r, 6); setBox(ui.ring, r, 6);
      ui.ring.hidden = false;
      x = (r.left + r.right) / 2 - pw / 2;
      var below = Math.max(r.bottom, head.bottom) + gap;
      if (below + ph <= vh - m) y = below;
      else if (r.top - gap - ph >= head.bottom + gap) y = r.top - gap - ph;
      else y = vh - ph - m;
    } else {
      setBox(ui.hole, { left: vw / 2, top: vh / 2, right: vw / 2, bottom: vh / 2 }, 0);
      ui.ring.hidden = true;
      x = (vw - pw) / 2; y = (vh - ph) / 2;
    }
    ui.pop.style.left = Math.round(Math.min(Math.max(m, x), vw - pw - m)) + 'px';
    ui.pop.style.top = Math.round(Math.max(y, notice.bottom + gap)) + 'px';
  }
  function schedule() { if (ui && !raf) raf = window.requestAnimationFrame(function () { raf = 0; place(); }); }

  function show(i) {
    idx = i;
    var s = STEPS[i], last = i === STEPS.length - 1;
    ui.pop.querySelector('#tourCount').textContent = '화면 안내 ' + (i + 1) + ' / ' + STEPS.length;
    ui.pop.querySelector('#tourText').textContent = s.text;
    ui.pop.querySelector('[data-tour="skip"]').hidden = last;
    ui.pop.querySelector('[data-tour="prev"]').hidden = i === 0;
    var next = ui.pop.querySelector('[data-tour="next"]');
    next.textContent = last ? '닫기' : '다음';
    var v = s.view ? q(s.view) : targets(s)[0];
    if (v && !v.closest('.top')) v.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    ui.pop.hidden = false;
    place();
    next.focus({ preventScroll: true });
  }
  function go(d) {
    var n = idx + d;
    if (n < 0) return;
    if (n >= STEPS.length) close(); else show(n);
  }

  function start(fromButton) {
    if (ui) return;
    mark();
    opener = fromButton ? document.activeElement : null;
    ui = build();
    document.documentElement.classList.add('tour-on');
    // 단계는 화면 1에서 돈다. 다른 화면에서 시작하면 화면 1로 갔다가 닫을 때 돌아온다
    var app = q('#app');
    if (app && app.dataset.view !== 'fleet') {
      back = window.location.hash; navigating = true; idx = 0;
      ui.pop.hidden = true;
      window.location.hash = '#/fleet';
      return;
    }
    back = null;
    show(0);
  }
  function close() {
    if (!ui) return;
    var u = ui;
    ui = null;
    Object.keys(u).forEach(function (k) { u[k].remove(); });
    document.documentElement.classList.remove('tour-on');
    mark();
    if (back) { var b = back; back = null; window.location.hash = b; return; }
    if (opener && document.contains(opener)) { opener.focus(); return; }
    var h1 = q('#app h1');
    if (h1) h1.focus({ preventScroll: true });
  }

  function onKey(e) {
    if (!ui) return;
    var field = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight' && !field) { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft' && !field) { e.preventDefault(); go(-1); }
    else if (e.key === 'Tab') {
      // 말풍선 안에서만 초점 이동
      var bs = Array.prototype.filter.call(ui.pop.querySelectorAll('button'), function (b) { return !b.hidden; });
      var i = bs.indexOf(document.activeElement);
      if (i < 0 || (e.shiftKey && i === 0) || (!e.shiftKey && i === bs.length - 1)) {
        e.preventDefault();
        bs[e.shiftKey ? bs.length - 1 : 0].focus();
      }
    }
  }

  window.addEventListener('hashchange', function () {
    if (!ui) return;
    if (navigating) { navigating = false; show(idx); return; }
    close(); // 투어 중 뒤로 가기 등으로 화면을 옮기면 닫는다
  });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  document.addEventListener('keydown', onKey);
  var again = document.getElementById('tour-again');
  if (again) again.addEventListener('click', function () { start(true); });

  window.ProtoTour = { start: start, close: close, texts: STEPS.map(function (s) { return s.text; }) };
  if (!/(?:^|[?&])tour=off(?:&|$)/.test(window.location.search.slice(1)) && !seen()) start(false);
})();

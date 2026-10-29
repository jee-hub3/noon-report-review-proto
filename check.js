/* 근거 검사 — proto/questions.py check_sentence와 같은 규칙. 실데이터 아님 — 팀 생성 합성 자료.
   날짜는 근거의 날짜와 통째로 같아야 하고, 그 밖의 숫자는 부호까지 근거 값과 같아야 한다(반올림 ±0.05).
   '확인 N)' 번호와 '최근 30일' 창 길이는 무시한다. */
(function (root) {
  'use strict';
  var NUM_RE = /[-+]?\d+(?:\.\d+)?/g;
  var DATE_RE = /\d{4}-\d{2}-\d{2}/g;
  var ENUM_RE = /확인\s*\d+\)/g;
  var FIXED = [30];

  function fmt(v) {
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(1);
    return String(v);
  }
  function numbers(text) { return (String(text).match(NUM_RE) || []).map(parseFloat); }

  function checkSentence(sent, bundle, labels) {
    var ev = sent.evidence || [];
    if (!ev.length) return ['출처 없는 문장 — 근거 항목이 연결되지 않음'];
    var problems = [], dates = {}, nums = FIXED.slice();
    ev.forEach(function (k) {
      if (bundle[k] == null) { problems.push('근거 항목 \'' + ((labels && labels[k]) || k) + '\' 값 없음'); return; }
      var t = fmt(bundle[k]);
      (t.match(DATE_RE) || []).forEach(function (d) { dates[d] = true; });
      nums = nums.concat(numbers(t.replace(DATE_RE, ' ')));
    });
    var body = String(sent.text).replace(ENUM_RE, ' ');
    (body.match(DATE_RE) || []).forEach(function (d) {
      if (!dates[d]) problems.push('날짜 ' + d + '이(가) 근거 값에 없음');
    });
    numbers(body.replace(DATE_RE, ' ')).forEach(function (n) {
      var ok = nums.some(function (a) { return Math.abs(n - a) < 0.051; });
      if (!ok) problems.push('숫자 ' + n + '이(가) 근거 값에 없음');
    });
    return problems;
  }

  var api = { checkSentence: checkSentence };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ProtoCheck = api;
})(typeof window !== 'undefined' ? window : this);

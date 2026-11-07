// 暑さ指数よみの決まり（だれでも同じ今日の5問・上級・問題の組み方・とことんの並び）。画面と検査（qa/run.mjs）の両方から使う。
// 問題は2つの形：
//   o「よい？よくない？」 { k:"o", t }          1つの場面が、指針で「よい」か「よくない」かを選ぶ
//   w「どれ？」          { k:"w", x, ts:[3つ] }  3つの場面から、x=1 なら「よくない」1つ、x=0 なら「よい」1つを選ぶ
(function () {
  const D = typeof module !== "undefined" ? require("./data.js") : window.JRD;
  const SC = D.SC.map((t, id) => Object.assign({ id }, t));
  // 今日の5問・上級に使うのは、この番号までの場面だけ（あとから足しても過去の日の問題が変わらない）。足した分は練習・とことんに出る
  const DAILY_MAX_ID = 44;
  const EPOCH = "2026-11-07";
  const KINDS = ["o", "o", "w", "o", "w"]; // 今日の5問の形
  const HARD_N = 3;

  // ---- 種と乱数（日本時間の日付から。ここでは端末ごとの乱数を使わない）----
  function seedOf(str) { let h = 2166136261 >>> 0; for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // 並べかえ（フィッシャー–イェーツ。sort の比較の中で乱数を引かない）
  function shuffle(a, r) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const dayNo = (k) => Math.max(1, Math.round((Date.parse(k) - Date.parse(EPOCH)) / 864e5) + 1);

  // ---- 問題の答え・形 ----
  const idsOf = (q) => (q.k === "w" ? q.ts : [q.t]);
  // 答えの番号（o は 0 よい・1 よくない、w は当てはまる場面の場所）
  const answerOf = (q) => (q.k === "o" ? SC[q.t].a : q.ts.findIndex((t) => SC[t].a === q.x));
  // 問題の主役（ルール帳の「一度で当てた」に数える場面）
  const mainOf = (q) => (q.k === "o" ? q.t : q.ts[answerOf(q)]);
  // 問題の形が正しいか（保存してあった問題を使う前に確かめる）
  function valid(q) {
    if (!q || typeof q !== "object" || !["o", "w"].includes(q.k)) return false;
    const ids = idsOf(q);
    if (!Array.isArray(ids) || !ids.every((i) => Number.isInteger(i) && i >= 0 && i < SC.length) || new Set(ids).size !== ids.length) return false;
    if (q.k === "o") return ids.length === 1;
    if (ids.length !== 3 || (q.x !== 0 && q.x !== 1) || ids.filter((t) => SC[t].a === q.x).length !== 1) return false;
    const z = ids.map((t) => SC[t].z).filter(Boolean);
    return new Set(z).size === z.length; // 似た場面を同じ問題に並べない
  }

  // ---- 「どれ？」の相手：答えが主役と逆の場面を2つ（似た場面・今日使った場面を避け、なるべく同じなかまから）----
  function wQ(t, r, pool, used) {
    const x = SC[t].a, zs = new Set([SC[t].z].filter(Boolean)), out = [];
    const ok = (i, strict, same) => i !== t && SC[i].a !== x && !out.includes(i) && !(SC[i].z && zs.has(SC[i].z)) && (!strict || !used.has(i)) && (!same || SC[i].g === SC[t].g);
    for (const [strict, same] of [[true, true], [true, false], [false, false]]) {
      for (const i of shuffle(pool, r)) { if (out.length === 2) break; if (ok(i, strict, same)) { out.push(i); if (SC[i].z) zs.add(SC[i].z); } }
      if (out.length === 2) break;
    }
    return { k: "w", x, ts: shuffle([t].concat(out), r) };
  }
  function make(kind, t, r, pool, used) {
    const q = kind === "w" ? wQ(t, r, pool, used) : { k: "o", t };
    idsOf(q).forEach((i) => used.add(i));
    return q;
  }

  // ---- 今日の5問・上級（場面の山を周ごとにちがう順に並べ、毎日5つずつ「主役」にする。前の周の終わりの3分の1は次の周のはじめの3分の1に置かない）----
  const POOL = SC.filter((t) => t.id <= DAILY_MAX_ID).map((t) => t.id);
  const perms = new Map();
  function permOf(tag, cyc) {
    const id = tag + ":" + cyc;
    if (perms.has(id)) return perms.get(id);
    let p = shuffle(POOL, rng(seedOf("atsusa:" + id)));
    if (cyc > 0) {
      const prev = permOf(tag, cyc - 1), third = Math.floor(POOL.length / 3), tail = new Set(prev.slice(prev.length - third));
      const head = p.filter((x) => !tail.has(x)).slice(0, third);
      p = head.concat(p.filter((x) => !head.includes(x)));
    }
    perms.set(id, p);
    return p;
  }
  // start の場所から、used に無く、want を満たす場面を1つ（無ければ want なしで）
  function take(tag, start, used, want) {
    const N = POOL.length;
    for (const w of want ? [want, null] : [null]) for (let p = start; p < start + N; p++) {
      const id = permOf(tag, Math.floor(p / N))[((p % N) + N) % N];
      if (used.has(id) || (w && !w(id))) continue;
      return id;
    }
    return POOL.find((i) => !used.has(i));
  }
  const dmemo = new Map();
  function dailyList(k) {
    if (dmemo.has(k)) return dmemo.get(k);
    const r = rng(seedOf("d:" + k)), start = (dayNo(k) - 1) * KINDS.length, used = new Set(), mains = [];
    // 主役を先に5つ決める。「よい？よくない？」の3問には、よい・よくないを両方入れる
    KINDS.forEach((kind, j) => {
      const os = mains.filter((_, i) => KINDS[i] === "o").map((t) => SC[t].a), last = kind === "o" && os.length === 2 && os[0] === os[1];
      const t = take("d", start + j, used, last ? (i) => SC[i].a !== os[0] : null);
      used.add(t); mains.push(t);
    });
    const u2 = new Set(mains);
    const out = KINDS.map((kind, j) => make(kind, mains[j], r, POOL, u2));
    dmemo.set(k, out);
    return out;
  }
  // 上級：「どれ？」を3問。主役は今日の5問に出ない場面。相手もなるべく今日の5問と重ねない
  function hardList(k) {
    const d = dailyList(k), used = new Set(d.flatMap(idsOf)), r = rng(seedOf("h:" + k)), mains = [];
    for (let j = 0; j < HARD_N; j++) { const t = take("h", (dayNo(k) - 1) * HARD_N + 7 + j, new Set([...used, ...mains]), null); mains.push(t); }
    mains.forEach((t) => used.add(t));
    return mains.map((t) => make("w", t, r, POOL, used));
  }
  // ★：まちがえたら★1、ヒントを使って当てたら★2、そのまま当てたら★3
  const starsOf = (r) => (r.m ? 1 : r.h ? 2 : 3);

  // ---- とことん：全部の場面を毎回ちがう順に「主役」にし、形は o→o→w の順にくり返す ----
  const EKINDS = ["o", "o", "w"];
  function endlessList(r, avoid, from) {
    let ids = shuffle(SC.map((t) => t.id), r);
    if (avoid != null && ids[0] === avoid) ids = ids.slice(1).concat(ids[0]);
    const all = SC.map((t) => t.id);
    return ids.map((t, j) => make(EKINDS[((from || 0) + j) % EKINDS.length], t, r, all, new Set()));
  }
  // 練習：選んだなかまの場面を主役に5問（相手はなるべく同じなかまから）。g が無ければ全部から
  function practiceList(r, g, first) {
    const all = SC.map((t) => t.id), mine = g ? all.filter((i) => SC[i].g === g) : all;
    let ids = shuffle(mine, r);
    if (first != null && mine.includes(first)) ids = [first].concat(ids.filter((i) => i !== first));
    if (ids.length < 5) ids = ids.concat(shuffle(all.filter((i) => !ids.includes(i)), r)).slice(0, 5);
    ids = ids.slice(0, 5);
    return ids.map((t, j) => make(KINDS[j], t, r, all, new Set()));
  }
  // 暑さ指数の段階の言い方（画面と検査で同じものを使う。無い場面は空）
  const fineOf = (t) => SC[t].f || "";

  const api = { SC, EPOCH, DAILY_MAX_ID, KINDS, EKINDS, HARD_N, GROUPS: D.GROUPS, SRC: D.SRC, seedOf, rng, shuffle, dayNo, idsOf, answerOf, mainOf, valid, dailyList, hardList, starsOf, endlessList, practiceList, fineOf };
  if (typeof module !== "undefined") module.exports = api; else window.JRG = api;
})();

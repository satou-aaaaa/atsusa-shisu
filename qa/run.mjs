// 暑さ指数よみの検査。場面のデータの形と出典（指針の段階・アラートの基準）・今日の5問と上級の組み方（3年分・過去の日が変わらない）・とことんと練習の問題（何百回）・通しで遊ぶ・ヒント・はずれ・続きから・上級・練習・あとから・実績・めやす帳・記録の読み合わせ・スマホ幅・PWA・引き継ぎ・見やすさ。
// 使い方: node qa/run.mjs   失敗があれば終了コード 1。結果は qa-report/report.md。
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import path from "node:path";
import { checkTransfer } from "./transfer-check.mjs";
import { checkSwStall } from "./sw-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = pathToFileURL(path.join(root, "index.html")).href;
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail: String(detail).slice(0, 500) });
const G = createRequire(import.meta.url)(path.join(root, "game.js"));
const html = readFileSync(path.join(root, "index.html"), "utf8");
const gameSrc = readFileSync(path.join(root, "game.js"), "utf8");
const dataSrc = readFileSync(path.join(root, "data.js"), "utf8");
const KEY = "atsusa-shisu-v1"; // gitleaks:allow 記録の名前（鍵ではない）
const day = (n) => new Date(Date.parse(G.EPOCH) + n * 864e5).toISOString().slice(0, 10);
const T = G.SC;

// 1. 場面のデータ（ブラウザを使わない）
{
  const bad = [];
  for (const t of T) {
    if (!t.s || t.s.length > 40) bad.push("場面:" + t.s);
    if (t.a !== 0 && t.a !== 1) bad.push("答え:" + t.s);
    if (!t.w || t.w.length > 45) bad.push("なぜ:" + t.s);
    if (!t.h || t.h.length > 30 || /よい|よくない|正しい|まちが/.test(t.h)) bad.push("ヒント:" + t.s);
    if (!G.GROUPS.includes(t.g)) bad.push("なかま:" + t.s);
    if (typeof t.f !== "string") bad.push("段階:" + t.s);
  }
  check("場面のデータの形（場面40字以内・なぜ45字以内・ヒント30字以内で答えを言わない）", bad.length === 0, bad.slice(0, 5).join(" / "));
  check("同じ文の場面が二つ無い", new Set(T.map((t) => t.s)).size === T.length);
  check("場面は40以上・よい15以上・よくない15以上・なかまは4つ（どのなかまも5以上）", T.length >= 40 && T.filter((t) => !t.a).length >= 15 && T.filter((t) => t.a).length >= 15 && G.GROUPS.length === 4 && G.GROUPS.every((g) => T.filter((t) => t.g === g).length >= 5), T.length);
  check("番号（id）は0から順に並ぶ（今日の問題の番号。足すのは最後だけ）", T.every((t, i) => t.id === i));
  // 出典の段階（2026-11-07 に環境省「暑さ指数について」で確かめた境目。/mnt/project-files/games/atsusa-research.md）
  // 日常：危険31以上・厳重警戒28〜31・警戒25〜28・注意25未満。運動：原則中止31以上・厳重警戒28〜31・警戒25〜28・注意21〜25・ほぼ安全21未満
  const D = [[31, "日常：危険（31以上）"], [28, "日常：厳重警戒（28以上31未満）"], [25, "日常：警戒（25以上28未満）"], [-99, "日常：注意（25未満）"]];
  const E = [[31, "運動：原則中止（31以上）"], [28, "運動：厳重警戒（28以上31未満）"], [25, "運動：警戒（25以上28未満）"], [21, "運動：注意（21以上25未満）"], [-99, "運動：ほぼ安全（21未満）"]];
  const st = [];
  for (const t of T) {
    if (!t.f) continue;
    const m = t.s.match(/暑さ指数(\d+)/), L = t.f.startsWith("日常") ? D : t.f.startsWith("運動") ? E : null;
    if (!m || !L || L.find((x) => +m[1] >= x[0])[1] !== t.f) st.push(t.s);
    if ((t.g === "運動・部活") !== t.f.startsWith("運動")) st.push("なかま:" + t.s);
  }
  check("段階を書いた場面は、場面の暑さ指数が指針の境目どおりの段階にある（日常・運動）", st.length === 0, st.slice(0, 3).join(" / "));
  check("段階の名前は指針の9つだけ", T.every((t) => !t.f || D.concat(E).some((x) => x[1] === t.f)));
  check("警戒アラートは33、特別警戒アラートは35（環境省の発表基準）", /33（予測）/.test(T.find((t) => /^熱中症警戒アラートは/.test(t.s)).w) && /35（予測）/.test(T.find((t) => /^熱中症特別警戒アラートは/.test(t.s)).w));
  check("意識がおかしい人に口から水を飲ませるのは「よくない」", T.filter((t) => /意識が(ぼんやり|おかしい)/.test(t.s) && /飲ませ/.test(t.s)).every((t) => t.a === 1) && T.some((t) => /意識がぼんやり/.test(t.s)));
  check("口から飲んでもらう「よい」場面は、意識がはっきりし吐き気がないことを両方書く", T.filter((t) => !t.a && /飲んでもら/.test(t.s)).every((t) => /意識がはっきり/.test(t.s) && /吐き気のない/.test(t.s)) && T.filter((t) => !t.a && /飲んでもら/.test(t.s)).length >= 2);
  check("出典は環境省のページ", Object.values(G.SRC).every((u) => /^https:\/\/www\.wbgt\.env\.go\.jp\//.test(u)));
  check("言い方：熱中症を「必ず防げる」「絶対」などと言い切らない", !/必ず防げ|絶対に?防|治ります|診断します/.test(dataSrc + html));
}
// 2. 今日の5問・上級（3年分）
{
  const bad = [];
  let mix = 0;
  const cnt = {};
  for (let n = 0; n < 365 * 3; n++) {
    const k = day(n), d = G.dailyList(k), h = G.hardList(k), di = d.flatMap(G.idsOf), hi = h.flatMap(G.idsOf);
    if (d.length !== 5 || h.length !== 3) bad.push(k + ":数");
    if (d.map((q) => q.k).join() !== G.KINDS.join() || h.some((q) => q.k !== "w")) bad.push(k + ":形");
    if (new Set(di).size !== di.length) bad.push(k + ":今日の中で同じ場面");
    if (h.map(G.mainOf).some((t) => di.includes(t)) || new Set(hi).size !== hi.length) bad.push(k + ":上級の重なり");
    if (d.concat(h).some((q) => !G.valid(q) || G.idsOf(q).some((t) => t > G.DAILY_MAX_ID))) bad.push(k + ":こわれた問題");
    const os = d.filter((q) => q.k === "o").map((q) => T[q.t].a);
    if (!os.includes(0) || !os.includes(1)) mix++;
    d.concat(h).forEach((q) => { const m = G.mainOf(q); cnt[m] = (cnt[m] || 0) + 1; });
  }
  check("今日の5問は ○✕・○✕・どれ・○✕・どれ、上級は「どれ？」×3、同じ場面を重ねない・上級の主役は今日の5問に出ない（3年分）", bad.length === 0, bad.slice(0, 5).join(","));
  check("今日の「よい？よくない？」3問には、よい・よくないが両方入る（3年分）", mix === 0, mix);
  const v = Object.values(cnt);
  check("3年で全部の場面が主役になり、偏りが小さい（いちばん多い場面がいちばん少ない場面の1.5倍まで）", Object.keys(cnt).length === G.DAILY_MAX_ID + 1 && Math.max(...v) <= Math.min(...v) * 1.5, Math.min(...v) + "〜" + Math.max(...v));
  const seen = new Set(); for (let n = 0; n < 10; n++) G.dailyList(day(n)).forEach((q) => seen.add(G.mainOf(q)));
  check("10日で今日の問題にほとんどの場面が出る（40以上）", seen.size >= 40, seen.size);
  { let err = ""; try { for (const k of ["2026-11-06", "2026-10-01", "2025-01-01"]) { G.dailyList(k); G.hardList(k); if (G.dayNo(k) !== 1) err = k + " #" + G.dayNo(k); } } catch (e) { err = e.message; } check("時計が第1回より前にずれていても今日の問題が作れる（番号は #1）", !err, err); }
  const snap = createHash("sha256").update(JSON.stringify([...Array(120)].map((_, n) => [G.dailyList(day(n)), G.hardList(day(n))]))).digest("hex").slice(0, 16);
  check("はじめの120日の今日の5問・上級は前と同じ（変えると過去の日の問題が変わる）", snap === "62bd3eba2fdaef2a", snap);
  check("乱数は sort の比較の中で引かない", !/sort\([^)]*r\(\)/.test(gameSrc + html));
  check("Math.random は練習・とことんの並びと回の名札だけ（game.js には無い・index.html に5か所）", !/Math\.random/.test(gameSrc + dataSrc) && (html.match(/Math\.random/g) || []).length === 5, (html.match(/Math\.random/g) || []).length);
}
// 3. とことん・練習（何百回）
{
  const bad = [];
  for (let t = 0; t < 400; t++) {
    const r = G.rng(G.seedOf("qa-e:" + t)), avoid = t % 3 ? t % T.length : undefined, from = t % 3, L = G.endlessList(r, avoid, from);
    if (L.length !== T.length) { bad.push(t + ":数"); continue; }
    if (new Set(L.map(G.mainOf)).size !== L.length) bad.push(t + ":同じ場面が主役に2回");
    if (avoid !== undefined && G.mainOf(L[0]) === avoid) bad.push(t + ":つなぎ目");
    L.forEach((q, j) => { if (!G.valid(q) || q.k !== G.EKINDS[(from + j) % 3]) bad.push(t + ":" + j); });
  }
  check("とことん：場面の数だけ問題・同じ場面を2回主役にしない・つなぎ目で続けない・○✕→○✕→どれ・こわれた問題を作らない（400回）", bad.length === 0, bad.slice(0, 5).join(","));
  const pb = [];
  for (let t = 0; t < 300; t++) { const g = t % 5 === 4 ? "" : G.GROUPS[t % 4], L = G.practiceList(G.rng(G.seedOf("qa-p:" + t)), g); if (L.length !== 5 || L.some((q) => !G.valid(q)) || (g && L.some((q) => T[G.mainOf(q)].g !== g))) pb.push(t); }
  check("練習：なかまごとに5問・主役はそのなかま・こわれた問題を作らない（300回）", pb.length === 0, pb.slice(0, 5).join(","));
  { const L = G.practiceList(G.rng(1), T[7].g, 7); check("練習：めやす帳から選んだ場面が1問目に出る", G.mainOf(L[0]) === 7); }
  check("こわれた問題は使わない（valid）", !G.valid({ k: "o", t: 999 }) && !G.valid({ k: "o", t: "1" }) && !G.valid({ k: "w", x: 1, ts: [4, 6, 3] }) && !G.valid({ k: "w", x: 2, ts: [0, 1, 2] }) && !G.valid({ k: "w", x: 1, ts: [1, 1, 0] }) && !G.valid({ k: "x" }) && !G.valid({ k: "w", x: 1, ts: [1, 3, , ] }) && G.valid({ k: "w", x: 1, ts: [1, 3, 9] }));
  // ひな形（ほかのゲーム）の言葉が残らない：実績の「なかま」は本当にあるなかまだけ（2026-11-07 CodeRabbit が「通る場所」「安全運転名人」の残りを見つけた）
  { const named = [...html.matchAll(/「([^」]+)」の場面に全部/g)].map((m) => m[1]), feed = readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/feedback.yml"), "utf8"), left = ["安全運転", "交差点", "踏切", "通る場所", "自転車", "冷蔵庫", "節電"].filter((w) => html.includes(w) || feed.includes(w));
    check("実績のなかまの名前が本当のなかま・ほかのゲームの言葉が残っていない", named.length >= 2 && named.every((g) => G.GROUPS.includes(g)) && !left.length, left.join(",") || named.join(",")); }
  { const ws = []; for (let n = 0; n < 365; n++) ws.push(...G.dailyList(day(n)).concat(G.hardList(day(n))).filter((q) => q.k === "w")); check("「どれ？」は似た場面（z が同じ）を並べない・答えはちょうど1つ（1年分）", ws.every((q) => G.valid(q) && q.ts.filter((t) => T[t].a === q.x).length === 1), ws.length); }
  check("★：はずれで★1・ヒントで当てると★2・そのまま当てると★3", G.starsOf({ m: 0, h: 0 }) === 3 && G.starsOf({ m: 0, h: 1 }) === 2 && G.starsOf({ m: 1, h: 0 }) === 1 && G.starsOf({ m: 1, h: 1 }) === 1);
}
// 4. 決まりの言葉（好きなだけ遊べる・お笑いを入れない・外へ送らない・診断の代わりにしない）
{
  const vis = html.replace(/<!-- a11y:begin[\s\S]*?<!-- a11y:end -->/, "");
  check("チケット・回数制限・🔒で開くモードが無い（game-dev.md F1・F2）", !/🎫|チケット|すると開く|🔒|スタミナ|あと\d+回/.test(vis));
  check("お笑いの言葉を入れない（本物っぽさ優先）", !/（笑）|ツッコミ|ボケ|爆笑|w{3}(?!\.)/.test(vis + dataSrc));
  check("外へ通信しない（CSP の connect-src は 'self' だけ・fetch を使わない）", /connect-src 'self';/.test(html) && !/fetch\(|XMLHttpRequest|sendBeacon/.test(vis + gameSrc));
  check("Ko-fi はただのリンクだけ（スクリプトを入れない）", !/ko-fi\.com\/widgets|<script[^>]+ko-fi/i.test(html));
  check("遊び方に出典（環境省・日本生気象学会・日本スポーツ協会）・診断の代わりにならないこと・119番を書く", /熱中症予防情報サイト/.test(vis) && /日本スポーツ協会/.test(vis) && /日本生気象学会/.test(vis) && /代わりにはなりません/.test(vis) && /119番/.test(vis) && /wbgt\.env\.go\.jp/.test(vis));
  const sw = readFileSync(path.join(root, "sw.js"), "utf8"), shell = JSON.parse(sw.match(/SHELL = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  { const st = await checkSwStall(sw); check("PWA：本文の途中で通信が止まっても4秒で保存したものを返す・ふつうはネットの返事", st.ok, JSON.stringify(st)); }
  check("PWA：sw.js の SHELL に画面のファイルが全部ある・取り直して保存する（cache: reload）", ["./", "./index.html", "./data.js", "./game.js", "./transfer.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-512-maskable.png"].every((f) => shell.includes(f)) && shell.filter((f) => f !== "./").every((f) => existsSync(path.join(root, f))) && /cache: "reload"/.test(sw) && /CACHE = "atsusa-shisu-/.test(sw));
  const mf = JSON.parse(readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  check("PWA：manifest の名前・アイコン（192・512・maskable）", mf.name === "暑さ指数よみ" && mf.icons.length === 3 && mf.icons.some((i) => i.purpose === "maskable"));
  check("記録の名前の行に gitleaks:allow がある", html.split("\n").concat(readFileSync(path.join(root, "qa/run.mjs"), "utf8").split("\n")).filter((l) => l.includes(KEY) && !l.includes("filter((l) => l.includes(KEY)")).every((l) => /gitleaks:allow/.test(l)));
}

// 5. ブラウザで遊ぶ
let browser;
const errors = [];
async function newPage(opt = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, locale: "ja-JP" }, opt));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)|ERR_|net::/.test(m.text())) errors.push(m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p.goto(url);
  return p;
}
const closeHow = (p) => p.evaluate(() => { const d = document.getElementById("howto"); if (d.open) document.getElementById("howto-ok").click(); });
const cur = (p) => p.evaluate(() => { const c = window.__sk.cur(); return c && { q: c.q, h: c.h, done: c.done, mode: c.mode, i: c.i, ans: window.__sk.answer() }; });
async function answer(p, right = true) { const c = await cur(p); const n = c.q.k === "o" ? 2 : 3; let j = c.ans; if (!right) { for (let x = 0; x < n; x++) if (x !== c.ans && !(await p.locator(`#board button[data-j="${x}"]`).isDisabled())) { j = x; break; } } await p.click(`#board button[data-j="${j}"]`); await p.waitForSelector("#next"); }
try {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await newPage();
  check("はじめて開くと遊び方が出る（出典つき）", await page.evaluate(() => document.getElementById("howto").open && /熱中症予防情報サイト/.test(document.getElementById("howto").textContent)));
  { const p0 = await newPage(); let bad = 0;
    for (let j = 0; j < 10; j++) { await p0.evaluate((K) => localStorage.removeItem(K), KEY); await p0.reload(); await p0.keyboard.press("Escape"); if (await p0.evaluate((K) => !(JSON.parse(localStorage.getItem(K) || "{}").tut), KEY)) bad++; await p0.reload(); if (await p0.evaluate(() => document.getElementById("howto").open)) bad++; }
    await p0.evaluate((K) => localStorage.removeItem(K), KEY); await p0.reload(); await p0.click("#howto-ok");
    const atOnce = await p0.evaluate((K) => !!(JSON.parse(localStorage.getItem(K) || "{}").tut), KEY);
    check("遊び方：Esc で閉じても「見た」が残り、すぐ読み直しても出ない（10回）・「わかった」を押したその場で残る", bad === 0 && atOnce, bad);
    await p0.close(); }
  await closeHow(page);
  check("ホーム：今日の5問・とことん・上級・練習・めやす帳・実績・カレンダーのボタンが最初から押せる", await page.evaluate(() => ["go-d", "go-e", "go-h", "go-p", "go-dex", "go-ach", "go-cal"].every((id) => { const b = document.getElementById(id); return b && !b.disabled; })));
  { const ctx = await browser.newContext(); const p2 = await ctx.newPage(); await p2.goto(url); const d2 = await p2.evaluate(() => JSON.stringify(window.JRG.dailyList("2026-12-24"))); await ctx.close(); check("同じ日は別のブラウザで開いても同じ5問", d2 === JSON.stringify(G.dailyList("2026-12-24"))); }
  await page.click("#go-d");
  const k = await page.evaluate(() => window.__sk.todayKey());
  let c = await cur(page);
  check("1問目「よい？よくない？」：場面1つと「○ よい」「✕ よくない」の2つのボタン・ヒント", c.q.k === "o" && JSON.stringify(c.q) === JSON.stringify(G.dailyList(k)[0]) && (await page.locator(".yn button").count()) === 2 && /○ よい/.test(await page.textContent(".yn")) && /✕ よくない/.test(await page.textContent(".yn")) && !!(await page.$("#hint")));
  await page.click("#hint"); await page.waitForTimeout(80);
  check("ヒント（○✕）：手がかりの文が出る（答えは言わない）・ヒントは1回まで", (await page.locator(".hintbox").count()) === 1 && (await page.textContent(".hintbox")).includes(T[c.q.t].h) && (await page.locator("#hint").isDisabled()) && /ヒント/.test(await page.textContent("#live")));
  await answer(page, true);
  check("答えのあとの答え・なぜも「読む」の対象（data-a11y-say）", await page.evaluate(() => [...document.querySelectorAll(".verdict [data-a11y-say]")].some((e) => /答え：/.test(e.textContent)) && [...document.querySelectorAll(".verdict [data-a11y-say]")].some((e) => /なぜ？/.test(e.textContent))));
  check("当てると「✓ 正解」・答え・なぜ・出典のリンク・★2（ヒント）", await page.evaluate(() => { const v = document.querySelector(".verdict"); return v.textContent.includes("✓ 正解") && /答え：/.test(v.textContent) && /なぜ？/.test(v.textContent) && !!v.querySelector('a[href^="https://www.wbgt.env.go.jp/"]') && v.querySelector(".stars").getAttribute("aria-label") === "星2つ"; }) && (await page.locator(".yn button.ok").count()) === 1);
  await page.focus("#next"); await page.keyboard.press("Enter");
  check("キーボードで「次の問題へ」を押すと、次の問題文へ移る（消えたボタンに取り残されない）", await page.evaluate(() => document.activeElement && document.activeElement.id === "ask"));
  c = await cur(page);
  await answer(page, false);
  check("はずれると「✕ ざんねん」・正しい答えに ✓、選んだ答えに ✕・★1", await page.evaluate(() => { const v = document.querySelector(".verdict"); return v.textContent.includes("✕ ざんねん") && v.classList.contains("miss") && document.querySelectorAll(".yn button.ok").length === 1 && document.querySelectorAll(".yn button.ng").length === 1 && v.querySelector(".stars").getAttribute("aria-label") === "星1つ"; }));
  { const f = G.fineOf(c.q.t); check("段階のある場面は、答えのあとに暑さ指数の段階を出す（無い場面は出さない）", f ? (await page.textContent(".verdict")).includes(f) : (await page.locator(".verdict .fine").count()) === 0, f); }
  await page.click("#next");
  c = await cur(page);
  check("3問目「どれ？」：場面のカード3枚", c.q.k === "w" && (await page.locator("#board button.tip").count()) === 3 && (await page.textContent("#ask")).includes(c.q.x ? "よくない" : "「よい」"));
  await page.reload(); await closeHow(page);
  check("途中で閉じても、ホームに「続きから（3問目）」が出る", (await page.textContent("#go-d")).includes("続きから（3問目）"));
  await page.click("#go-d");
  c = await cur(page);
  check("続きからは同じ3問目", c.i === 2 && JSON.stringify(c.q) === JSON.stringify(G.dailyList(k)[2]));
  await page.click("#hint");
  check("ヒント（どれ）：当てはまらない場面を1つ消す（取り消し線・押せない）", (await page.locator("#board button.tip.gone").count()) === 1 && (await page.locator("#board button.tip.gone").isDisabled()) && (await page.getAttribute("#board button.tip.gone", "data-j")) !== String(c.ans));
  await page.reload(); await closeHow(page); await page.click("#go-d");
  check("ヒントを使って閉じても、続きからでヒントは使ったまま", (await cur(page)).h === 1 && (await page.locator("#hint").isDisabled()));
  await answer(page, true);
  check("「どれ？」の答えのあと：3つの場面それぞれに ○ よい／✕ よくない と、なぜ", (await page.locator(".verdict .wl li").count()) === 3 && /○ よい/.test(await page.textContent(".verdict .wl")) && /✕ よくない/.test(await page.textContent(".verdict .wl")));
  await page.click("#next");
  for (let j = 3; j < 5; j++) { await answer(page, true); if (j < 4) await page.click("#next"); }
  check("5問目のあとは「結果を見る」", (await page.textContent("#next")).includes("結果を見る"));
  await page.click("#next");
  const res = await page.evaluate(() => ({ share: document.querySelector(".share") && document.querySelector(".share").textContent, rows: document.querySelectorAll(".res > div").length, kofi: /Ko-fi でコーヒー/.test(document.getElementById("app").innerText), e: !!document.getElementById("go-e"), h: !!document.getElementById("go-h") }));
  const s1 = await page.evaluate(() => window.__sk.load());
  check("結果：5問の行・シェア・とことん・上級に挑む", res.rows === 5 && res.e && res.h && !!res.share, JSON.stringify(res));
  check("シェアの文に場面・答えを出さない", G.dailyList(k).flatMap(G.idsOf).every((t) => !res.share.includes(T[t].s.slice(0, 8))) && !/よい|よくない|暑さ指数\d/.test(res.share) && /🟨/.test(res.share) && /🟧/.test(res.share));
  check("今日の記録がつき、出会った場面が増える", !!s1.days[k] && s1.days[k].r.length === 5 && Object.keys(s1.seen).length >= 5);
  check("はずれのある日は Ko-fi の1行を出さない", !res.kofi);
  await page.click("#back");
  check("ホームに「今日の結果を見る」", (await page.textContent("#go-d")).includes("今日の結果を見る"));
  // 上級
  await page.click("#go-h");
  c = await cur(page);
  check("上級：「どれ？」の3枚・ヒントのボタンが無い", c.mode === "h" && c.q.k === "w" && (await page.locator("#board button.tip").count()) === 3 && (await page.locator("#hint").count()) === 0);
  for (let j = 0; j < 3; j++) { await answer(page, true); await page.click("#next"); }
  check("上級の記録がつく", await page.evaluate(() => { const s = window.__sk.load(); return !!s.hdays[window.__sk.todayKey()] && s.hdays[window.__sk.todayKey()].r.length === 3; }));
  // とことん
  await page.click("#go-e");
  for (let j = 0; j < 2; j++) { await answer(page, true); await page.click("#next"); }
  c = await cur(page);
  check("とことん：3問目は「どれ？」", c.i === 2 && c.q.k === "w", c.i + ":" + c.q.k);
  await answer(page, true); await page.click("#next");
  await answer(page, false);
  check("とことん：はずれても終わらない（続けての数は0から）", (await page.locator("#quit").count()) === 1 && /0から/.test(await page.textContent(".verdict")));
  await page.click("#next");
  await answer(page, true); await page.click("#next");
  await page.click("#quit");
  check("とことん：「ここで降りる」で終わり、続けて当てた数の自己ベスト（3）を残す", await page.evaluate(() => window.__sk.load().ebest === 3 && /続けて最高 3問/.test(document.getElementById("app").innerText)));
  check("とことんは今日の記録・連続には数えない", await page.evaluate((d) => JSON.stringify(window.__sk.load().days) === JSON.stringify(d), s1.days));
  await page.click("#go-e");
  await page.evaluate(() => { const s = window.__sk; s.save((x) => { x.runs.e.res = x.runs.e.list.slice(0, -1).map(() => ({ m: 0, h: 0 })); }); s.play("e"); });
  check("とことんは問題が尽きない（並びの最後まで来たら新しい並びをつなげる）", await page.evaluate(() => window.__sk.load().runs.e.list.length >= 2 * window.JRG.SC.length - 1 && !!window.__sk.cur()));
  await page.evaluate(() => window.__sk.home());
  // 練習・めやす帳
  await page.click("#go-p");
  check("練習：4つのなかまから選べる", (await page.locator(".res button").count()) === 4);
  await page.click(`.res button[data-g="${G.GROUPS[1]}"]`);
  c = await cur(page);
  check("練習：選んだなかまの場面が出る", c.mode === "p" && T[G.mainOf(c.q)].g === G.GROUPS[1]);
  for (let j = 0; j < 5; j++) { await answer(page, true); if (j < 4) await page.click("#next"); }
  check("練習の5問目のあとは「練習のまとめへ」", (await page.textContent("#next")).includes("練習のまとめ"));
  await page.click("#next");
  check("練習は今日の記録に入らない", await page.evaluate((d) => JSON.stringify(window.__sk.load().days) === JSON.stringify(d), s1.days));
  await page.click("#go-dex");
  const met = await page.evaluate(() => Object.keys(window.__sk.load().seen).map(Number));
  check("めやす帳：出会った場面は押せる、まだの場面は「？？？」", (await page.locator(".res .no").count()) === T.length - met.length && (await page.locator(".res button[data-t]").count()) === met.length);
  const fm = met.find((t) => T[t].f) ?? met[0];
  await page.click(`.res button[data-t="${fm}"]`);
  check("めやす帳の場面：答え・なぜ・段階・出典・「この場面から練習する」", (await page.textContent(".detail .ans")).includes(T[fm].a ? "よくない" : "○ よい") && (!G.fineOf(fm) || (await page.textContent(".detail")).includes(G.fineOf(fm))) && (await page.locator('.detail a[href^="https://www.wbgt.env.go.jp/"]').count()) === 2 && (await page.locator("#again").count()) === 1);
  await page.click("#again");
  check("めやす帳から練習：その場面が1問目に出る", G.mainOf((await cur(page)).q) === fm);
  await page.close();

  // おさらい（まちがえた・ヒントを見た場面）
  { const p = await newPage();
    await p.evaluate((K) => { localStorage.setItem(K, JSON.stringify({ v: 1, tut: true, t: 1 })); }, KEY);
    await p.reload(); await closeHow(p);
    check("おさらい：まちがえた場面が無いうちはボタンを出さない", (await p.locator("#go-r").count()) === 0);
    await p.click("#go-p"); await p.click("#rand");
    const missed = [];
    for (let j = 0; j < 5; j++) { const c = await cur(p); if (j === 1) { await p.click("#hint"); await p.evaluate(() => window.__sk.pick(window.__sk.answer())); } else if (j % 2 === 0) await p.evaluate(() => { const a = window.__sk.answer(); window.__sk.pick(window.__sk.cur().q.k === "o" ? 1 - a : (a + 1) % 3); }); else await p.evaluate(() => window.__sk.pick(window.__sk.answer())); if (j !== 3) missed.push(G.mainOf(c.q)); if (j < 4) await p.click("#next"); }
    await p.click("#next"); await p.evaluate(() => window.__sk.home());
    const want = [...new Set(missed)];
    check("おさらい：まちがえた場面・ヒントを見て当てた場面がホームのボタンに数で出る（一度で当てた場面は入らない）", (await p.textContent("#go-r")).includes(String(want.length)), await p.textContent("#go-r"));
    await p.click("#go-r");
    let c = await cur(p);
    check("おさらい：古いまちがいから「よい？よくない？」で出る", c.mode === "r" && c.q.k === "o" && c.q.t === want[0]);
    await p.evaluate(() => window.__sk.pick(1 - window.__sk.answer())); await p.click("#next");
    for (let j = 1; j < want.length; j++) { await p.evaluate(() => window.__sk.pick(window.__sk.answer())); await p.click("#next"); }
    const left = await p.evaluate(() => { window.__sk.home(); const b = document.getElementById("go-r"); return b ? b.textContent : ""; });
    check("おさらい：一度で当てた場面は消え、またまちがえた場面は残る", left.includes("1") && (await p.evaluate((t) => { const s = window.__sk.load(); return s.miss[t] > (s.fix[t] || 0); }, want[0])));
    await p.click("#go-r"); await p.evaluate(() => window.__sk.pick(window.__sk.answer())); await p.click("#next");
    check("おさらい：全部一度で当てるとボタンが消える・今日の記録・連続には数えない", (await p.locator("#go-r").count()) === 0 && (await p.evaluate(() => { window.__sk.home(); const s = window.__sk.load(); return !document.getElementById("go-r") && Object.keys(s.days).length === 0 && Object.keys(s.late).length === 0; })));
    check("おさらい：古いタブの記録と合わせても、一度で当てた場面は戻らない（時刻の新しいほう）", await p.evaluate((K) => { const now = window.__sk.load(); mem = JSON.stringify(Object.assign({}, now, { t: now.t + 9, miss: { 3: 100 }, fix: {} })); const s = window.__sk.load(); mem = null; const t = Object.keys(now.fix)[0]; return s.miss[3] === Math.max(100, now.miss[3] || 0) && !!t && s.fix[t] === now.fix[t] && !(s.miss[t] > s.fix[t]); }, KEY));
    check("おさらい：5つより多くまちがえても、出るのは古いほうから5問", await p.evaluate((K) => { const s = window.__sk.load(); s.miss = {}; s.fix = {}; for (let t = 0; t < 8; t++) s.miss[t] = 1000 - t; localStorage.setItem(K, JSON.stringify(s)); window.__sk.startRun("r"); const L = window.__sk.load().runs.r.list.map((q) => q.t); return JSON.stringify(L) === JSON.stringify([7, 6, 5, 4, 3]); }, KEY));
    await p.close(); }

  // あとから（取りこぼした日）・カレンダー
  { const p = await newPage();
    await p.evaluate((K) => { localStorage.setItem(K, JSON.stringify({ v: 1, tut: true, t: 1 })); }, KEY);
    await p.reload();
    const lt = await p.evaluate(() => window.__sk.lateDays(window.__sk.load()));
    check("取りこぼした日は、はじめの日（" + G.EPOCH + "）より前を出さない・7日まで", lt.every((d) => d >= G.EPOCH) && lt.length <= 7);
    await p.evaluate(() => { const RD = Date, off = 3 * 864e5; window.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now() + off); } static now() { return RD.now() + off; } }; });
    await p.evaluate(() => window.__sk.home()); await p.click("#go-cal");
    const lt2 = await p.evaluate(() => window.__sk.lateDays(window.__sk.load()));
    // 対象の日が前の月なら、その月へ移ってから見る（月末に走らせると、3日後のカレンダーは次の月になる。2026-11-07 CodeRabbit）
    if (lt2.length && lt2[0].slice(0, 7) !== (await p.evaluate(() => window.__sk.todayKey())).slice(0, 7)) await p.click("#pm");
    check("カレンダー：あとから遊べる日は ▶（点線のボタン）", lt2.length > 0 && (await p.locator(`.cal button[data-k="${lt2[0]}"]`).count()) === 1, JSON.stringify(lt2));
    if (lt2.length) {
      const dk = lt2[0];
      await p.click(`.cal button[data-k="${dk}"]`);
      const ca = await cur(p);
      check("あとから：その日の今日の5問と同じ問題", ca.mode === "a" && JSON.stringify(ca.q) === JSON.stringify(G.dailyList(dk)[0]));
      for (let j = 0; j < 5; j++) { await answer(p, true); await p.click("#next"); }
      const sl = await p.evaluate(() => window.__sk.load());
      check("あとから：記録は late に入り、今日の記録（days）には入らない・シェアは出さない", !!sl.late[dk] && !sl.days[dk] && !(await p.locator(".share").count()));
    }
    await p.close(); }

  // 実績
  { const p = await newPage();
    await p.evaluate((K) => { localStorage.setItem(K, JSON.stringify({ v: 1, tut: true, seen: { 0: 1, 1: 1, 2: 1 }, t: 1 })); }, KEY);
    await p.reload();
    const al = await p.evaluate(() => window.__sk.achList(window.__sk.load()));
    check("実績は10〜14個", al.length >= 10 && al.length <= 14, al.length);
    await p.click("#go-ach");
    check("実績の画面：取った ★・まだ ☆ と進み具合", (await p.textContent(".achs")).includes("★ はじめの場面") && (await p.textContent(".achs")).includes("いま 3/10"));
    await p.close(); }

  // 全部一度で当てた日は Ko-fi の1行（今日の5問を初めて終えたときだけ）
  { const p = await newPage(); await closeHow(p);
    await p.click("#go-d");
    for (let j = 0; j < 5; j++) { await answer(p, true); await p.click("#next"); }
    check("全部一度で当てた日は、結果の画面の下に Ko-fi の1行（ただのリンク）", (await p.locator('a[href="https://ko-fi.com/satouaaaaa"]').count()) >= 2 && /Ko-fi でコーヒー/.test(await p.innerText("#app")) && /全部一度で/.test(await p.textContent(".share")));
    await p.click("#back"); await p.click("#go-d");
    check("結果をもう一度見ても Ko-fi の1行は出さない", !/Ko-fi でコーヒー/.test(await p.innerText("#app")));
    await p.close(); }

  // 古いタブ・記録の読み合わせ
  { const p = await newPage(); await closeHow(p);
    await p.click("#go-d");
    const r = await p.evaluate((K) => { const s = JSON.parse(localStorage.getItem(K)); s.runs.d.id = "other"; localStorage.setItem(K, JSON.stringify(s)); window.__sk.pick(window.__sk.answer()); return window.__sk.load().runs.d.res.length; }, KEY);
    check("別のタブで回が変わっていたら、古いタブの答えを記録しない", r === 0);
    check("保存に失敗したら、保存できるまで知らせ続け、保存できたら消す", await p.evaluate(async () => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error("full"); }; window.__sk.save(() => {}); window.__sk.save(() => {}); const one = document.querySelectorAll("#savewarn").length === 1 && document.getElementById("savewarn").textContent.includes("保存できませんでした"); await new Promise((r) => setTimeout(r, 2500)); const stay = !!document.getElementById("savewarn"); Storage.prototype.setItem = orig; window.__sk.save(() => {}); return one && stay && !document.getElementById("savewarn"); }));
    check("保存できない帯は画面のいちばん上に場所を取り（ボタンに重ならない）、読み上げの知らせにも出し、ほかの知らせのあとも警告が残る・保存できたら帯と警告が消え、ほかの知らせは残る", await p.evaluate(async () => { const W = "保存できませんでした", tick = () => new Promise((r) => setTimeout(r, 50)); const orig = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error("full"); }; window.__sk.save(() => {}); const b = document.getElementById("savewarn"); const top = !!b && document.body.firstElementChild === b && getComputedStyle(b).position === "sticky"; const l = document.getElementById("live"); let live = true, kept = true, other = true; if (l) { live = l.textContent.includes(W); l.textContent = ""; await tick(); l.textContent = "べつの知らせ"; await tick(); kept = l.textContent.includes("べつの知らせ") && l.textContent.includes(W); } Storage.prototype.setItem = orig; window.__sk.save(() => {}); await tick(); if (l) other = l.textContent === "べつの知らせ"; return top && live && kept && other && !document.getElementById("savewarn"); }));
    await p.evaluate(() => window.__sk.home()); await p.click("#go-dex");
    check("めやす帳は画面より十分長い（帯のスクロールの検査に使う）", await p.evaluate(() => document.documentElement.scrollHeight - innerHeight > 1000));
    check("保存できない帯は、長い画面を下までスクロールしても画面の上に見えている（めやす帳で。body の高さで止まらない・帯に高さがあり見えている）", await p.evaluate(async () => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new Error("full"); }; window.__sk.save(() => {}); scrollTo(0, document.documentElement.scrollHeight); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const b = document.getElementById("savewarn"), r = b && b.getBoundingClientRect(); const ok = !!r && r.height > 0 && getComputedStyle(b).visibility === "visible" && getComputedStyle(b).display !== "none" && scrollY > 1000 && r.top >= -1 && r.top < 5; scrollTo(0, 0); Storage.prototype.setItem = orig; window.__sk.save(() => {}); return ok && !document.getElementById("savewarn"); }));
    check("保存に失敗したあと別のタブが保存しても、両方の日ごとの結果を残し、数は大きいほう", await p.evaluate((K) => { const s0 = window.__sk.load(); mem = JSON.stringify(Object.assign({}, s0, { t: 5, days: { "2000-01-01": { r: [] } }, seen: { 3: 9 }, ebest: 7 })); localStorage.setItem(K, JSON.stringify(Object.assign({}, s0, { t: 9, days: { "2000-01-02": { r: [] } }, seen: { 3: 2 }, ebest: 3 }))); const r = window.__sk.load(); mem = null; return !!r.days["2000-01-01"] && !!r.days["2000-01-02"] && r.seen[3] === 9 && r.ebest === 7; }, KEY));
    check("同じ回の途中経過は、進んだほう（新しく保存したタブが遅れていても）", await p.evaluate((K) => { const s0 = window.__sk.load(), base = { mode: "d", date: "2000-01-01", list: [], id: "x" }; mem = JSON.stringify(Object.assign({}, s0, { t: 5, runs: { d: Object.assign({}, base, { res: [{ m: 0, h: 0 }] }) } })); localStorage.setItem(K, JSON.stringify(Object.assign({}, s0, { t: 9, runs: { d: Object.assign({}, base, { res: [] }) } }))); const r = window.__sk.load(); mem = null; return r.runs.d.res.length === 1; }, KEY));
    check("こわれた記録でも画面が出る（入れ物を補う）", await p.evaluate((K) => { localStorage.setItem(K, JSON.stringify({ v: 1, days: 5, seen: null, runs: "x" })); try { window.__sk.home(); return !!document.getElementById("go-d"); } catch (e) { return false; } }, KEY));
    check("途中経過の中身がこわれていても（res が [null]・知らない問題）ホームが出て、その回だけ消える", await p.evaluate((K) => { const k = window.__sk.todayKey(); for (const bad of [{ res: [null], list: [] }, { res: [], list: [{ k: "o", t: 999 }] }, { list: [] }]) { localStorage.setItem(K, JSON.stringify({ v: 1, tut: true, days: {}, runs: { d: Object.assign({ mode: "d", date: k, id: "q" }, bad) } })); try { window.__sk.home(); if (!document.getElementById("go-d") || window.__sk.load().runs.d) return false; } catch (e) { return false; } } return true; }, KEY));
    check("「ここで降りる」で終えた回は、古いタブの写しと合わせても戻らない", await p.evaluate((K) => { const base = { mode: "e", date: "2000-01-01", list: [], res: [{ m: 0, h: 0 }], id: "endrun" }; localStorage.setItem(K, JSON.stringify({ v: 1, tut: true, t: 9, ended: ["endrun"], runs: {} })); mem = JSON.stringify({ v: 1, tut: true, t: 5, runs: { e: base } }); const r = window.__sk.load(); mem = null; return !r.runs.e; }, KEY));
    check("きのう解き終えて結果を見ずに閉じた回も、次に開いたとき記録する", await p.evaluate((K) => { const y = window.__sk.prevDay(window.__sk.todayKey()), list = window.JRG.dailyList(y); localStorage.setItem(K, JSON.stringify({ v: 1, tut: true, t: 1, runs: { d: { mode: "d", date: y, id: "yy", list, res: list.map(() => ({ m: 0, h: 0 })), cur: null } } })); window.__sk.home(); const s = window.__sk.load(); return !!s.days[y] && !s.runs.d; }, KEY));
    check("あとからの回も、解き終えて結果を見ずに閉じたら次に開いたとき記録する", await p.evaluate((K) => { const y = window.__sk.prevDay(window.__sk.todayKey()), list = window.JRG.dailyList(y); localStorage.setItem(K, JSON.stringify({ v: 1, tut: true, t: 1, runs: { ["a:" + y]: { mode: "a", date: y, id: "ay", list, res: list.map(() => ({ m: 0, h: 0 })), cur: null } } })); window.__sk.home(); const s = window.__sk.load(); return !!s.late[y] && !s.runs["a:" + y]; }, KEY));
    check("引き継ぎで入った変な値（数にできない ebest・seen）でもホームが出て、0として読む", await p.evaluate((K) => { localStorage.setItem(K, JSON.stringify({ v: 1, tut: true, ebest: { valueOf: 0, toString: 0 }, seen: { 1: { valueOf: 0, toString: 0 }, 2: 3 } })); try { window.__sk.home(); const s = window.__sk.load(); return !!document.getElementById("go-d") && s.ebest === 0 && s.seen[1] === 0 && s.seen[2] === 3; } catch (e) { return false; } }, KEY));
    check("こわれた日の記録（r が無い・数でない）は読むときに捨て、画面が出る", await p.evaluate((K) => { localStorage.setItem(K, JSON.stringify({ v: 1, tut: true, days: { "2026-11-07": { r: [{ m: "x" }] }, "2026-11-08": 3 }, hdays: { "2026-11-07": {} }, late: { "2026-11-06": { r: [{ m: 0, h: 0 }] } } })); try { window.__sk.home(); const s = window.__sk.load(); return !!document.getElementById("go-d") && !Object.keys(s.days).length && !Object.keys(s.hdays).length && !!s.late["2026-11-06"]; } catch (e) { return false; } }, KEY));
    await p.close(); }

  // スマホ幅 320px・押せる所の大きさ
  { const p = await newPage({ viewport: { width: 320, height: 640 } }); await closeHow(p);
    const over = async () => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const small = async () => p.evaluate(() => [...document.querySelectorAll("button,a,input")].filter((b) => { const r = b.getBoundingClientRect(); return r.width && r.height && r.height < 44 && !b.closest(".a11y-dlg") && getComputedStyle(b).visibility !== "hidden"; }).map((b) => b.id || b.textContent.trim().slice(0, 10)));
    const o1 = await over(), s1b = await small();
    await p.click("#go-h");
    const o2 = await over(), s2 = await small();
    await answer(p, true);
    const o3 = await over(), s3 = await small();
    await p.evaluate(() => window.__sk.home()); await p.click("#go-dex");
    const o4 = await over();
    check("幅320pxでも横にはみ出さない（ホーム・上級の3枚・答えのあと・めやす帳）", !o1 && !o2 && !o3 && !o4);
    check("押せる所は高さ44px以上（ホーム・遊ぶ画面・答えのあと）", !s1b.length && !s2.length && !s3.length, JSON.stringify([s1b, s2, s3]));
    await p.close(); }

  // 引き継ぎコード（shared-workflows template/qa/transfer-check.mjs）
  { const sample = { [KEY]: JSON.stringify({ v: 1, tut: true, days: { "2026-11-07": { r: [{ m: 0, h: 0 }] } }, hdays: {}, late: {}, seen: { 0: 1, 5: 2 }, one: { 0: 1 }, miss: { 5: 3 }, fix: {}, ebest: 4, runs: {}, ach: {}, kofi: {}, t: 1 }) };
    await checkTransfer({ browser, url, game: "atsusa-shisu", sample, check, open: async (page) => { await page.evaluate(() => { const d = document.getElementById("howto"); if (d.open) d.close(); }); } }); }
} catch (e) {
  check("QA の操作が最後まで完了する", false, e.message.split("\n")[0]);
} finally {
  if (browser) await browser.close();
}
check("画面のエラーが無い", errors.length === 0, errors.slice(0, 3).join(" | "));
{ // 見やすさ・読みやすさ・偏り（shared-workflows template/qa/a11y.mjs の写し）
  const a = spawnSync(process.execPath, [path.join(root, "qa", "a11y.mjs")], { encoding: "utf8", env: process.env });
  check("見やすさ・読みやすさの検査（qa/a11y.mjs。中身は qa-report/a11y.md）", a.status === 0, (a.stdout.match(/^- ❌.*$/gm) || []).join(" / ") || (a.status ? a.stderr.slice(-300) : ""));
}

const ng = results.filter((r) => !r.ok);
const md = `# 暑さ指数よみ QA\n\n${results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `（${r.detail}）` : ""}`).join("\n")}\n\n${ng.length ? `❌ ${ng.length}件` : `✅ ${results.length}項目すべて通過`}\n`;
mkdirSync(path.join(root, "qa-report"), { recursive: true });
writeFileSync(path.join(root, "qa-report/report.md"), md);
console.log(md);
process.exit(ng.length ? 1 : 0);

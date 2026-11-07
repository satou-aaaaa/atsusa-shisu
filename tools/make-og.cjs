// SNS に貼ったときの絵 og.png（1200×630）を作る。今日の問題（答え）は入れない。見本はデータに無い作りの場面1つと、答えを伏せた2つのボタンだけ。
// 使い方: node tools/make-og.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(`<body style="margin:0;width:1200px;height:630px;background:#f6efe7;font-family:'Noto Sans CJK JP',sans-serif;color:#1c2530;display:flex;align-items:center;justify-content:center;gap:60px">
    <div style="width:600px;display:flex;flex-direction:column;gap:20px"><div style="background:#fff;border:3px solid #4a5664;border-radius:18px;padding:26px;box-shadow:0 6px 0 #ddcbb8;font-size:40px;font-weight:800;line-height:1.5">暑さ指数27の日、<br>休まず草野球を3時間。<br>よい？ よくない？</div>
    <div style="display:flex;gap:20px"><div style="flex:1;background:#fff;border:3px solid #4a5664;border-radius:18px;padding:22px;text-align:center;font-size:40px;font-weight:800">○ よい</div><div style="flex:1;background:#fff;border:3px solid #4a5664;border-radius:18px;padding:22px;text-align:center;font-size:40px;font-weight:800">✕ よくない</div></div></div>
    <div style="display:flex;flex-direction:column;gap:18px"><div style="font-size:76px;font-weight:800;letter-spacing:6px;line-height:1.25">🌡️<br>暑さ指数<br>よみ</div><div style="font-size:28px;color:#4a5664">環境省の指針で確かめる<br>だれでも同じ1日5問</div></div></body>`);
  await p.screenshot({ path: path.join(__dirname, "..", "og.png") });
  await b.close();
})();

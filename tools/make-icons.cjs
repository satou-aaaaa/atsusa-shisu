// アプリのアイコン（icon-192.png・icon-512.png・icon-512-maskable.png）を作る。maskable は絵を中心から0.75倍にして、丸く切られても欠けないようにする（安全な範囲は中心の直径80%）。朱の地に、白い温度計の絵。
// 使い方: node tools/make-icons.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const [s, name, k] of [[192, "icon-192.png", 1], [512, "icon-512.png", 1], [512, "icon-512-maskable.png", 0.75]]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<body style="margin:0"><svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="#b03c0c"/><g transform="translate(50 50) scale(${k}) translate(-50 -50)">
      <g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M44 62 V24 a6 6 0 0 1 12 0 V62"/><circle cx="50" cy="70" r="11"/>
      <path d="M62 30 H70 M62 40 H70 M62 50 H70"/></g>
      <circle cx="50" cy="70" r="6" fill="#f2c94c"/><rect x="47.5" y="40" width="5" height="30" rx="2.5" fill="#f2c94c"/>
      </g></svg></body>`);
    await p.screenshot({ path: path.join(__dirname, "..", name), clip: { x: 0, y: 0, width: s, height: s } });
  }
  await b.close();
})();

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const output = new URL("../public/assets/equipment/", import.meta.url);
const categories = ["mainGun", "torpedo", "antiAir", "sideGun", "depthCharge", "magazine", "engine", "steering"];
const rarities = ["common", "purple", "gold", "redGold"];
const codes = {
  mainGun: ["QF 4.7 IX", "12.7 C", "5/38 MK38", "4.5 RP10"],
  torpedo: ["MK IX", "G7A T1", "MK15 M3", "TYPE 93"],
  antiAir: ["20 OER", "2PDR VIII", "40 MK I", "40 MK 2"],
  sideGun: ["10.5 C33", "5.25 MK I", "15 C28", "6/47 MK16"],
  depthCharge: ["MK VII", "TYPE 95", "MK 6 K", "HEDGEHOG"],
  magazine: ["QF ROOM", "C34 HOIST", "MK38 DUAL", "ANTI-FLASH"],
  engine: ["PARSONS", "KANPON", "GEARED GE", "WAGNER"],
  steering: ["JKN HYD", "KAGERO", "FLETCHER", "GEARING"],
};
const base = {
  mainGun: '<path class="f" d="M31 52V32L40 24H72L80 32V52Z"/><rect class="d" x="24" y="52" width="65" height="7"/>',
  torpedo: '<circle class="d" cx="22" cy="34" r="10"/><path class="l" d="M15 58H105"/>',
  antiAir: '<circle class="f" cx="60" cy="44" r="15"/><rect class="d" x="41" y="54" width="38" height="6"/>',
  sideGun: '<path class="f" d="M34 51V33L43 26H71L78 33V51Z"/><rect class="d" x="27" y="51" width="59" height="7"/>',
  depthCharge: '<rect class="d" x="22" y="51" width="76" height="7"/>',
  magazine: '<rect class="d" x="17" y="53" width="87" height="7"/><path class="l" d="M96 18V53"/>',
  engine: '<rect class="d" x="17" y="53" width="87" height="7"/><path class="b" d="M15 36H106"/>',
  steering: '<circle class="a" cx="53" cy="36" r="22"/><circle class="d" cx="53" cy="36" r="7"/><path class="f" d="M87 16L103 36L91 59L81 38Z"/>',
};
const repeated = (count, draw) => Array.from({ length: count }, (_, index) => draw(index, count)).join("");
const variant = {
  mainGun: (v) => repeated(v ? 2 : 1, (i, n) => '<path class="b" d="M77 ' + (30 + (i - (n - 1) / 2) * 7) + 'L' + (103 + v * 3) + ' ' + (28 + (i - (n - 1) / 2) * 7 - v) + '"/>'),
  torpedo: (v) => repeated([2, 3, 5, 4][v], (i, n) => '<path class="' + (i % 2 ? "f" : "a") + '" d="M22 ' + (17 + i * 33 / Math.max(1, n - 1)) + 'H90L' + (103 + v * 2) + ' ' + (20 + i * 33 / Math.max(1, n - 1)) + 'L90 ' + (23 + i * 33 / Math.max(1, n - 1)) + 'H22Z"/>'),
  antiAir: (v) => repeated([1, 8, 2, 4][v], (i, n) => '<path class="b" d="M' + (60 + (i - (n - 1) / 2) * (v === 1 ? 3 : 6)) + ' 40L' + (68 + (i - (n - 1) / 2) * (v === 1 ? 3 : 6)) + ' 13"/>') + (v === 3 ? '<circle class="a" cx="88" cy="26" r="7"/>' : ""),
  sideGun: (v) => repeated([2, 2, 2, 3][v], (i, n) => '<path class="b" d="M75 ' + (31 + (i - (n - 1) / 2) * 6) + 'L' + (101 + v * 3) + ' ' + (29 + (i - (n - 1) / 2) * 6) + '"/>'),
  depthCharge: (v) => v === 3
    ? repeated(12, (i) => '<path class="b" d="M' + (43 + i % 4 * 10) + ' 48L' + (32 + i % 4 * 17) + ' ' + (13 + Math.floor(i / 4) * 5) + '"/>')
    : repeated(3 + v, (i, n) => '<circle class="' + (i % 2 ? "a" : "f") + '" cx="' + (31 + i * 57 / Math.max(1, n - 1)) + '" cy="' + (34 - i % 2 * 6) + '" r="' + (7 + v) + '"/>'),
  magazine: (v) => repeated(3 + v, (i) => '<path class="' + (i % 2 ? "a" : "f") + '" d="M' + (21 + i * 14) + ' 52V27L' + (26 + i * 14) + ' 18L' + (31 + i * 14) + ' 27V52Z"/>'),
  engine: (v) => repeated(3 + v, (i, n) => '<circle class="' + (i % 2 ? "a" : "f") + '" cx="' + (31 + i * 58 / Math.max(1, n - 1)) + '" cy="36" r="' + (12 - i * .6) + '"/><path class="l" d="M' + (31 + i * 58 / Math.max(1, n - 1)) + ' 24V48"/>'),
  steering: (v) => repeated(4 + v, (i, n) => { const a = i * Math.PI * 2 / n; return '<path class="l" d="M53 36L' + (53 + Math.cos(a) * 20) + ' ' + (36 + Math.sin(a) * 20) + '"/>'; }) + (v > 1 ? '<path class="b" d="M72 36H91"/>' : ""),
};
const svg = (category, rarity, v) => [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" shape-rendering="crispEdges" data-equipment-id="' + category + "-" + rarity + '">',
  '<title>' + category + "-" + rarity + '</title><style>.bg{fill:#071b22}.g{stroke:#163840}.l{fill:none;stroke:#73999c;stroke-width:2}.f{fill:#829b97;stroke:#c1d4ca;stroke-width:1.5}.a{fill:#4f858b;stroke:#a8d0c5;stroke-width:1.5}.d{fill:#20383d;stroke:#73999c;stroke-width:1.5}.b{fill:none;stroke:#d0ddd5;stroke-width:3}.t{fill:#9bc1bc;font:7px monospace;letter-spacing:.8px}</style>',
  '<rect class="bg" width="120" height="80"/><path class="g" d="M0 16H120M0 32H120M0 48H120M0 64H120M20 0V80M40 0V80M60 0V80M80 0V80M100 0V80"/>',
  base[category] + variant[category](v),
  '<path class="l" d="M7 66H113"/><text class="t" x="8" y="76">' + codes[category][v] + "</text></svg>",
].join("");
await mkdir(output, { recursive: true });
for (const category of categories) for (const [v, rarity] of rarities.entries()) {
  await writeFile(join(output.pathname, category + "-" + rarity + ".svg"), svg(category, rarity, v), "utf8");
}
console.log("Generated " + categories.length * rarities.length + " equipment SVGs");

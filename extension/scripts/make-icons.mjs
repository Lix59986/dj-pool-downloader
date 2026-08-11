// Генерация простых иконок расширения (синий квадрат с белым "DJ").
// Запуск: node scripts/make-icons.mjs
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BG = [26, 115, 232, 255];
const FG = [255, 255, 255, 255];

function inRoundedRect(x, y, size, r) {
  const min = r, max = size - r;
  const cx = Math.min(max, Math.max(min, x));
  const cy = Math.min(max, Math.max(min, y));
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r || (x >= min && x <= max) || (y >= min && y <= max);
}

function drawText(png, size) {
  // Простейший точечный шрифт 3x5 для букв D и J
  const glyphs = {
    D: [
      "1110",
      "1001",
      "1001",
      "1001",
      "1110",
    ],
    J: [
      "0001",
      "0001",
      "0001",
      "1001",
      "0110",
    ],
  };
  const cell = Math.floor(size * 0.055);
  const spacing = cell;
  const text = ["D", "J"];
  const textW = (text.length * 4 + (text.length - 1)) * cell;
  const x0 = Math.floor((size - textW) / 2);
  const y0 = Math.floor((size - 5 * cell) / 2);
  text.forEach((ch, ti) => {
    const g = glyphs[ch];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 4; c++) {
        if (g[r][c] === "1") {
          for (let dy = 0; dy < cell; dy++) {
            for (let dx = 0; dx < cell; dx++) {
              const px = x0 + (ti * 4 + ti) * cell + c * cell + dx;
              const py = y0 + r * cell + dy;
              if (px >= 0 && px < size && py >= 0 && py < size) {
                const idx = (py * size + px) << 2;
                png.data[idx] = FG[0];
                png.data[idx + 1] = FG[1];
                png.data[idx + 2] = FG[2];
                png.data[idx + 3] = FG[3];
              }
            }
          }
        }
      }
    }
  });
}

function makeIcon(size) {
  const png = new PNG({ width: size, height: size });
  const r = size * 0.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) << 2;
      if (inRoundedRect(x, y, size, r)) {
        png.data[idx] = BG[0];
        png.data[idx + 1] = BG[1];
        png.data[idx + 2] = BG[2];
        png.data[idx + 3] = BG[3];
      } else {
        png.data[idx + 3] = 0;
      }
    }
  }
  drawText(png, size);
  return PNG.sync.write(png);
}

const out = join(process.cwd(), "public", "icons");
mkdirSync(out, { recursive: true });
for (const size of [16, 48, 128]) {
  const file = join(out, `icon${size}.png`);
  writeFileSync(file, makeIcon(size));
  console.log("written", file);
}

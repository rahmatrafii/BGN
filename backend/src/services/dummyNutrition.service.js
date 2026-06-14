"use strict";

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const { prisma } = require("../config/database");
const { getRedis } = require("../config/redis");
const { hitungZScore, klasifikasiStatusGizi } = require("./zscore.service");
const { generateNamaPenerima } = require("./namaGenerator");
const { encryptText, hashIndex, maskNik } = require("../utils/encryption");

const JOB_LOCK_KEY = "job:dummy-nutrition-daily";
const TZ = "Asia/Jakarta";
const WEEKDAY_KEYS = ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"];

dayjs.extend(utc);
dayjs.extend(timezone);

function food(name, category, energyKkal, proteinG, fatG, carbsG, fiberG, sodiumMg) {
  return { name, category, energyKkal, proteinG, fatG, carbsG, fiberG, sodiumMg };
}

// 100 bahan dasar (acuan isi piringku: kombinasi karbo, protein, sayur, buah, pelengkap).
const BASE_INGREDIENT_CATALOG = [
  // Karbohidrat (20)
  food("Nasi Putih", "karbo", 175, 3.4, 0.4, 39.8, 0.3, 2),
  food("Nasi Merah", "karbo", 170, 3.8, 1.0, 35.2, 1.8, 3),
  food("Nasi Jagung", "karbo", 162, 3.6, 0.9, 34.5, 2.1, 6),
  food("Nasi Hanjeli", "karbo", 164, 4.0, 1.3, 33.1, 2.8, 5),
  food("Kentang Rebus", "karbo", 87, 2.0, 0.1, 20.1, 1.8, 7),
  food("Ubi Jalar Kukus", "karbo", 111, 1.6, 0.1, 26.2, 3.0, 55),
  food("Singkong Rebus", "karbo", 146, 1.4, 0.3, 34.0, 1.8, 14),
  food("Talas Kukus", "karbo", 142, 1.5, 0.2, 34.6, 4.1, 11),
  food("Jagung Rebus", "karbo", 144, 4.1, 1.3, 31.0, 2.9, 15),
  food("Mie Gandum Rebus", "karbo", 138, 5.6, 1.8, 24.8, 2.3, 120),
  food("Oatmeal", "karbo", 118, 4.2, 2.3, 21.5, 3.8, 49),
  food("Roti Gandum", "karbo", 128, 5.1, 2.0, 22.1, 3.2, 215),
  food("Bubur Beras", "karbo", 84, 1.7, 0.2, 18.8, 0.2, 30),
  food("Beras Hitam", "karbo", 168, 4.7, 1.5, 34.3, 2.0, 5),
  food("Sagu", "karbo", 160, 0.2, 0.1, 39.0, 0.5, 1),
  food("Kwetiau Rebus", "karbo", 150, 2.8, 0.6, 33.0, 1.1, 90),
  food("Bihun Jagung", "karbo", 148, 2.2, 0.4, 34.7, 1.0, 78),
  food("Macaroni Rebus", "karbo", 131, 5.0, 1.1, 25.0, 1.3, 6),
  food("Lontong", "karbo", 137, 2.1, 0.3, 30.8, 0.8, 3),
  food("Beras Shirataki", "karbo", 35, 0.4, 0.1, 8.4, 2.1, 8),

  // Protein hewani (20)
  food("Dada Ayam Panggang", "protein_hewani", 165, 31.0, 3.6, 0, 0, 74),
  food("Paha Ayam Rebus", "protein_hewani", 180, 27.0, 8.0, 0, 0, 88),
  food("Ikan Kembung", "protein_hewani", 167, 21.4, 8.2, 0, 0, 90),
  food("Ikan Tuna", "protein_hewani", 145, 23.5, 4.9, 0, 0, 37),
  food("Ikan Salmon", "protein_hewani", 206, 22.1, 12.4, 0, 0, 59),
  food("Ikan Lele", "protein_hewani", 152, 18.8, 7.2, 0, 0, 52),
  food("Ikan Nila", "protein_hewani", 128, 26.2, 2.7, 0, 0, 56),
  food("Udang Kukus", "protein_hewani", 99, 24.0, 0.3, 0.2, 0, 111),
  food("Telur Ayam Rebus", "protein_hewani", 78, 6.3, 5.3, 0.6, 0, 62),
  food("Telur Puyuh Rebus", "protein_hewani", 74, 6.0, 5.0, 0.4, 0, 45),
  food("Daging Sapi Tanpa Lemak", "protein_hewani", 187, 26.0, 9.0, 0, 0, 55),
  food("Daging Kambing Tanpa Lemak", "protein_hewani", 170, 25.0, 7.0, 0, 0, 75),
  food("Hati Ayam", "protein_hewani", 167, 24.5, 5.9, 1.0, 0, 77),
  food("Ati Sapi", "protein_hewani", 175, 27.0, 6.5, 3.8, 0, 69),
  food("Sarden", "protein_hewani", 140, 17.0, 7.0, 2.2, 0.3, 330),
  food("Bandeng", "protein_hewani", 129, 20.0, 4.8, 0, 0, 64),
  food("Tongkol", "protein_hewani", 135, 24.0, 3.5, 0, 0, 73),
  food("Kerang Hijau", "protein_hewani", 124, 20.0, 3.2, 4.7, 0.1, 286),
  food("Cumi Kukus", "protein_hewani", 92, 15.6, 1.4, 3.1, 0, 44),
  food("Yogurt Yunani Plain", "protein_hewani", 97, 9.0, 4.0, 3.6, 0, 36),

  // Protein nabati (15)
  food("Tempe", "protein_nabati", 150, 12.0, 7.9, 8.7, 1.4, 9),
  food("Tahu Putih", "protein_nabati", 80, 8.0, 4.4, 1.5, 0.3, 7),
  food("Kacang Merah Rebus", "protein_nabati", 127, 8.7, 0.5, 22.8, 6.4, 2),
  food("Kacang Hitam Rebus", "protein_nabati", 132, 8.9, 0.6, 23.7, 8.7, 1),
  food("Kacang Hijau Rebus", "protein_nabati", 105, 7.0, 0.5, 19.2, 4.7, 15),
  food("Kacang Polong Rebus", "protein_nabati", 84, 5.4, 0.4, 15.0, 5.5, 3),
  food("Edamame Rebus", "protein_nabati", 121, 11.9, 5.2, 8.9, 5.2, 6),
  food("Oncom", "protein_nabati", 142, 10.5, 7.2, 9.0, 1.0, 8),
  food("Kacang Tanah Rebus", "protein_nabati", 164, 7.0, 13.0, 5.5, 3.0, 6),
  food("Selai Kacang Alami", "protein_nabati", 188, 7.1, 16.1, 6.9, 2.4, 75),
  food("Biji Wijen", "protein_nabati", 180, 5.8, 15.2, 7.7, 3.1, 8),
  food("Biji Chia", "protein_nabati", 170, 5.7, 10.7, 14.7, 11.2, 6),
  food("Biji Labu", "protein_nabati", 170, 8.2, 13.5, 4.5, 2.0, 7),
  food("Lentil Rebus", "protein_nabati", 116, 9.0, 0.4, 20.1, 7.9, 2),
  food("Kedelai Rebus", "protein_nabati", 173, 16.6, 9.0, 9.9, 6.0, 2),

  // Sayuran (20)
  food("Bayam", "sayur", 23, 2.9, 0.4, 3.6, 2.2, 79),
  food("Kangkung", "sayur", 19, 2.6, 0.2, 3.1, 2.1, 45),
  food("Sawi Hijau", "sayur", 27, 2.9, 0.4, 4.7, 2.5, 65),
  food("Sawi Putih", "sayur", 16, 1.2, 0.2, 3.2, 1.2, 9),
  food("Brokoli", "sayur", 34, 2.8, 0.4, 6.6, 2.6, 33),
  food("Kembang Kol", "sayur", 25, 1.9, 0.3, 5.0, 2.0, 30),
  food("Wortel", "sayur", 41, 0.9, 0.2, 9.5, 2.7, 69),
  food("Buncis", "sayur", 31, 1.8, 0.1, 7.0, 2.7, 6),
  food("Labu Siam", "sayur", 19, 0.8, 0.1, 4.5, 1.7, 2),
  food("Labu Kuning", "sayur", 45, 1.0, 0.1, 11.7, 2.0, 1),
  food("Terong", "sayur", 25, 1.0, 0.2, 5.9, 3.0, 2),
  food("Pare", "sayur", 17, 1.0, 0.2, 3.7, 2.8, 6),
  food("Tomat", "sayur", 18, 0.9, 0.2, 3.9, 1.2, 5),
  food("Mentimun", "sayur", 15, 0.7, 0.1, 3.6, 0.5, 2),
  food("Paprika Merah", "sayur", 31, 1.0, 0.3, 6.0, 2.1, 4),
  food("Daun Kelor", "sayur", 64, 9.4, 1.4, 8.3, 2.0, 9),
  food("Kol", "sayur", 25, 1.3, 0.1, 5.8, 2.5, 18),
  food("Tauge", "sayur", 30, 3.0, 0.2, 6.2, 1.8, 6),
  food("Daun Singkong", "sayur", 37, 3.7, 1.2, 6.1, 2.5, 7),
  food("Oyong", "sayur", 20, 0.9, 0.2, 4.3, 1.5, 4),

  // Buah (15)
  food("Pisang", "buah", 105, 1.3, 0.4, 27.0, 3.1, 1),
  food("Pepaya", "buah", 55, 0.9, 0.3, 14.0, 2.5, 8),
  food("Jeruk", "buah", 62, 1.2, 0.2, 15.4, 3.1, 0),
  food("Apel", "buah", 80, 0.3, 0.2, 21.0, 3.8, 2),
  food("Pir", "buah", 57, 0.4, 0.1, 15.2, 3.1, 1),
  food("Semangka", "buah", 30, 0.6, 0.2, 7.6, 0.4, 1),
  food("Melon", "buah", 34, 0.8, 0.2, 8.2, 0.9, 16),
  food("Mangga", "buah", 60, 0.8, 0.4, 15.0, 1.6, 1),
  food("Nanas", "buah", 50, 0.5, 0.1, 13.1, 1.4, 1),
  food("Jambu Biji", "buah", 68, 2.6, 1.0, 14.3, 5.4, 2),
  food("Alpukat", "buah", 160, 2.0, 14.7, 8.5, 6.7, 7),
  food("Salak", "buah", 82, 0.4, 0.4, 22.8, 2.6, 5),
  food("Naga Merah", "buah", 57, 1.2, 0.4, 13.0, 3.0, 2),
  food("Anggur", "buah", 69, 0.7, 0.2, 18.1, 0.9, 2),
  food("Kurma", "buah", 133, 1.1, 0.2, 35.0, 3.2, 2),

  // Pelengkap (10)
  food("Susu UHT Rendah Lemak", "pelengkap", 90, 6.0, 3.0, 9.0, 0, 85),
  food("Yogurt Plain", "pelengkap", 95, 5.2, 3.3, 11.5, 0, 50),
  food("Keju Rendah Lemak", "pelengkap", 98, 6.2, 7.1, 1.4, 0, 180),
  food("Minyak Zaitun", "pelengkap", 119, 0, 13.5, 0, 0, 0),
  food("Minyak Kanola", "pelengkap", 120, 0, 13.6, 0, 0, 0),
  food("Kacang Almond", "pelengkap", 164, 6.0, 14.2, 6.1, 3.5, 0),
  food("Kacang Mete", "pelengkap", 157, 5.2, 12.4, 8.6, 1.0, 3),
  food("Biji Bunga Matahari", "pelengkap", 163, 5.5, 14.1, 6.8, 2.8, 2),
  food("Wijen Sangrai", "pelengkap", 172, 5.6, 14.8, 7.0, 2.7, 6),
  food("Madu Murni", "pelengkap", 64, 0.1, 0, 17.3, 0.1, 1),
];

const INGREDIENT_BY_CATEGORY = BASE_INGREDIENT_CATALOG.reduce((acc, item) => {
  const key = item.category;
  if (!acc[key]) acc[key] = [];
  acc[key].push(item);
  return acc;
}, {});

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sampleWithoutReplacement(arr, count) {
  const copy = arr.slice();
  const out = [];
  const n = Math.min(count, copy.length);
  for (let i = 0; i < n; i++) {
    const idx = randInt(0, copy.length - 1);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function withPortion(item, grams) {
  const ratio = grams / 100;
  return {
    name: item.name,
    grams: round2(grams),
    energyKkal: round2(item.energyKkal * ratio),
    proteinG: round2(item.proteinG * ratio),
    fatG: round2(item.fatG * ratio),
    carbsG: round2(item.carbsG * ratio),
    fiberG: round2(item.fiberG * ratio),
    sodiumMg: round2(item.sodiumMg * ratio),
  };
}

function createMenuTemplate(index) {
  // Acuan Isi Piringku: 50% sayur+buah, 50% karbo+protein.
  const carb = INGREDIENT_BY_CATEGORY.karbo[randInt(0, INGREDIENT_BY_CATEGORY.karbo.length - 1)];
  const proteinAnimal = INGREDIENT_BY_CATEGORY.protein_hewani[randInt(0, INGREDIENT_BY_CATEGORY.protein_hewani.length - 1)];
  const proteinPlant = INGREDIENT_BY_CATEGORY.protein_nabati[randInt(0, INGREDIENT_BY_CATEGORY.protein_nabati.length - 1)];
  const vegCount = randInt(1, 2);
  const vegItems = sampleWithoutReplacement(INGREDIENT_BY_CATEGORY.sayur, vegCount);
  const fruit = INGREDIENT_BY_CATEGORY.buah[randInt(0, INGREDIENT_BY_CATEGORY.buah.length - 1)];
  const extra = Math.random() < 0.75
    ? INGREDIENT_BY_CATEGORY.pelengkap[randInt(0, INGREDIENT_BY_CATEGORY.pelengkap.length - 1)]
    : null;

  const items = [
    withPortion(carb, randInt(100, 170)),
    withPortion(proteinAnimal, randInt(45, 90)),
    withPortion(proteinPlant, randInt(35, 80)),
    ...vegItems.map((v) => withPortion(v, randInt(50, 110))),
    withPortion(fruit, randInt(60, 130)),
  ];
  if (extra) items.push(withPortion(extra, randInt(10, 40)));

  const total = items.reduce(
    (acc, cur) => {
      acc.energyKkal += cur.energyKkal;
      acc.proteinG += cur.proteinG;
      acc.fatG += cur.fatG;
      acc.carbsG += cur.carbsG;
      acc.fiberG += cur.fiberG;
      acc.sodiumMg += cur.sodiumMg;
      return acc;
    },
    { energyKkal: 0, proteinG: 0, fatG: 0, carbsG: 0, fiberG: 0, sodiumMg: 0 }
  );
  return {
    code: "MENU-" + String(index + 1).padStart(4, "0"),
    title: items.map((x) => x.name).slice(0, 4).join(" + "),
    items,
    totalNutrition: {
      energyKkal: round2(total.energyKkal),
      proteinG: round2(total.proteinG),
      fatG: round2(total.fatG),
      carbsG: round2(total.carbsG),
      fiberG: round2(total.fiberG),
      sodiumMg: round2(total.sodiumMg),
    },
  };
}

function buildMenuPool(totalMenus) {
  const pool = [];
  for (let i = 0; i < totalMenus; i++) {
    pool.push(createMenuTemplate(i));
  }
  return pool;
}

function weekdayIndexFromDate(date) {
  const d = dayjs(date).day();
  // dayjs: 0 Minggu ... 6 Sabtu
  if (d === 0) return 6;
  return d - 1;
}

function hashString(text) {
  let h = 0;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function deterministicPickMenus(seed, pool, minCount, maxCount) {
  const count = Math.max(minCount, Math.min(maxCount, (seed % maxCount) + 1));
  const copy = pool.slice();
  const out = [];
  let localSeed = seed || 1;
  for (let i = 0; i < count && copy.length; i++) {
    localSeed = (localSeed * 1664525 + 1013904223) >>> 0;
    const idx = localSeed % copy.length;
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

function buildWeeklyMenuPlanForSppg(sppgId, weekKey, menuPool) {
  const shortPool = menuPool.slice(0, 300);
  const weekly = {};
  WEEKDAY_KEYS.forEach((dayKey, idx) => {
    const seed = hashString(sppgId + "|" + weekKey + "|" + dayKey + "|" + idx);
    const menus = deterministicPickMenus(seed, shortPool, 1, 10);
    const nutrition = menus.reduce(
      (acc, m) => {
        acc.energyKkal += m.totalNutrition.energyKkal;
        acc.proteinG += m.totalNutrition.proteinG;
        acc.fatG += m.totalNutrition.fatG;
        acc.carbsG += m.totalNutrition.carbsG;
        acc.fiberG += m.totalNutrition.fiberG;
        acc.sodiumMg += m.totalNutrition.sodiumMg;
        return acc;
      },
      { energyKkal: 0, proteinG: 0, fatG: 0, carbsG: 0, fiberG: 0, sodiumMg: 0 }
    );
    weekly[dayKey] = {
      menuCount: menus.length,
      menus: menus.map((m) => ({
        code: m.code,
        title: m.title,
        totalNutrition: m.totalNutrition,
      })),
      totalNutrition: {
        energyKkal: round2(nutrition.energyKkal),
        proteinG: round2(nutrition.proteinG),
        fatG: round2(nutrition.fatG),
        carbsG: round2(nutrition.carbsG),
        fiberG: round2(nutrition.fiberG),
        sodiumMg: round2(nutrition.sodiumMg),
      },
    };
  });
  return weekly;
}

function distributeByCapacity(sppgs, totalRecords) {
  const active = sppgs.filter((s) => Number(s.kapasitasPorsiPerHari) > 0);
  const totalCapacity = active.reduce((sum, s) => sum + Math.max(1, Number(s.kapasitasPorsiPerHari || 1)), 0);
  const map = new Map();
  if (!active.length) return map;
  let assigned = 0;
  for (const s of active) {
    const raw = (Math.max(1, Number(s.kapasitasPorsiPerHari || 1)) / totalCapacity) * totalRecords;
    const base = Math.max(1, Math.floor(raw));
    const capped = Math.min(base, Math.max(1, Number(s.kapasitasPorsiPerHari || 1)));
    map.set(s.id, capped);
    assigned += capped;
  }
  // distribute remaining slots while honoring capacity.
  let loops = 0;
  while (assigned < totalRecords && loops < totalRecords * 2) {
    loops++;
    const s = active[randInt(0, active.length - 1)];
    const cap = Math.max(1, Number(s.kapasitasPorsiPerHari || 1));
    const cur = map.get(s.id) || 0;
    if (cur >= cap) continue;
    map.set(s.id, cur + 1);
    assigned++;
  }
  return map;
}

// Distribusi proporsi kategori penerima sesuai demografi SPPG tipikal Indonesia.
// Sedikit di-variasi per SPPG + tanggal sehingga tidak monoton.
function buildCategoryAllocation(sppg, date, total) {
  const seed = (sppg.id || "") + "|" + dayjs(date).tz(TZ).format("YYYY-MM-DD");
  const rng = (() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return () => {
      h = (h * 1664525 + 1013904223) >>> 0;
      return (h & 0xffffffff) / 0x100000000;
    };
  })();

  // Base proporsi (total = 1.0): PESERTA_DIDIK 55%, BALITA 25%, IBU_HAMIL 10%, IBU_MENYUSUI 10%.
  // Tambah jitter Â±5% per kategori, lalu normalize.
  const base = { PESERTA_DIDIK: 0.55, BALITA: 0.25, IBU_HAMIL: 0.1, IBU_MENYUSUI: 0.1 };
  const jitter = () => (rng() - 0.5) * 0.1;
  const raw = {
    PESERTA_DIDIK: Math.max(0.2, base.PESERTA_DIDIK + jitter()),
    BALITA: Math.max(0.1, base.BALITA + jitter()),
    IBU_HAMIL: Math.max(0.05, base.IBU_HAMIL + jitter()),
    IBU_MENYUSUI: Math.max(0.05, base.IBU_MENYUSUI + jitter()),
  };
  const sumR = raw.PESERTA_DIDIK + raw.BALITA + raw.IBU_HAMIL + raw.IBU_MENYUSUI;
  const norm = {
    PESERTA_DIDIK: raw.PESERTA_DIDIK / sumR,
    BALITA: raw.BALITA / sumR,
    IBU_HAMIL: raw.IBU_HAMIL / sumR,
    IBU_MENYUSUI: raw.IBU_MENYUSUI / sumR,
  };
  // Largest-remainder rounding supaya total pas = total.
  const rawCounts = {
    PESERTA_DIDIK: norm.PESERTA_DIDIK * total,
    BALITA: norm.BALITA * total,
    IBU_HAMIL: norm.IBU_HAMIL * total,
    IBU_MENYUSUI: norm.IBU_MENYUSUI * total,
  };
  const floors = {
    PESERTA_DIDIK: Math.floor(rawCounts.PESERTA_DIDIK),
    BALITA: Math.floor(rawCounts.BALITA),
    IBU_HAMIL: Math.floor(rawCounts.IBU_HAMIL),
    IBU_MENYUSUI: Math.floor(rawCounts.IBU_MENYUSUI),
  };
  let sisa = total - (floors.PESERTA_DIDIK + floors.BALITA + floors.IBU_HAMIL + floors.IBU_MENYUSUI);
  const order = Object.keys(floors).sort((a, b) => rawCounts[b] - floors[b] - (rawCounts[a] - floors[a]));
  for (let i = 0; i < sisa; i++) floors[order[i % order.length]] += 1;
  return floors;
}

function computeDailyTotalPortionsFromCapacity(sppgs, mode) {
  const totalCapacity = sppgs.reduce((sum, s) => sum + Math.max(1, Number(s.kapasitasPorsiPerHari || 1)), 0);
  if (totalCapacity <= 0) return 1000;
  if (mode === "absurdly_high") {
    // Mode demo: chart besar, util 35% - 90% kapasitas nasional.
    // Dipakai oleh tombol "Trigger Cron (Semua)" di UI untuk visualisasi dashboard.
    const ratio = randFloat(0.35, 0.9);
    return Math.max(200, Math.round(totalCapacity * ratio));
  }
  // Mode realistic (default cron harian): nasional 1.000 - 1.000.000 porsi/hari
  // (util < 1% dari total kapasitas, terdistribusi proporsional ke kapasitas SPPG).
  // 3.354 SPPG x 100-300 rata-rata -> 335k - 1jt/hari, masuk akal.
  const minTarget = 1000;
  const maxTarget = 1000000;
  return minTarget + Math.floor(Math.random() * (maxTarget - minTarget));
}

function estimateAnthropometry(recipient, menu) {
  const kategori = recipient.kategori;
  if (kategori === "BALITA") {
    const usiaBulan = randInt(8, 59);
    return {
      usiaBulan,
      beratBadanKg: round2(randFloat(7.2, 18.5)),
      tinggiBadanCm: round2(randFloat(67, 112)),
      lilaCm: round2(randFloat(12.5, 17.5)),
      catatan: "Menu " + menu.code + " (" + menu.items.length + " item) diberikan sesuai porsi balita.",
    };
  }
  if (kategori === "PESERTA_DIDIK") {
    const usiaBulan = randInt(72, 216);
    return {
      usiaBulan,
      beratBadanKg: round2(randFloat(17, 60)),
      tinggiBadanCm: round2(randFloat(110, 170)),
      lilaCm: round2(randFloat(16, 27)),
      catatan: "Menu " + menu.code + " disesuaikan kebutuhan energi peserta didik.",
    };
  }
  const usiaBulan = randInt(180, 540);
  return {
    usiaBulan,
    beratBadanKg: round2(randFloat(42, 78)),
    tinggiBadanCm: round2(randFloat(145, 175)),
    lilaCm: round2(randFloat(20.5, 33)),
    catatan: "Menu " + menu.code + " dipakai untuk pemantauan kelompok ibu.",
  };
}

function chooseStatusFromMenu(menu) {
  const energy = menu.totalNutrition.energyKkal;
  if (energy < 400) return "GIZI_KURANG";
  if (energy > 950) return "GIZI_LEBIH";
  return "GIZI_BAIK";
}

async function withJobLock(fn, options = {}) {
  // Untuk Vercel Cron, skip Redis lock: Vercel Cron adalah sumber tunggal harian,
  // dan Hobby plan tidak menjamin Redis lock atomik lintas cold-start.
  if (options.skipLock) {
    return fn();
  }
  try {
    const redis = getRedis();
    const lockValue = String(Date.now());
    const ok = await redis.set(JOB_LOCK_KEY, lockValue, "NX", "EX", 60 * 20);
    if (!ok) return { success: true, skipped: true, message: "Generator dummy sedang berjalan." };
    try {
      return await fn();
    } finally {
      try {
        const cur = await redis.get(JOB_LOCK_KEY);
        if (cur === lockValue) await redis.del(JOB_LOCK_KEY);
      } catch (_) {}
    }
  } catch (_) {
    // Fallback local/no-redis: tetap jalankan agar ingest tidak terblokir.
    return fn();
  }
}

// NIK sintetis 16 digit deterministik dari seed (untuk data dummy penerima).
function generateNikDummy(seed) {
  let h = 0;
  const text = String(seed);
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  let nik = "";
  for (let i = 0; i < 16; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    nik += String(h % 10);
  }
  return nik;
}

const KATEGORI_PENERIMA = ["PESERTA_DIDIK", "BALITA", "IBU_HAMIL", "IBU_MENYUSUI"];

function tanggalLahirUntukKategori(kategori, n) {
  if (kategori === "BALITA") return dayjs().subtract(6 + (n % 52), "month").toDate();
  if (kategori === "PESERTA_DIDIK") return dayjs().subtract(7 + (n % 11), "year").toDate();
  return dayjs().subtract(20 + (n % 18), "year").toDate(); // ibu hamil/menyusui
}

/**
 * Pastikan tiap SPPG aktif punya populasi penerima_manfaat yang proporsional dengan
 * kapasitasnya, sehingga data antar-halaman (penerima, distribusi, gizi) berkesinambungan
 * dan SPPG hasil registrasi baru tidak kosong. Idempotent: hanya menambah kekurangan,
 * dibatasi total insert per run agar aman terhadap timeout serverless.
 */
async function ensurePenerimaForActiveSppg(sppgs, maxNewTotal = 500) {
  let createdTotal = 0;
  const buffer = [];
  for (const sppg of sppgs) {
    if (createdTotal >= maxNewTotal) break;
    const cap = Math.max(1, Number(sppg.kapasitasPorsiPerHari || 0));
    // Target populasi hemat: ~15% kapasitas, minimal 12, maksimal 60 per SPPG.
    const target = Math.min(60, Math.max(12, Math.round(cap * 0.15)));
    const existing = await prisma.penerimaManfaat.count({ where: { sppgId: sppg.id } });
    let toCreate = Math.min(target - existing, maxNewTotal - createdTotal);
    if (toCreate <= 0) continue;

    for (let i = 0; i < toCreate; i++) {
      const idx = existing + i;
      // Komposisi kategori: PESERTA_DIDIK 55%, BALITA 25%, IBU_HAMIL 10%, IBU_MENYUSUI 10%.
      const r = idx % 20;
      const kategori = r < 11 ? "PESERTA_DIDIK" : r < 16 ? "BALITA" : r < 18 ? "IBU_HAMIL" : "IBU_MENYUSUI";
      const jenisKelamin =
        kategori === "IBU_HAMIL" || kategori === "IBU_MENYUSUI"
          ? "PEREMPUAN"
          : idx % 2 === 0
          ? "LAKI_LAKI"
          : "PEREMPUAN";
      const nik = generateNikDummy(sppg.id + "|" + idx);
      buffer.push({
        nikEnc: encryptText(nik),
        nikHash: hashIndex(nik),
        nikMasked: maskNik(nik),
        namaLengkap: generateNamaPenerima(sppg.id + "|penerima|" + idx, jenisKelamin),
        tanggalLahir: tanggalLahirUntukKategori(kategori, idx),
        jenisKelamin,
        kategori,
        satuanPendidikan: kategori === "PESERTA_DIDIK" ? "SDN " + ((idx % 12) + 1) : null,
        sppgId: sppg.id,
      });
      createdTotal++;
    }
  }

  // Insert berchunk; skipDuplicates agar aman terhadap tabrakan nikHash unik.
  const chunks = chunk(buffer, 100);
  for (const c of chunks) {
    try {
      await prisma.penerimaManfaat.createMany({ data: c, skipDuplicates: true });
    } catch (err) {
      console.error("[dummy-nutrition] createMany penerima gagal:", err.message);
    }
  }
  return createdTotal;
}

async function runDailyDummyNutrition(options = {}) {
  const trigger = options.trigger || "cron";
  // Vercel Cron path: turunkan default totalMenus ke 500 agar < 5 menit.
  // Trigger manual (klik tombol admin) tetap boleh 1000 sesuai UX awal.
  const isVercelCron = trigger === "vercel_cron" || trigger === "manual_cron";
  const isBackfill = String(trigger).indexOf("backfill") >= 0;
  // Diperkecil agar hemat kuota data-transfer DB (free tier). Sebelumnya 500/1000.
  const defaultMenus = isVercelCron || isBackfill ? 150 : 250;
  const totalMenus = Math.max(80, Math.min(2000, Number(options.totalMenus) || defaultMenus));
  const explicitTotalRecords = Number(options.totalRecords);
  const now = dayjs().tz(TZ);
  const runDate = now.startOf("day").toDate();
  const generatedAt = now.toDate();
  const menuPool = buildMenuPool(totalMenus);
  // Default 3 slice (kemarin / hari ini / besok). Untuk backfill, generate
  // N hari ke belakang (default 30) agar tren dashboard tidak ada hari kosong.
  const backfillDays = Math.max(0, Math.min(60, parseInt(options.backfillDays, 10) || 0));
  const dateSlices = [];
  if (backfillDays > 0) {
    for (let d = backfillDays; d >= -1; d--) {
      const date = now.subtract(d, "day").startOf("day").toDate();
      const key = d === 1 ? "kemarin" : d === 0 ? "hari_ini" : d === -1 ? "besok" : "h" + d;
      dateSlices.push({ key, date });
    }
  } else {
    dateSlices.push(
      { key: "kemarin", date: now.subtract(1, "day").startOf("day").toDate() },
      { key: "hari_ini", date: runDate },
      { key: "besok", date: now.add(1, "day").startOf("day").toDate() }
    );
  }
  const lockOptions = { skipLock: isVercelCron || isBackfill || options.skipLock === true };

  return withJobLock(async () => {
    const sppgsAwal = await prisma.sppg.findMany({
      where: { statusAktif: true },
      select: { id: true, namaSppg: true, kapasitasPorsiPerHari: true },
    });
    // Pastikan populasi penerima proporsional sebelum sampling (data berkesinambungan).
    let penerimaDibuat = 0;
    try {
      penerimaDibuat = await ensurePenerimaForActiveSppg(sppgsAwal);
    } catch (err) {
      console.error("[dummy-nutrition] ensurePenerima gagal:", err.message);
    }

    const [sppgs, recipients, operators, fallbackPetugas] = await Promise.all([
      prisma.sppg.findMany({
        where: { statusAktif: true },
        select: { id: true, namaSppg: true, kapasitasPorsiPerHari: true },
      }),
      prisma.penerimaManfaat.findMany({
        where: { statusAktif: true, sppg: { statusAktif: true } },
        select: { id: true, sppgId: true, kategori: true, jenisKelamin: true },
      }),
      prisma.pengguna.findMany({
        where: { statusAktif: true, peran: "OPERATOR_SPPG", sppgId: { not: null } },
        select: { id: true, sppgId: true },
      }),
      prisma.pengguna.findFirst({
        where: {
          statusAktif: true,
          peran: { in: ["ADMIN", "PENGAWAS_GIZI", "PEJABAT_BGN"] },
        },
        select: { id: true },
      }),
    ]);

    if (!sppgs.length || !recipients.length) {
      return { success: false, message: "Data SPPG/penerima belum tersedia.", trigger };
    }

    const operatorBySppg = new Map(operators.map((o) => [o.sppgId, o.id]));
    const fallbackPetugasId = fallbackPetugas ? fallbackPetugas.id : null;
    if (!fallbackPetugasId && !operatorBySppg.size) {
      return { success: false, message: "Tidak ada petugas aktif untuk membuat data dummy.", trigger };
    }

    const recipientBySppg = new Map();
    for (const rec of recipients) {
      const arr = recipientBySppg.get(rec.sppgId) || [];
      arr.push(rec);
      recipientBySppg.set(rec.sppgId, arr);
    }

    const sppgPool = sppgs;
    const pemantauanRows = [];
    const upsertDistribusi = [];
    const totalPortionsBySlice = {};
    const weekKeys = new Set();

    for (const slice of dateSlices) {
      const weekKey = dayjs(slice.date).tz(TZ).startOf("week").format("YYYY-[W]WW");
      weekKeys.add(weekKey);
      const weekdayIdx = weekdayIndexFromDate(slice.date);
      const weekdayKey = WEEKDAY_KEYS[weekdayIdx];
      const dailyTotalPortions = Number.isFinite(explicitTotalRecords) && explicitTotalRecords > 0
        ? Math.max(50, Math.min(100000, Math.round(explicitTotalRecords)))
        : computeDailyTotalPortionsFromCapacity(sppgPool, options.mode);
      totalPortionsBySlice[slice.key] = dailyTotalPortions;
      const allocation = distributeByCapacity(sppgPool, dailyTotalPortions);

      for (const sppg of sppgPool) {
        const recPool = recipientBySppg.get(sppg.id) || [];
        const target = Math.max(1, allocation.get(sppg.id) || 1);
        const weeklyPlan = buildWeeklyMenuPlanForSppg(sppg.id, weekKey, menuPool);
        const todayPlan = weeklyPlan[weekdayKey];
        const menuSamples = [];
        let totalEnergy = 0;
        // Proporsi kategori penerima realistik per SPPG (bervariasi antar SPPG & tanggal).
        const catAlloc = buildCategoryAllocation(sppg, slice.date, target);
        let porsiPesertaDidik = 0;
        let porsiBalita = 0;
        let porsiIbuHamil = 0;
        let porsiIbuMenyusui = 0;

        // Diperkecil (sebelumnya 15 & 0.25) agar jumlah baris pemantauan hemat kuota.
        const pemantauanTarget = recPool.length ? Math.min(6, Math.max(1, Math.round(target * 0.08))) : 0;
        // Filter penerima sesuai proporsi kategori hari ini agar tidak bias ke PESERTA_DIDIK.
        const recByCategory = (k) => recPool.filter((r) => r.kategori === k);
        const kategoriSampling = [
          { key: "PESERTA_DIDIK", count: Math.max(0, Math.round(catAlloc.PESERTA_DIDIK * 0.08)) },
          { key: "BALITA", count: Math.max(0, Math.round(catAlloc.BALITA * 0.08)) },
          { key: "IBU_HAMIL", count: Math.max(0, Math.round(catAlloc.IBU_HAMIL * 0.08)) },
          { key: "IBU_MENYUSUI", count: Math.max(0, Math.round(catAlloc.IBU_MENYUSUI * 0.08)) },
        ];
        for (let i = 0; i < pemantauanTarget; i++) {
          // Sampling kategori secara round-robin sesuai proporsi.
          let kat = null;
          let rec = null;
          for (const ks of kategoriSampling) {
            if (ks.count <= 0) continue;
            const pool = recByCategory(ks.key);
            if (pool.length) {
              kat = ks.key;
              rec = pool[randInt(0, pool.length - 1)];
              ks.count -= 1;
              break;
            }
          }
          // Fallback jika pool kategori tidak ada.
          if (!rec) rec = recPool[randInt(0, recPool.length - 1)];
          if (!kat) kat = rec.kategori;
          const menuLite = todayPlan.menus[i % todayPlan.menus.length];
          const menu = menuPool.find((m) => m.code === menuLite.code) || menuPool[randInt(0, menuPool.length - 1)];
          const anthropo = estimateAnthropometry({ ...rec, kategori: kat }, menu);
          const z = hitungZScore({
            beratBadanKg: anthropo.beratBadanKg,
            tinggiBadanCm: anthropo.tinggiBadanCm,
            usiaBulan: anthropo.usiaBulan,
            jenisKelamin: rec.jenisKelamin,
            kategori: kat,
          });
          const klas = klasifikasiStatusGizi(z, {
            kategori: kat,
            lilaCm: anthropo.lilaCm,
            beratBadanKg: anthropo.beratBadanKg,
            tinggiBadanCm: anthropo.tinggiBadanCm,
            usiaBulan: anthropo.usiaBulan,
          });
          const preferred = chooseStatusFromMenu(menu);
          const statusGizi = klas.statusGizi === "GIZI_BAIK" ? preferred : klas.statusGizi;
          const petugasId = operatorBySppg.get(sppg.id) || fallbackPetugasId;
          pemantauanRows.push({
            penerimaId: rec.id,
            tanggalPengukuran: slice.date,
            beratBadanKg: anthropo.beratBadanKg,
            tinggiBadanCm: anthropo.tinggiBadanCm,
            lilaCm: anthropo.lilaCm,
            usiaBulan: anthropo.usiaBulan,
            zscoreBbU: z.zscoreBbU,
            zscoreTbU: z.zscoreTbU,
            zscoreBbTb: z.zscoreBbTb,
            statusGizi,
            stunting: klas.stunting,
            petugasId,
            catatan:
              anthropo.catatan +
              " Nutrisi total: " +
              JSON.stringify(menu.totalNutrition) +
              ". Menu: " +
              menu.items.map((x) => x.name).join(", "),
          });
        }

        // Ikat porsi per kategori mengikuti proporsi yang sudah dihitung.
        porsiPesertaDidik = catAlloc.PESERTA_DIDIK;
        porsiBalita = catAlloc.BALITA;
        porsiIbuHamil = catAlloc.IBU_HAMIL;
        porsiIbuMenyusui = catAlloc.IBU_MENYUSUI;
        for (let i = 0; i < target; i++) {
          const menuLite = todayPlan.menus[i % todayPlan.menus.length];
          const menu = menuPool.find((m) => m.code === menuLite.code) || menuPool[randInt(0, menuPool.length - 1)];
          totalEnergy += menu.totalNutrition.energyKkal;
          if (menuSamples.length < 3) menuSamples.push(menu);
        }

        const totalPorsi =
          porsiPesertaDidik + porsiBalita + porsiIbuHamil + porsiIbuMenyusui;
        const kapasitas = Math.max(1, sppg.kapasitasPorsiPerHari || 1);
        const realisasiPersen = round2((totalPorsi / kapasitas) * 100);
        // Catatan ringkas: simpan menuHarian + sampel kecil saja, TANPA menuMingguan penuh
        // (detail SPPG & laporan punya fallback buildSyntheticMenuSnapshotForSppg). Ini
        // pemangkasan utama ukuran tulis/baca DB agar tidak menembus kuota free tier.
        const catatanRingkas = JSON.stringify({
          source: "dummy-nutrition-generator",
          generatedAt: generatedAt.toISOString(),
          realisasiPersen,
          totalMenuGenerated: totalMenus,
          totalPorsiGenerated: dailyTotalPortions,
          sliceKey: slice.key,
          weekdayKey,
          menuHarian: todayPlan,
          menuHarianSampel: menuSamples.map((m) => ({
            code: m.code,
            title: m.title,
            itemCount: m.items.length,
            totalNutrition: m.totalNutrition,
          })),
          averageEnergyPerPortion: round2(totalEnergy / Math.max(1, totalPorsi)),
        });
        upsertDistribusi.push(
          prisma.distribusiMbg.upsert({
            where: {
              sppgId_tanggalDistribusi: {
                sppgId: sppg.id,
                tanggalDistribusi: slice.date,
              },
            },
          update: {
            porsiPesertaDidik,
            porsiBalita,
            porsiIbuHamil,
            porsiIbuMenyusui,
            totalPorsi,
            status: "TERVALIDASI",
            catatan: catatanRingkas,
          },
          create: {
            sppgId: sppg.id,
            tanggalDistribusi: slice.date,
            porsiPesertaDidik,
            porsiBalita,
            porsiIbuHamil,
            porsiIbuMenyusui,
            totalPorsi,
            status: "TERVALIDASI",
            operatorId: operatorBySppg.get(sppg.id) || fallbackPetugasId,
            validatorId: fallbackPetugasId,
            catatan: catatanRingkas,
          },
          })
        );
      }
    }

    // Pecah transaksi distribusi per-chunk 25 SPPG agar tidak timeout 60s.
    // Jalankan paralel per-chunk (max 4 concurrent) untuk total < 5 menit.
    const DISTRIBUSI_CHUNK = 25;
    const distribusiChunks = chunk(upsertDistribusi, DISTRIBUSI_CHUNK);
    const CONCURRENCY = 4;
    let cursor = 0;
    async function runDistribusiPool() {
      const workers = [];
      for (let w = 0; w < CONCURRENCY; w++) {
        workers.push((async () => {
          while (true) {
            const idx = cursor++;
            if (idx >= distribusiChunks.length) return;
            const c = distribusiChunks[idx];
            try {
              await prisma.$transaction(c, { timeout: 60_000 });
            } catch (err) {
              // Fallback: jalankan satu per satu agar partial failure tidak menggugurkan batch
              for (const op of c) {
                try { await op; } catch (e) { console.error("[dummy-nutrition] upsert distribusi gagal:", e.message); }
              }
            }
          }
        })());
      }
      await Promise.all(workers);
    }
    await runDistribusiPool();

    // Chunk pemantauan lebih kecil + paralel 2 worker agar tidak menumpuk.
    const PEMANTAUAN_CHUNK = 50;
    const pemantauanChunks = chunk(pemantauanRows, PEMANTAUAN_CHUNK);
    let pCursor = 0;
    async function runPemantauanPool() {
      const workers = [];
      for (let w = 0; w < 2; w++) {
        workers.push((async () => {
          while (true) {
            const idx = pCursor++;
            if (idx >= pemantauanChunks.length) return;
            try {
              await prisma.pemantauanGizi.createMany({ data: pemantauanChunks[idx] });
            } catch (err) {
              console.error("[dummy-nutrition] createMany pemantauan gagal chunk " + idx + ":", err.message);
            }
          }
        })());
      }
      await Promise.all(workers);
    }
    await runPemantauanPool();

    await prisma.ingestBatch.create({
      data: {
        source: "dummy_nutrition_generator",
        fetchedAt: generatedAt,
        generatedAt,
        timezone: TZ,
        qualityFlag: "OK",
        isFallback: false,
        totalRecords: pemantauanRows.length,
        notes:
          "Generator dummy harian: " +
          totalMenus +
          " menu unik acak + pemantauan gizi, disebar berbobot kapasitas ke SPPG aktif pada kemarin/hari_ini/besok.",
      },
    });

    return {
      success: true,
      trigger,
      generatedAt: generatedAt.toISOString(),
      totalMenuPool: menuPool.length,
      totalUniqueMenus: totalMenus,
      baseIngredientCount: BASE_INGREDIENT_CATALOG.length,
      totalPorsiGenerated: totalPortionsBySlice.hari_ini || 0,
      totalPorsiKemarin: totalPortionsBySlice.kemarin || 0,
      totalPorsiBesok: totalPortionsBySlice.besok || 0,
      totalPemantauanInserted: pemantauanRows.length,
      totalPenerimaDibuat: penerimaDibuat,
      totalSppgUpdated: sppgPool.length,
      daysGenerated: ["kemarin", "hari_ini", "besok"],
      weekKeys: Array.from(weekKeys),
    };
  }, lockOptions);
}

function buildSyntheticMenuSnapshotForSppg({ sppgId, date = new Date(), totalMenus = 1000 }) {
  const safeTotalMenus = Math.max(1000, Math.min(10000, Number(totalMenus) || 1000));
  const menuPool = buildMenuPool(safeTotalMenus);
  const d = dayjs(date).tz(TZ);
  const weekKey = d.startOf("week").format("YYYY-[W]WW");
  const weekdayIdx = weekdayIndexFromDate(d.toDate());
  const weekdayKey = WEEKDAY_KEYS[weekdayIdx];
  const menuMingguan = buildWeeklyMenuPlanForSppg(sppgId, weekKey, menuPool);
  const menuHarian = menuMingguan[weekdayKey] || null;
  return {
    source: "synthetic_fallback",
    generatedAt: d.toDate(),
    weekKey,
    weekdayKey,
    totalMenus: safeTotalMenus,
    menuHarian,
    menuMingguan,
  };
}

module.exports = {
  runDailyDummyNutrition,
  buildSyntheticMenuSnapshotForSppg,
  buildCategoryAllocation,
  generateNamaPenerima,
};


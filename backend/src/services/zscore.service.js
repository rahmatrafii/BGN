"use strict";

const wfaBoys = require("../data/who/wfa_boys.json");
const wfaGirls = require("../data/who/wfa_girls.json");
const lhfaBoys = require("../data/who/lhfa_boys.json");
const lhfaGirls = require("../data/who/lhfa_girls.json");
const wfhBoys = require("../data/who/wfh_boys.json");
const wfhGirls = require("../data/who/wfh_girls.json");

function pickTable(indicator, jenisKelamin) {
  const isBoy = jenisKelamin === "LAKI_LAKI";
  if (indicator === "wfa") return isBoy ? wfaBoys : wfaGirls;
  if (indicator === "lhfa") return isBoy ? lhfaBoys : lhfaGirls;
  if (indicator === "wfh") return isBoy ? wfhBoys : wfhGirls;
  throw new Error("Indicator tidak dikenal: " + indicator);
}

function interpolateLMS(rows, key, value) {
  if (value <= rows[0][key]) return rows[0];
  if (value >= rows[rows.length - 1][key]) return rows[rows.length - 1];
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    if (value >= a[key] && value <= b[key]) {
      const span = b[key] - a[key];
      if (span === 0) return a;
      const t = (value - a[key]) / span;
      return {
        L: a.L + (b.L - a.L) * t,
        M: a.M + (b.M - a.M) * t,
        S: a.S + (b.S - a.S) * t,
      };
    }
  }
  return rows[rows.length - 1];
}

function lmsZScore(X, L, M, S) {
  if (!Number.isFinite(X) || !Number.isFinite(M) || !Number.isFinite(S) || S === 0) return null;
  if (L === 0) {
    return Math.log(X / M) / S;
  }
  const v = Math.pow(X / M, L);
  return (v - 1) / (L * S);
}

function round2(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function hitungZScore({ beratBadanKg, tinggiBadanCm, usiaBulan, jenisKelamin, kategori }) {
  const out = { zscoreBbU: null, zscoreTbU: null, zscoreBbTb: null };

  if (kategori === "IBU_HAMIL" || kategori === "IBU_MENYUSUI") {
    return out;
  }
  if (kategori === "PESERTA_DIDIK" && usiaBulan > 228) {
    return out;
  }

  if (Number.isFinite(beratBadanKg) && Number.isFinite(usiaBulan)) {
    const tab = pickTable("wfa", jenisKelamin);
    const lms = interpolateLMS(tab.lms, "age", usiaBulan);
    out.zscoreBbU = round2(lmsZScore(beratBadanKg, lms.L, lms.M, lms.S));
  }

  if (Number.isFinite(tinggiBadanCm) && Number.isFinite(usiaBulan)) {
    const tab = pickTable("lhfa", jenisKelamin);
    const lms = interpolateLMS(tab.lms, "age", usiaBulan);
    out.zscoreTbU = round2(lmsZScore(tinggiBadanCm, lms.L, lms.M, lms.S));
  }

  if (Number.isFinite(beratBadanKg) && Number.isFinite(tinggiBadanCm)) {
    const tab = pickTable("wfh", jenisKelamin);
    if (tinggiBadanCm >= tab.lms[0].h && tinggiBadanCm <= tab.lms[tab.lms.length - 1].h) {
      const lms = interpolateLMS(tab.lms, "h", tinggiBadanCm);
      out.zscoreBbTb = round2(lmsZScore(beratBadanKg, lms.L, lms.M, lms.S));
    }
  }

  return out;
}

function klasifikasiStatusGizi(z, { kategori, lilaCm, beratBadanKg, tinggiBadanCm, usiaBulan } = {}) {
  if (kategori === "IBU_HAMIL" || kategori === "IBU_MENYUSUI") {
    let statusGizi = "GIZI_BAIK";
    if (lilaCm !== null && lilaCm !== undefined) {
      statusGizi = Number(lilaCm) < 23.5 ? "GIZI_KURANG" : "GIZI_BAIK";
    }
    return { statusGizi, stunting: false };
  }

  if (kategori === "PESERTA_DIDIK" && usiaBulan > 60) {
    let statusGizi = "GIZI_BAIK";
    if (beratBadanKg && tinggiBadanCm) {
      const tbMeter = Number(tinggiBadanCm) / 100;
      const bmi = Number(beratBadanKg) / (tbMeter * tbMeter);
      if (bmi < 18.5) statusGizi = "GIZI_KURANG";
      else if (bmi > 25.0) statusGizi = "GIZI_LEBIH";
    }
    const stunting = z && Number.isFinite(z.zscoreTbU) ? z.zscoreTbU < -2 : false;
    return { statusGizi, stunting };
  }

  let statusGizi = "GIZI_BAIK";
  const zscoreBbU = z.zscoreBbU;
  const zscoreBbTb = z.zscoreBbTb;
  const zscoreTbU = z.zscoreTbU;

  if (Number.isFinite(zscoreBbU)) {
    if (zscoreBbU < -3) statusGizi = "GIZI_BURUK";
    else if (zscoreBbU < -2) statusGizi = "GIZI_KURANG";
    else if (zscoreBbU > 2) statusGizi = "GIZI_LEBIH";
    else statusGizi = "GIZI_BAIK";
  } else if (Number.isFinite(zscoreBbTb)) {
    if (zscoreBbTb < -3) statusGizi = "GIZI_BURUK";
    else if (zscoreBbTb < -2) statusGizi = "GIZI_KURANG";
    else if (zscoreBbTb > 2) statusGizi = "GIZI_LEBIH";
  }

  const stunting = Number.isFinite(zscoreTbU) ? zscoreTbU < -2 : false;
  return { statusGizi, stunting };
}

function validateRange({ beratBadanKg, tinggiBadanCm, lilaCm }) {
  const errs = {};
  if (beratBadanKg !== undefined && beratBadanKg !== null) {
    if (!Number.isFinite(beratBadanKg) || beratBadanKg < 0.1 || beratBadanKg > 300) {
      errs.beratBadanKg = "Berat badan harus 0.1 - 300 kg";
    }
  }
  if (tinggiBadanCm !== undefined && tinggiBadanCm !== null) {
    if (!Number.isFinite(tinggiBadanCm) || tinggiBadanCm < 30 || tinggiBadanCm > 250) {
      errs.tinggiBadanCm = "Tinggi badan harus 30 - 250 cm";
    }
  }
  if (lilaCm !== undefined && lilaCm !== null) {
    if (!Number.isFinite(lilaCm) || lilaCm < 5 || lilaCm > 50) {
      errs.lilaCm = "LILA harus 5 - 50 cm";
    }
  }
  return Object.keys(errs).length ? errs : null;
}

module.exports = {
  hitungZScore,
  klasifikasiStatusGizi,
  validateRange,
  lmsZScore,
  interpolateLMS,
  pickTable,
};

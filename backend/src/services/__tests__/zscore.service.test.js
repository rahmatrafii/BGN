"use strict";

const {
  hitungZScore,
  klasifikasiStatusGizi,
  validateRange,
  lmsZScore,
  pickTable,
  interpolateLMS,
} = require("../zscore.service");

describe("Z-Score Service - lmsZScore (formula LMS)", () => {
  test("nilai pengukuran sama dengan median menghasilkan z=0", () => {
    expect(lmsZScore(10, 0.5, 10, 0.1)).toBeCloseTo(0, 6);
  });

  test("L=0 menggunakan ln(X/M)/S", () => {
    const z = lmsZScore(11, 0, 10, 0.1);
    expect(z).toBeCloseTo(Math.log(1.1) / 0.1, 6);
  });

  test("input invalid menghasilkan null", () => {
    expect(lmsZScore(NaN, 0.5, 10, 0.1)).toBeNull();
    expect(lmsZScore(10, 0.5, 10, 0)).toBeNull();
  });
});

describe("Z-Score Service - rekonsiliasi dengan tabel WHO", () => {
  function expectMedianZero(indicator, sex, ageOrH) {
    const tab = pickTable(indicator, sex);
    const key = indicator === "wfh" ? "h" : "age";
    const lms = interpolateLMS(tab.lms, key, ageOrH);
    expect(lmsZScore(lms.M, lms.L, lms.M, lms.S)).toBeCloseTo(0, 6);
  }

  test("BB/U laki-laki di median pada usia 0/12/24/60 bulan", () => {
    expectMedianZero("wfa", "LAKI_LAKI", 0);
    expectMedianZero("wfa", "LAKI_LAKI", 12);
    expectMedianZero("wfa", "LAKI_LAKI", 24);
    expectMedianZero("wfa", "LAKI_LAKI", 60);
  });

  test("TB/U perempuan di median pada usia 6/24/48 bulan", () => {
    expectMedianZero("lhfa", "PEREMPUAN", 6);
    expectMedianZero("lhfa", "PEREMPUAN", 24);
    expectMedianZero("lhfa", "PEREMPUAN", 48);
  });

  test("BB/TB laki-laki di median pada h=80/100/115", () => {
    expectMedianZero("wfh", "LAKI_LAKI", 80);
    expectMedianZero("wfh", "LAKI_LAKI", 100);
    expectMedianZero("wfh", "LAKI_LAKI", 115);
  });
});

describe("Z-Score Service - hitungZScore", () => {
  test("balita laki-laki 24 bulan, 12.15 kg, 87.1161 cm => z mendekati 0", () => {
    const z = hitungZScore({
      beratBadanKg: 12.15,
      tinggiBadanCm: 87.1161,
      usiaBulan: 24,
      jenisKelamin: "LAKI_LAKI",
    });
    expect(z.zscoreBbU).toBeCloseTo(0, 1);
    expect(z.zscoreTbU).toBeCloseTo(0, 1);
  });

  test("balita laki-laki 42 bulan di median WHO asli (BB 15.3486 kg, TB 99.8515 cm) => z mendekati 0", () => {
    const z = hitungZScore({
      beratBadanKg: 15.3486,
      tinggiBadanCm: 99.8515,
      usiaBulan: 42,
      jenisKelamin: "LAKI_LAKI",
    });
    expect(z.zscoreBbU).toBeCloseTo(0, 1);
    expect(z.zscoreTbU).toBeCloseTo(0, 1);
  });

  test("balita laki-laki di median BB/TB WHO asli pada TB 97.5 cm (BB 14.6832 kg) => z mendekati 0", () => {
    const z = hitungZScore({
      beratBadanKg: 14.6832,
      tinggiBadanCm: 97.5,
      usiaBulan: 42,
      jenisKelamin: "LAKI_LAKI",
    });
    expect(z.zscoreBbTb).toBeCloseTo(0, 1);
  });

  test("balita perempuan 12 bulan dengan BB jauh di bawah median => zscoreBbU negatif", () => {
    const z = hitungZScore({
      beratBadanKg: 6.0,
      tinggiBadanCm: 67.0,
      usiaBulan: 12,
      jenisKelamin: "PEREMPUAN",
    });
    expect(z.zscoreBbU).toBeLessThan(-2);
    expect(z.zscoreTbU).toBeLessThan(-2);
  });

  test("anak laki-laki 36 bulan dengan BB tinggi => z positif (gizi lebih)", () => {
    const z = hitungZScore({
      beratBadanKg: 18.5,
      tinggiBadanCm: 96.1147,
      usiaBulan: 36,
      jenisKelamin: "LAKI_LAKI",
    });
    expect(z.zscoreBbU).toBeGreaterThan(2);
  });

  test("input parsial (tanpa tinggi) hanya menghitung BB/U", () => {
    const z = hitungZScore({
      beratBadanKg: 10,
      tinggiBadanCm: null,
      usiaBulan: 18,
      jenisKelamin: "LAKI_LAKI",
    });
    expect(z.zscoreBbU).not.toBeNull();
    expect(z.zscoreTbU).toBeNull();
    expect(z.zscoreBbTb).toBeNull();
  });

  test("input null/undefined sepenuhnya menghasilkan semua null", () => {
    const z = hitungZScore({
      beratBadanKg: null,
      tinggiBadanCm: null,
      usiaBulan: 12,
      jenisKelamin: "LAKI_LAKI",
    });
    expect(z.zscoreBbU).toBeNull();
    expect(z.zscoreTbU).toBeNull();
    expect(z.zscoreBbTb).toBeNull();
  });
});

describe("Z-Score Service - klasifikasiStatusGizi", () => {
  test("z BB/U < -3 = GIZI_BURUK", () => {
    expect(klasifikasiStatusGizi({ zscoreBbU: -3.5 }).statusGizi).toBe("GIZI_BURUK");
  });
  test("z BB/U tepat -3 = GIZI_KURANG (boundary)", () => {
    expect(klasifikasiStatusGizi({ zscoreBbU: -3 }).statusGizi).toBe("GIZI_KURANG");
  });
  test("z BB/U -2.5 = GIZI_KURANG", () => {
    expect(klasifikasiStatusGizi({ zscoreBbU: -2.5 }).statusGizi).toBe("GIZI_KURANG");
  });
  test("z BB/U tepat -2 = GIZI_BAIK (boundary)", () => {
    expect(klasifikasiStatusGizi({ zscoreBbU: -2 }).statusGizi).toBe("GIZI_BAIK");
  });
  test("z BB/U 0 = GIZI_BAIK", () => {
    expect(klasifikasiStatusGizi({ zscoreBbU: 0 }).statusGizi).toBe("GIZI_BAIK");
  });
  test("z BB/U tepat +2 = GIZI_BAIK", () => {
    expect(klasifikasiStatusGizi({ zscoreBbU: 2 }).statusGizi).toBe("GIZI_BAIK");
  });
  test("z BB/U +2.5 = GIZI_LEBIH", () => {
    expect(klasifikasiStatusGizi({ zscoreBbU: 2.5 }).statusGizi).toBe("GIZI_LEBIH");
  });

  test("flag stunting saat z TB/U < -2", () => {
    expect(klasifikasiStatusGizi({ zscoreBbU: 0, zscoreTbU: -2.1 }).stunting).toBe(true);
    expect(klasifikasiStatusGizi({ zscoreBbU: 0, zscoreTbU: -2 }).stunting).toBe(false);
  });

  test("fallback ke BB/TB jika BB/U tidak ada", () => {
    const a = klasifikasiStatusGizi({ zscoreBbTb: -3.2 });
    expect(a.statusGizi).toBe("GIZI_BURUK");
    const b = klasifikasiStatusGizi({ zscoreBbTb: -2.5 });
    expect(b.statusGizi).toBe("GIZI_KURANG");
    const c = klasifikasiStatusGizi({ zscoreBbTb: 2.5 });
    expect(c.statusGizi).toBe("GIZI_LEBIH");
  });
});

describe("Z-Score Service - validateRange", () => {
  test("nilai di luar plausible range ditolak", () => {
    const errs = validateRange({ beratBadanKg: -1, tinggiBadanCm: 500, lilaCm: 1 });
    expect(errs.beratBadanKg).toBeDefined();
    expect(errs.tinggiBadanCm).toBeDefined();
    expect(errs.lilaCm).toBeDefined();
  });
  test("nilai valid lolos", () => {
    expect(validateRange({ beratBadanKg: 12, tinggiBadanCm: 90, lilaCm: 14 })).toBeNull();
  });
});

describe("Z-Score Service - Ibu Hamil, Menyusui & Anak Sekolah > 60 bulan", () => {
  test("hitungZScore mengembalikan null untuk IBU_HAMIL dan IBU_MENYUSUI", () => {
    const z1 = hitungZScore({ beratBadanKg: 50, tinggiBadanCm: 155, usiaBulan: 240, jenisKelamin: "PEREMPUAN", kategori: "IBU_HAMIL" });
    const z2 = hitungZScore({ beratBadanKg: 50, tinggiBadanCm: 155, usiaBulan: 240, jenisKelamin: "PEREMPUAN", kategori: "IBU_MENYUSUI" });
    expect(z1.zscoreBbU).toBeNull();
    expect(z1.zscoreTbU).toBeNull();
    expect(z1.zscoreBbTb).toBeNull();
    expect(z2.zscoreBbU).toBeNull();
    expect(z2.zscoreTbU).toBeNull();
    expect(z2.zscoreBbTb).toBeNull();
  });

  test("hitungZScore menghitung BB/U dan TB/U untuk PESERTA_DIDIK berusia > 60 bulan", () => {
    const z = hitungZScore({ beratBadanKg: 30, tinggiBadanCm: 135, usiaBulan: 96, jenisKelamin: "LAKI_LAKI", kategori: "PESERTA_DIDIK" });
    expect(z.zscoreBbU).not.toBeNull();
    expect(z.zscoreTbU).not.toBeNull();
    expect(z.zscoreBbTb).toBeNull();
  });

  test("klasifikasiStatusGizi IBU_HAMIL dan IBU_MENYUSUI berdasarkan LILA", () => {
    // LILA < 23.5 cm -> GIZI_KURANG
    const resKurang = klasifikasiStatusGizi({}, { kategori: "IBU_HAMIL", lilaCm: 22.0 });
    expect(resKurang.statusGizi).toBe("GIZI_KURANG");
    expect(resKurang.stunting).toBe(false);

    // LILA >= 23.5 cm -> GIZI_BAIK
    const resBaik = klasifikasiStatusGizi({}, { kategori: "IBU_MENYUSUI", lilaCm: 24.5 });
    expect(resBaik.statusGizi).toBe("GIZI_BAIK");
    expect(resBaik.stunting).toBe(false);

    // Tanpa LILA -> Default GIZI_BAIK
    const resDefault = klasifikasiStatusGizi({}, { kategori: "IBU_HAMIL", lilaCm: null });
    expect(resDefault.statusGizi).toBe("GIZI_BAIK");
  });

  test("klasifikasiStatusGizi PESERTA_DIDIK > 60 bulan berdasarkan BMI", () => {
    // BMI < 18.5 -> GIZI_KURANG
    // BB = 30 kg, TB = 135 cm (1.35 m) -> BMI = 30 / 1.8225 = 16.46 -> GIZI_KURANG
    const resKurang = klasifikasiStatusGizi({}, { kategori: "PESERTA_DIDIK", usiaBulan: 96, beratBadanKg: 30, tinggiBadanCm: 135 });
    expect(resKurang.statusGizi).toBe("GIZI_KURANG");
    expect(resKurang.stunting).toBe(false);

    // BMI > 25.0 -> GIZI_LEBIH
    // BB = 50 kg, TB = 135 cm (1.35 m) -> BMI = 50 / 1.8225 = 27.43 -> GIZI_LEBIH
    const resLebih = klasifikasiStatusGizi({}, { kategori: "PESERTA_DIDIK", usiaBulan: 96, beratBadanKg: 50, tinggiBadanCm: 135 });
    expect(resLebih.statusGizi).toBe("GIZI_LEBIH");
    expect(resLebih.stunting).toBe(false);

    // BMI 18.5 - 25.0 -> GIZI_BAIK
    // BB = 40 kg, TB = 135 cm (1.35 m) -> BMI = 40 / 1.8225 = 21.95 -> GIZI_BAIK
    const resBaik = klasifikasiStatusGizi({}, { kategori: "PESERTA_DIDIK", usiaBulan: 96, beratBadanKg: 40, tinggiBadanCm: 135 });
    expect(resBaik.statusGizi).toBe("GIZI_BAIK");
    expect(resBaik.stunting).toBe(false);

    // Test stunting jika Z-Score TB/U < -2
    const resStunting = klasifikasiStatusGizi({ zscoreTbU: -2.5 }, { kategori: "PESERTA_DIDIK", usiaBulan: 96, beratBadanKg: 30, tinggiBadanCm: 130 });
    expect(resStunting.stunting).toBe(true);
  });
});

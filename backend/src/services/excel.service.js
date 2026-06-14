"use strict";

const ExcelJS = require("exceljs");
const dayjs = require("dayjs");

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3A6B" } };
const HEADER_FONT = { color: { argb: "FFFFFFFF" }, bold: true, name: "Calibri", size: 11 };
const ALT_ROW_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4FF" } };
const BORDER_THIN = {
  top: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
};

function applyHeaderRow(ws, headerRowIndex, columnsCount) {
  const row = ws.getRow(headerRowIndex);
  row.font = HEADER_FONT;
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height = 28;
  for (let i = 1; i <= columnsCount; i++) {
    row.getCell(i).border = BORDER_THIN;
  }
}

function autofitWidth(ws, minWidth = 12, maxWidth = 50) {
  ws.columns.forEach((col) => {
    let max = minWidth;
    col.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      if (v === null || v === undefined) return;
      const text = typeof v === "object" && v.richText ? v.richText.map((t) => t.text).join("") : String(v);
      const lines = text.split("\n");
      for (const l of lines) {
        max = Math.max(max, l.length + 2);
      }
    });
    col.width = Math.min(max, maxWidth);
  });
}

function buildInfoRows(ws, info) {
  const total = ws.columnCount || 6;
  ws.mergeCells(1, 1, 1, total);
  ws.getCell(1, 1).value = info.judul || "Laporan SIPGN-BGN";
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FF1B3A6B" } };
  ws.mergeCells(2, 1, 2, total);
  ws.getCell(2, 1).value = info.subjudul || "";
  ws.getCell(2, 1).font = { italic: true, color: { argb: "FF475569" } };
  ws.mergeCells(3, 1, 3, total);
  ws.getCell(3, 1).value = "Dicetak: " + dayjs().format("DD MMMM YYYY HH:mm") + (info.wilayah ? "  |  Wilayah: " + info.wilayah : "");
  ws.getCell(3, 1).font = { size: 10, color: { argb: "FF64748B" } };
  ws.getRow(1).height = 22;
}

async function generateLaporanDistribusi({ rows, summary, filter }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SIPGN-BGN";
  wb.created = new Date();

  const ringkasan = wb.addWorksheet("Ringkasan");
  ringkasan.columns = [
    { header: "Indikator", key: "k", width: 35 },
    { header: "Nilai", key: "v", width: 25 },
  ];
  buildInfoRows(ringkasan, {
    judul: "Laporan Distribusi MBG",
    subjudul: "Periode: " + (filter.periodeAwal || "-") + " s.d " + (filter.periodeAkhir || "-"),
    wilayah: filter.provinsi || filter.sppg || "Nasional",
  });
  ringkasan.addRow([]);
  ringkasan.addRow(["Indikator", "Nilai"]);
  applyHeaderRow(ringkasan, 5, 2);
  for (const [k, v] of Object.entries(summary || {})) {
    ringkasan.addRow([k, v]);
  }

  const detail = wb.addWorksheet("Detail Distribusi");
  detail.columns = [
    { header: "Tanggal", key: "tanggal", width: 14 },
    { header: "Kode SPPG", key: "kode", width: 18 },
    { header: "Nama SPPG", key: "nama", width: 32 },
    { header: "Provinsi", key: "provinsi", width: 22 },
    { header: "Peserta Didik", key: "pd", width: 14 },
    { header: "Balita", key: "ba", width: 12 },
    { header: "Ibu Hamil", key: "ih", width: 14 },
    { header: "Ibu Menyusui", key: "im", width: 14 },
    { header: "Total Porsi", key: "total", width: 14 },
    { header: "Status", key: "status", width: 16 },
  ];
  buildInfoRows(detail, {
    judul: "Detail Distribusi MBG",
    subjudul: "Periode: " + (filter.periodeAwal || "-") + " s.d " + (filter.periodeAkhir || "-"),
    wilayah: filter.provinsi || filter.sppg || "Nasional",
  });
  detail.addRow([]);
  const headerRow = detail.addRow([
    "Tanggal",
    "Kode SPPG",
    "Nama SPPG",
    "Provinsi",
    "Peserta Didik",
    "Balita",
    "Ibu Hamil",
    "Ibu Menyusui",
    "Total Porsi",
    "Status",
  ]);
  applyHeaderRow(detail, headerRow.number, 10);
  detail.views = [{ state: "frozen", ySplit: headerRow.number }];

  let i = 0;
  for (const r of rows) {
    const row = detail.addRow([
      dayjs(r.tanggalDistribusi).format("YYYY-MM-DD"),
      r.sppg && r.sppg.kodeSppg,
      r.sppg && r.sppg.namaSppg,
      r.sppg && r.sppg.provinsi,
      r.porsiPesertaDidik,
      r.porsiBalita,
      r.porsiIbuHamil,
      r.porsiIbuMenyusui,
      r.totalPorsi,
      r.status,
    ]);
    if (i % 2 === 1) row.fill = ALT_ROW_FILL;
    [5, 6, 7, 8, 9].forEach((c) => {
      row.getCell(c).numFmt = "#,##0";
    });
    row.eachCell((c) => (c.border = BORDER_THIN));
    i++;
  }
  autofitWidth(detail);

  return wb;
}

async function generateLaporanStatusGizi({ rows, filter }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SIPGN-BGN";
  wb.created = new Date();

  const ws = wb.addWorksheet("Status Gizi");
  ws.columns = [
    { header: "Nama", width: 25 },
    { header: "NIK (mask)", width: 20 },
    { header: "Kategori", width: 16 },
    { header: "SPPG", width: 30 },
    { header: "Tanggal Ukur", width: 14 },
    { header: "BB (kg)", width: 10 },
    { header: "TB (cm)", width: 10 },
    { header: "LILA (cm)", width: 10 },
    { header: "Z BB/U", width: 10 },
    { header: "Z TB/U", width: 10 },
    { header: "Z BB/TB", width: 10 },
    { header: "Status Gizi", width: 14 },
    { header: "Stunting", width: 10 },
  ];
  buildInfoRows(ws, {
    judul: "Laporan Status Gizi",
    subjudul: "Periode: " + (filter.periodeAwal || "-") + " s.d " + (filter.periodeAkhir || "-"),
    wilayah: filter.provinsi || filter.sppg || "Nasional",
  });
  ws.addRow([]);
  const headerRow = ws.addRow([
    "Nama",
    "NIK (mask)",
    "Kategori",
    "SPPG",
    "Tanggal Ukur",
    "BB (kg)",
    "TB (cm)",
    "LILA (cm)",
    "Z BB/U",
    "Z TB/U",
    "Z BB/TB",
    "Status Gizi",
    "Stunting",
  ]);
  applyHeaderRow(ws, headerRow.number, 13);
  ws.views = [{ state: "frozen", ySplit: headerRow.number }];

  for (const r of rows) {
    const row = ws.addRow([
      r.namaLengkap,
      r.nikMasked,
      r.kategori,
      r.sppgNama,
      r.tanggalPengukuran ? dayjs(r.tanggalPengukuran).format("YYYY-MM-DD") : "",
      r.beratBadanKg !== null && r.beratBadanKg !== undefined ? Number(r.beratBadanKg) : "",
      r.tinggiBadanCm !== null && r.tinggiBadanCm !== undefined ? Number(r.tinggiBadanCm) : "",
      r.lilaCm !== null && r.lilaCm !== undefined ? Number(r.lilaCm) : "",
      r.zscoreBbU !== null && r.zscoreBbU !== undefined ? Number(r.zscoreBbU) : "",
      r.zscoreTbU !== null && r.zscoreTbU !== undefined ? Number(r.zscoreTbU) : "",
      r.zscoreBbTb !== null && r.zscoreBbTb !== undefined ? Number(r.zscoreBbTb) : "",
      r.statusGizi,
      r.stunting ? "Ya" : "Tidak",
    ]);
    [6, 7, 8, 9, 10, 11].forEach((c) => (row.getCell(c).numFmt = "#,##0.00"));
    row.eachCell((c) => (c.border = BORDER_THIN));
    if (r.statusGizi === "GIZI_BURUK") {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE0E0" } };
    } else if (r.statusGizi === "GIZI_KURANG") {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9E0" } };
    }
  }

  return wb;
}

async function generateLaporanKinerjaSppg({ rows, filter }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Kinerja SPPG");
  ws.columns = [
    { header: "Kode SPPG", width: 18 },
    { header: "Nama SPPG", width: 35 },
    { header: "Provinsi", width: 22 },
    { header: "Kapasitas/hari", width: 16 },
    { header: "Rata-rata Distribusi", width: 18 },
    { header: "% Realisasi", width: 14 },
    { header: "Penerima Aktif", width: 16 },
    { header: "Status", width: 12 },
  ];
  buildInfoRows(ws, {
    judul: "Laporan Kinerja SPPG",
    subjudul: filter.periodeAwal ? "Periode: " + filter.periodeAwal + " s.d " + (filter.periodeAkhir || "-") : "",
    wilayah: filter.provinsi || "Nasional",
  });
  ws.addRow([]);
  const headerRow = ws.addRow([
    "Kode SPPG", "Nama SPPG", "Provinsi", "Kapasitas/hari", "Rata-rata Distribusi", "% Realisasi", "Penerima Aktif", "Status",
  ]);
  applyHeaderRow(ws, headerRow.number, 8);
  ws.views = [{ state: "frozen", ySplit: headerRow.number }];

  for (const r of rows) {
    const row = ws.addRow([
      r.kodeSppg, r.namaSppg, r.provinsi, r.kapasitas, r.rataRata, r.realisasiPersen, r.penerimaAktif, r.statusAktif ? "Aktif" : "Nonaktif",
    ]);
    row.eachCell((c) => (c.border = BORDER_THIN));
    [4, 5, 6, 7].forEach((c) => (row.getCell(c).numFmt = "#,##0.00"));
  }
  return wb;
}

async function generateLaporanPenerima({ rows, filter }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Penerima Manfaat");
  ws.columns = [
    { header: "NIK (mask)", width: 20 },
    { header: "Nama", width: 28 },
    { header: "Tanggal Lahir", width: 14 },
    { header: "Jenis Kelamin", width: 14 },
    { header: "Kategori", width: 16 },
    { header: "SPPG", width: 28 },
    { header: "Provinsi", width: 22 },
    { header: "Status", width: 10 },
  ];
  buildInfoRows(ws, {
    judul: "Laporan Penerima Manfaat",
    wilayah: filter.provinsi || "Nasional",
  });
  ws.addRow([]);
  const headerRow = ws.addRow([
    "NIK (mask)", "Nama", "Tanggal Lahir", "Jenis Kelamin", "Kategori", "SPPG", "Provinsi", "Status",
  ]);
  applyHeaderRow(ws, headerRow.number, 8);

  for (const r of rows) {
    const row = ws.addRow([
      r.nikMasked, r.namaLengkap, dayjs(r.tanggalLahir).format("YYYY-MM-DD"),
      r.jenisKelamin, r.kategori, r.sppgNama, r.sppgProvinsi, r.statusAktif ? "Aktif" : "Nonaktif",
    ]);
    row.eachCell((c) => (c.border = BORDER_THIN));
  }
  return wb;
}

module.exports = {
  generateLaporanDistribusi,
  generateLaporanStatusGizi,
  generateLaporanKinerjaSppg,
  generateLaporanPenerima,
};

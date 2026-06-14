"use strict";

const dayjs = require("dayjs");
const laporanService = require("../services/laporan.service");
const pdfService = require("../services/pdf.service");
const { sukses } = require("../utils/response");
const { prisma } = require("../config/database");
const { HttpError } = require("../middleware/errorHandler");

function fname(prefix, filter) {
  const wilayah = (filter && (filter.provinsi || filter.sppgId || "Nasional"))
    .toString()
    .replace(/[^A-Za-z0-9]+/g, "")
    .slice(0, 30);
  return "LaporanSIPGN_" + prefix + "_" + wilayah + "_" + dayjs().format("YYYYMMDD") + ".xlsx";
}

async function previewDistribusi(req, res, next) {
  try {
    const data = await laporanService.previewDistribusi({ user: req.user, filter: req.body || {} });
    return sukses(res, { totalRows: data.totalRows, summary: data.summary, rows: data.rows });
  } catch (err) {
    next(err);
  }
}

async function excelDistribusi(req, res, next) {
  try {
    const wb = await laporanService.exportDistribusi({ user: req.user, filter: req.body || {} });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="' + fname("Distribusi", req.body) + '"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
}

async function previewStatusGizi(req, res, next) {
  try {
    const data = await laporanService.previewStatusGizi({ user: req.user, filter: req.body || {} });
    return sukses(res, { totalRows: data.totalRows, summary: data.summary, rows: data.rows });
  } catch (err) {
    next(err);
  }
}

async function previewKinerjaSppg(req, res, next) {
  try {
    const data = await laporanService.previewKinerjaSppg({ user: req.user, filter: req.body || {} });
    return sukses(res, { totalRows: data.totalRows, summary: data.summary, rows: data.rows, pagination: data.pagination });
  } catch (err) {
    next(err);
  }
}

async function previewPenerima(req, res, next) {
  try {
    const data = await laporanService.previewPenerima({ user: req.user, filter: req.body || {} });
    return sukses(res, { totalRows: data.totalRows, summary: data.summary, rows: data.rows, pagination: data.pagination });
  } catch (err) {
    next(err);
  }
}

async function excelStatusGizi(req, res, next) {
  try {
    const wb = await laporanService.exportStatusGizi({ user: req.user, filter: req.body || {} });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="' + fname("StatusGizi", req.body) + '"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
}

async function excelKinerjaSppg(req, res, next) {
  try {
    const wb = await laporanService.exportKinerjaSppg({ user: req.user, filter: req.body || {} });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="' + fname("KinerjaSPPG", req.body) + '"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
}

async function excelPenerima(req, res, next) {
  try {
    const wb = await laporanService.exportPenerima({ user: req.user, filter: req.body || {} });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="' + fname("Penerima", req.body) + '"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
}

async function pdfDistribusi(req, res, next) {
  try {
    const rawRows = await laporanService.fetchDistribusi({ user: req.user, filter: req.body || {} });
    const cols = [
      { key: "tanggal", label: "Tanggal" },
      { key: "kode", label: "Kode SPPG" },
      { key: "nama", label: "Nama SPPG" },
      { key: "provinsi", label: "Provinsi" },
      { key: "total", label: "Total Porsi" },
      { key: "status", label: "Status" },
    ];
    const rows = rawRows.map((r) => ({
      tanggal: dayjs(r.tanggalDistribusi).format("YYYY-MM-DD"),
      kode: r.sppg && r.sppg.kodeSppg,
      nama: r.sppg && r.sppg.namaSppg,
      provinsi: r.sppg && r.sppg.provinsi,
      total: r.totalPorsi,
      status: r.status,
    }));
    const totalPorsi = rawRows.reduce((s, r) => s + r.totalPorsi, 0);
    const buf = await pdfService.generatePdfBuffer({
      judul: "Laporan Distribusi MBG",
      subjudul:
        "Periode: " +
        (req.body.periodeAwal || "-") +
        " s.d " +
        (req.body.periodeAkhir || "-") +
        " | Total porsi: " +
        totalPorsi,
      columns: cols,
      rows,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="LaporanSIPGN_Distribusi_' + dayjs().format("YYYYMMDD") + '.pdf"');
    res.end(buf);
  } catch (err) {
    next(err);
  }
}

async function listJadwal(req, res, next) {
  try {
    const data = await prisma.jadwalLaporan.findMany({ orderBy: { createdAt: "desc" } });
    return sukses(res, data);
  } catch (err) {
    next(err);
  }
}

async function buatJadwal(req, res, next) {
  try {
    const { jenisLaporan, frekuensi, hari, tanggal, jam, emailTujuan, filterJson } = req.body || {};
    if (!jenisLaporan || !frekuensi || !Array.isArray(emailTujuan) || emailTujuan.length === 0) {
      throw new HttpError(422, "Field jenisLaporan, frekuensi, emailTujuan wajib", "VALIDATION_ERROR");
    }
    const created = await prisma.jadwalLaporan.create({
      data: {
        jenisLaporan,
        frekuensi,
        hari: typeof hari === "number" ? hari : null,
        tanggal: typeof tanggal === "number" ? tanggal : null,
        jam: jam || "06:00",
        emailTujuan,
        filterJson: filterJson || null,
        dibuatOlehId: req.user.userId,
      },
    });
    return sukses(res, created, "Jadwal laporan dibuat", 201);
  } catch (err) {
    next(err);
  }
}

async function toggleJadwal(req, res, next) {
  try {
    const j = await prisma.jadwalLaporan.findUnique({ where: { id: req.params.id } });
    if (!j) throw new HttpError(404, "Jadwal tidak ditemukan", "NOT_FOUND");
    const updated = await prisma.jadwalLaporan.update({ where: { id: j.id }, data: { aktif: !j.aktif } });
    return sukses(res, updated);
  } catch (err) {
    next(err);
  }
}

async function hapusJadwal(req, res, next) {
  try {
    await prisma.jadwalLaporan.delete({ where: { id: req.params.id } });
    return sukses(res, null, "Jadwal dihapus");
  } catch (err) {
    next(err);
  }
}

module.exports = {
  previewDistribusi,
  excelDistribusi,
  previewStatusGizi,
  previewKinerjaSppg,
  previewPenerima,
  excelStatusGizi,
  excelKinerjaSppg,
  excelPenerima,
  pdfDistribusi,
  listJadwal,
  buatJadwal,
  toggleJadwal,
  hapusJadwal,
};

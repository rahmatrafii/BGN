"use strict";

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

const path = require("path");

const { prisma } = require("../config/database");
const { sukses } = require("../utils/response");
const { buildSppgFilter } = require("../middleware/rbac");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { catatAudit } = require("../middleware/auditTrail");
const { invalidatePrefix } = require("../services/cache.service");
const { HttpError } = require("../middleware/errorHandler");
const { startOfDay, endOfDay } = require("../utils/dateRange");
const notif = require("../services/notifikasi.service");

async function listDistribusi(req, res, next) {
  try {
    const user = req.user;
    const sppgFilter = buildSppgFilter(user);
    const { page, limit, skip } = parsePagination(req.query);

    const where = {
      ...(sppgFilter.sppgId ? { sppgId: sppgFilter.sppgId } : {}),
      ...(sppgFilter.sppg ? { sppg: sppgFilter.sppg } : {}),
    };

    if (req.query.sppgId) {
      if (sppgFilter.sppgId && req.query.sppgId !== sppgFilter.sppgId) {
        throw new HttpError(403, "Anda hanya boleh mengakses data SPPG sendiri", "FORBIDDEN");
      }
      if (user.peran === "PENGAWAS_GIZI") {
        const targetSppg = await prisma.sppg.findUnique({
          where: { id: req.query.sppgId },
          select: { provinsi: true },
        });
        if (!targetSppg || targetSppg.provinsi !== user.wilayahZona) {
          throw new HttpError(403, "SPPG di luar wilayah zona pengawasan Anda", "FORBIDDEN");
        }
      }
      where.sppgId = req.query.sppgId;
    }
    if (req.query.status) where.status = req.query.status;
    if (req.query.tanggalMulai || req.query.tanggalAkhir) {
      where.tanggalDistribusi = {};
      if (req.query.tanggalMulai) where.tanggalDistribusi.gte = startOfDay(req.query.tanggalMulai);
      if (req.query.tanggalAkhir) where.tanggalDistribusi.lte = endOfDay(req.query.tanggalAkhir);
    }

    const [data, total] = await Promise.all([
      prisma.distribusiMbg.findMany({
        where,
        skip,
        take: limit,
        orderBy: { tanggalDistribusi: "desc" },
        include: {
          sppg: { select: { id: true, kodeSppg: true, namaSppg: true, kapasitasPorsiPerHari: true, provinsi: true } },
          operator: { select: { id: true, namaLengkap: true } },
          validator: { select: { id: true, namaLengkap: true } },
        },
      }),
      prisma.distribusiMbg.count({ where }),
    ]);

    const items = data.map((d) => ({
      ...d,
      realisasiPersen: d.sppg.kapasitasPorsiPerHari > 0
        ? Math.round((d.totalPorsi / d.sppg.kapasitasPorsiPerHari) * 10000) / 100
        : null,
    }));

    return sukses(res, items, "OK", 200, { pagination: buildPaginationMeta({ total, page, limit }) });
  } catch (err) {
    next(err);
  }
}

async function buatDistribusi(req, res, next) {
  try {
    const peran = req.user.peran;
    let sppgId = req.body.sppgId;
    if (peran === "OPERATOR_SPPG" || peran === "ASISTEN_LAPANGAN") {
      sppgId = req.user.sppgId;
    }
    if (!sppgId) throw new HttpError(422, "sppgId wajib", "VALIDATION_ERROR");

    const tanggal = startOfDay(req.body.tanggalDistribusi);
    if (Number.isNaN(tanggal.getTime())) throw new HttpError(422, "Tanggal distribusi tidak valid", "VALIDATION_ERROR");
    if (tanggal > endOfDay(new Date())) throw new HttpError(422, "Tanggal distribusi tidak boleh di masa depan", "VALIDATION_ERROR");

    const diff = dayjs().diff(dayjs(tanggal), "day");
    if (diff > 3 && peran !== "ADMIN") {
      throw new HttpError(403, "Tanggal lebih dari H-3 memerlukan persetujuan Pengawas/Admin", "PAST_LIMIT");
    }

    const pd = Math.max(0, parseInt(req.body.porsiPesertaDidik, 10) || 0);
    const ba = Math.max(0, parseInt(req.body.porsiBalita, 10) || 0);
    const ih = Math.max(0, parseInt(req.body.porsiIbuHamil, 10) || 0);
    const im = Math.max(0, parseInt(req.body.porsiIbuMenyusui, 10) || 0);
    const total = pd + ba + ih + im;

    if (total <= 0) {
      throw new HttpError(422, "Total porsi distribusi harus lebih besar dari 0", "VALIDATION_ERROR");
    }

    const sppg = await prisma.sppg.findUnique({ where: { id: sppgId } });
    if (!sppg) throw new HttpError(404, "SPPG tidak ditemukan", "NOT_FOUND");

    if (total > sppg.kapasitasPorsiPerHari * 1.2) {
      throw new HttpError(422, "Total porsi melebihi 120% kapasitas SPPG", "OVER_CAPACITY");
    }

    const exists = await prisma.distribusiMbg.findUnique({
      where: { sppgId_tanggalDistribusi: { sppgId, tanggalDistribusi: tanggal } },
    });
    if (exists) throw new HttpError(409, "Sudah ada laporan distribusi untuk tanggal ini", "DUPLICATE");

    const created = await prisma.distribusiMbg.create({
      data: {
        sppgId,
        tanggalDistribusi: tanggal,
        porsiPesertaDidik: pd,
        porsiBalita: ba,
        porsiIbuHamil: ih,
        porsiIbuMenyusui: im,
        totalPorsi: total,
        status: "DRAFT",
        catatan: req.body.catatan || null,
        operatorId: req.user.userId,
      },
    });

    await catatAudit({ tabel: "distribusi_mbg", recordId: created.id, aksi: "CREATE", dataBaru: created, req });
    invalidatePrefix("dashboard:");

    notif.notifikasiDistribusiBaru({ distribusi: created, sppg }).catch(() => {});

    return sukses(res, created, "Distribusi tercatat", 201);
  } catch (err) {
    next(err);
  }
}

async function uploadBukti(req, res, next) {
  try {
    if (!req.file) throw new HttpError(400, "File foto wajib diunggah (field 'foto')", "FILE_REQUIRED");
    const id = req.params.id;
    const dist = await prisma.distribusiMbg.findUnique({ where: { id } });
    if (!dist) throw new HttpError(404, "Distribusi tidak ditemukan", "NOT_FOUND");

    if (dist.status !== "DRAFT") {
      throw new HttpError(422, "Foto bukti hanya dapat diunggah saat status DRAFT", "INVALID_STATE");
    }

    if (
      (req.user.peran === "OPERATOR_SPPG" || req.user.peran === "ASISTEN_LAPANGAN") &&
      dist.sppgId !== req.user.sppgId
    ) {
      throw new HttpError(403, "Anda hanya boleh mengelola SPPG sendiri", "FORBIDDEN");
    }

    const relPath = path.relative(process.env.UPLOAD_DIR || "./uploads", req.file.path).replace(/\\/g, "/");
    const url = "/uploads/" + relPath;
    const updated = await prisma.distribusiMbg.update({ where: { id }, data: { fotoBuktiUrl: url } });
    await catatAudit({ tabel: "distribusi_mbg", recordId: id, aksi: "UPDATE", dataBaru: { fotoBuktiUrl: url }, req });
    return sukses(res, { id: updated.id, fotoBuktiUrl: updated.fotoBuktiUrl }, "Foto bukti diunggah");
  } catch (err) {
    next(err);
  }
}

async function konfirmasiDistribusi(req, res, next) {
  try {
    const id = req.params.id;
    const dist = await prisma.distribusiMbg.findUnique({
      where: { id },
      include: { sppg: { select: { provinsi: true } } },
    });
    if (!dist) throw new HttpError(404, "Distribusi tidak ditemukan", "NOT_FOUND");
    if (dist.status !== "DRAFT") throw new HttpError(422, "Hanya distribusi DRAFT yang dapat dikonfirmasi", "INVALID_STATE");

    if (req.user.peran === "PENGAWAS_GIZI" && dist.sppg.provinsi !== req.user.wilayahZona) {
      throw new HttpError(403, "SPPG di luar zona Anda", "FORBIDDEN_ZONA");
    }

    const updated = await prisma.distribusiMbg.update({
      where: { id },
      data: { status: "TERKONFIRMASI", validatorId: req.user.userId },
    });
    await catatAudit({ tabel: "distribusi_mbg", recordId: id, aksi: "UPDATE", dataLama: { status: "DRAFT" }, dataBaru: { status: "TERKONFIRMASI" }, req });
    invalidatePrefix("dashboard:");
    return sukses(res, updated, "Distribusi dikonfirmasi");
  } catch (err) {
    next(err);
  }
}

async function validasiDistribusi(req, res, next) {
  try {
    const id = req.params.id;
    const dist = await prisma.distribusiMbg.findUnique({
      where: { id },
      include: { sppg: { select: { provinsi: true } } },
    });
    if (!dist) throw new HttpError(404, "Distribusi tidak ditemukan", "NOT_FOUND");
    if (dist.status !== "TERKONFIRMASI") {
      throw new HttpError(422, "Hanya distribusi TERKONFIRMASI yang dapat divalidasi", "INVALID_STATE");
    }
    if (req.user.peran === "PENGAWAS_GIZI" && dist.sppg.provinsi !== req.user.wilayahZona) {
      throw new HttpError(403, "SPPG di luar zona Anda", "FORBIDDEN_ZONA");
    }
    const updated = await prisma.distribusiMbg.update({
      where: { id },
      data: { status: "TERVALIDASI", validatorId: req.user.userId },
    });
    await catatAudit({ tabel: "distribusi_mbg", recordId: id, aksi: "UPDATE", dataLama: { status: "TERKONFIRMASI" }, dataBaru: { status: "TERVALIDASI" }, req });
    invalidatePrefix("dashboard:");
    return sukses(res, updated, "Distribusi divalidasi");
  } catch (err) {
    next(err);
  }
}

async function kalkulasiAnggaran(req, res, next) {
  try {
    const biaya = parseInt(process.env.BIAYA_PER_PORSI, 10) || 10000;
    const bulan = parseInt(req.query.bulan, 10);
    const tahun = parseInt(req.query.tahun, 10) || dayjs().year();
    const start = bulan 
      ? dayjs().tz("Asia/Jakarta").year(tahun).month(bulan - 1).date(1).startOf("month") 
      : dayjs().tz("Asia/Jakarta").startOf("month");
    const end = start.endOf("month");

    const where = {
      tanggalDistribusi: { gte: start.toDate(), lte: end.toDate() },
    };
    if (req.query.sppgId) where.sppgId = req.query.sppgId;
    if (req.user.peran === "OPERATOR_SPPG" || req.user.peran === "ASISTEN_LAPANGAN") {
      where.sppgId = req.user.sppgId;
    } else if (req.user.peran === "PENGAWAS_GIZI") {
      where.sppg = { provinsi: req.user.wilayahZona };
    }

    const list = await prisma.distribusiMbg.findMany({
      where,
      select: { tanggalDistribusi: true, totalPorsi: true },
    });
    const totalPorsi = list.reduce((s, d) => s + d.totalPorsi, 0);

    const breakdownMap = new Map();
    for (const d of list) {
      const week = dayjs(d.tanggalDistribusi).tz("Asia/Jakarta").startOf("week").format("YYYY-MM-DD");
      breakdownMap.set(week, (breakdownMap.get(week) || 0) + d.totalPorsi);
    }
    const perMinggu = Array.from(breakdownMap.entries())
      .sort()
      .map(([minggu, porsi]) => ({ mingguMulai: minggu, totalPorsi: porsi, totalAnggaran: porsi * biaya }));

    return sukses(res, {
      totalPorsi,
      biayaPerPorsi: biaya,
      totalAnggaran: totalPorsi * biaya,
      perMinggu,
      periode: { mulai: start.format("YYYY-MM-DD"), akhir: end.format("YYYY-MM-DD") },
    });
  } catch (err) {
    next(err);
  }
}

async function alertBelumLapor(req, res, next) {
  try {
    const yest = startOfDay(dayjs().subtract(1, "day").toDate());
    const dayBefore = startOfDay(dayjs().subtract(2, "day").toDate());

    const where = { statusAktif: true };
    if (req.user.peran === "PENGAWAS_GIZI") where.provinsi = req.user.wilayahZona;
    if (req.user.peran === "OPERATOR_SPPG" || req.user.peran === "ASISTEN_LAPANGAN") where.id = req.user.sppgId;

    const sppgs = await prisma.sppg.findMany({ where, select: { id: true, namaSppg: true, provinsi: true, kabupatenKota: true } });
    const ids = sppgs.map((s) => s.id);
    const dist = await prisma.distribusiMbg.findMany({
      where: { sppgId: { in: ids }, tanggalDistribusi: { gte: dayBefore, lte: endOfDay(yest) } },
      select: { sppgId: true, tanggalDistribusi: true },
    });
    const setMap = new Set(dist.map((d) => d.sppgId + "|" + dayjs(d.tanggalDistribusi).tz("Asia/Jakarta").format("YYYY-MM-DD")));
    const belumLapor = sppgs.filter((s) => {
      const a = setMap.has(s.id + "|" + dayjs(yest).tz("Asia/Jakarta").format("YYYY-MM-DD"));
      const b = setMap.has(s.id + "|" + dayjs(dayBefore).tz("Asia/Jakarta").format("YYYY-MM-DD"));
      return !a && !b;
    });
    return sukses(res, belumLapor);
  } catch (err) {
    next(err);
  }
}

async function detailDistribusi(req, res, next) {
  try {
    const id = req.params.id;
    const dist = await prisma.distribusiMbg.findUnique({
      where: { id },
      include: {
        sppg: { select: { id: true, kodeSppg: true, namaSppg: true, kapasitasPorsiPerHari: true, provinsi: true } },
      },
    });
    if (!dist) throw new HttpError(404, "Distribusi tidak ditemukan", "NOT_FOUND");

    if (
      (req.user.peran === "OPERATOR_SPPG" || req.user.peran === "ASISTEN_LAPANGAN") &&
      dist.sppgId !== req.user.sppgId
    ) {
      throw new HttpError(403, "Anda hanya boleh mengakses data SPPG sendiri", "FORBIDDEN");
    }

    if (req.user.peran === "PENGAWAS_GIZI" && dist.sppg.provinsi !== req.user.wilayahZona) {
      throw new HttpError(403, "SPPG di luar wilayah zona pengawasan Anda", "FORBIDDEN");
    }

    return sukses(res, dist);
  } catch (err) {
    next(err);
  }
}

async function updateDistribusi(req, res, next) {
  try {
    const id = req.params.id;
    const peran = req.user.peran;
    const dist = await prisma.distribusiMbg.findUnique({
      where: { id },
      include: { sppg: { select: { kapasitasPorsiPerHari: true } } },
    });
    if (!dist) throw new HttpError(404, "Distribusi tidak ditemukan", "NOT_FOUND");
    if (dist.status !== "DRAFT" && peran !== "ADMIN") {
      throw new HttpError(422, "Hanya distribusi DRAFT yang dapat diperbarui", "INVALID_STATE");
    }
    if (
      (peran === "OPERATOR_SPPG" || peran === "ASISTEN_LAPANGAN") &&
      dist.sppgId !== req.user.sppgId
    ) {
      throw new HttpError(403, "Anda hanya boleh mengelola SPPG sendiri", "FORBIDDEN");
    }

    const pd = Math.max(0, parseInt(req.body.porsiPesertaDidik, 10) || 0);
    const ba = Math.max(0, parseInt(req.body.porsiBalita, 10) || 0);
    const ih = Math.max(0, parseInt(req.body.porsiIbuHamil, 10) || 0);
    const im = Math.max(0, parseInt(req.body.porsiIbuMenyusui, 10) || 0);
    const total = pd + ba + ih + im;

    if (total <= 0) {
      throw new HttpError(422, "Total porsi distribusi harus lebih besar dari 0", "VALIDATION_ERROR");
    }

    if (total > dist.sppg.kapasitasPorsiPerHari * 1.2) {
      throw new HttpError(422, "Total porsi melebihi 120% kapasitas SPPG", "OVER_CAPACITY");
    }

    let tanggal = dist.tanggalDistribusi;
    if (req.body.tanggalDistribusi) {
      tanggal = startOfDay(req.body.tanggalDistribusi);
      if (Number.isNaN(tanggal.getTime())) throw new HttpError(422, "Tanggal distribusi tidak valid", "VALIDATION_ERROR");
      if (tanggal > endOfDay(new Date())) throw new HttpError(422, "Tanggal distribusi tidak boleh di masa depan", "VALIDATION_ERROR");
      
      // Pengecekan H-3 dan Duplikasi tanggal hanya dilakukan jika tanggalnya berubah
      if (tanggal.getTime() !== dist.tanggalDistribusi.getTime()) {
        const diff = dayjs().diff(dayjs(tanggal), "day");
        if (diff > 3 && peran !== "ADMIN") {
          throw new HttpError(403, "Tanggal lebih dari H-3 memerlukan persetujuan Pengawas/Admin", "PAST_LIMIT");
        }

        const exists = await prisma.distribusiMbg.findFirst({
          where: {
            sppgId: dist.sppgId,
            tanggalDistribusi: tanggal,
            id: { not: id },
          },
        });
        if (exists) throw new HttpError(409, "Sudah ada laporan distribusi untuk tanggal ini", "DUPLICATE");
      }
    }

    const updated = await prisma.distribusiMbg.update({
      where: { id },
      data: {
        tanggalDistribusi: tanggal,
        porsiPesertaDidik: pd,
        porsiBalita: ba,
        porsiIbuHamil: ih,
        porsiIbuMenyusui: im,
        totalPorsi: total,
        catatan: req.body.catatan || null,
      },
    });

    await catatAudit({ tabel: "distribusi_mbg", recordId: id, aksi: "UPDATE", dataLama: dist, dataBaru: updated, req });
    invalidatePrefix("dashboard:");

    return sukses(res, updated, "Distribusi diperbarui");
  } catch (err) {
    next(err);
  }
}

async function hapusDistribusi(req, res, next) {
  try {
    const id = req.params.id;
    const peran = req.user.peran;
    const dist = await prisma.distribusiMbg.findUnique({ where: { id } });
    if (!dist) throw new HttpError(404, "Distribusi tidak ditemukan", "NOT_FOUND");
    if (dist.status !== "DRAFT" && peran !== "ADMIN") {
      throw new HttpError(422, "Hanya distribusi DRAFT yang dapat dihapus", "INVALID_STATE");
    }
    if (
      (peran === "OPERATOR_SPPG" || peran === "ASISTEN_LAPANGAN") &&
      dist.sppgId !== req.user.sppgId
    ) {
      throw new HttpError(403, "Anda hanya boleh mengelola SPPG sendiri", "FORBIDDEN");
    }

    await prisma.distribusiMbg.delete({ where: { id } });

    await catatAudit({ tabel: "distribusi_mbg", recordId: id, aksi: "DELETE", dataLama: dist, req });
    invalidatePrefix("dashboard:");

    return sukses(res, null, "Distribusi dihapus");
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listDistribusi,
  buatDistribusi,
  uploadBukti,
  konfirmasiDistribusi,
  validasiDistribusi,
  kalkulasiAnggaran,
  alertBelumLapor,
  detailDistribusi,
  updateDistribusi,
  hapusDistribusi,
};

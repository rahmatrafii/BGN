"use strict";

const dayjs = require("dayjs");
const { prisma } = require("../config/database");
const { sukses } = require("../utils/response");
const { HttpError } = require("../middleware/errorHandler");
const { hitungZScore, klasifikasiStatusGizi, validateRange } = require("../services/zscore.service");
const { catatAudit } = require("../middleware/auditTrail");
const { invalidatePrefix } = require("../services/cache.service");
const notif = require("../services/notifikasi.service");
const { buildSppgFilter } = require("../middleware/rbac");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { AKG_TABEL, PORSI_AKG_MBG, hitungPemenuhanAKG } = require("../data/akg-standar");

function usiaBulanFrom(tanggalLahir, tanggalUkur) {
  return dayjs(tanggalUkur).diff(dayjs(tanggalLahir), "month");
}

async function buatPemantauan(req, res, next) {
  try {
    const { penerimaId, tanggalPengukuran } = req.body;
    if (!penerimaId) throw new HttpError(422, "penerimaId wajib", "VALIDATION_ERROR");

    const tanggal = new Date(tanggalPengukuran || new Date());
    if (Number.isNaN(tanggal.getTime()) || tanggal > new Date()) {
      throw new HttpError(422, "Tanggal pengukuran tidak valid / di masa depan", "VALIDATION_ERROR");
    }

    const beratBadanKg = req.body.beratBadanKg !== undefined ? Number(req.body.beratBadanKg) : null;
    const tinggiBadanCm = req.body.tinggiBadanCm !== undefined ? Number(req.body.tinggiBadanCm) : null;
    const lilaCm = req.body.lilaCm !== undefined && req.body.lilaCm !== null ? Number(req.body.lilaCm) : null;

    const errs = validateRange({ beratBadanKg, tinggiBadanCm, lilaCm });
    if (errs) return res.status(422).json({ success: false, message: "Validasi gagal", code: "VALIDATION_ERROR", fields: errs });

    const penerima = await prisma.penerimaManfaat.findUnique({
      where: { id: penerimaId },
      include: { sppg: { select: { id: true, provinsi: true, namaSppg: true } } },
    });
    if (!penerima) throw new HttpError(404, "Penerima tidak ditemukan", "NOT_FOUND");

    if (req.user.peran === "OPERATOR_SPPG" && penerima.sppgId !== req.user.sppgId) {
      throw new HttpError(403, "Hanya SPPG sendiri", "FORBIDDEN");
    }

    if (req.user.peran === "PENGAWAS_GIZI" && penerima.sppg?.provinsi !== req.user.wilayahZona) {
      throw new HttpError(403, "Penerima di luar wilayah zona pengawasan Anda", "FORBIDDEN");
    }

    const usiaBulan = usiaBulanFrom(penerima.tanggalLahir, tanggal);
    const z = hitungZScore({
      beratBadanKg,
      tinggiBadanCm,
      usiaBulan,
      jenisKelamin: penerima.jenisKelamin,
      kategori: penerima.kategori,
    });
    const klas = klasifikasiStatusGizi(z, {
      kategori: penerima.kategori,
      lilaCm,
      beratBadanKg,
      tinggiBadanCm,
      usiaBulan,
    });

    const created = await prisma.pemantauanGizi.create({
      data: {
        penerimaId,
        tanggalPengukuran: tanggal,
        beratBadanKg,
        tinggiBadanCm,
        lilaCm,
        usiaBulan,
        zscoreBbU: z.zscoreBbU,
        zscoreTbU: z.zscoreTbU,
        zscoreBbTb: z.zscoreBbTb,
        statusGizi: klas.statusGizi,
        stunting: klas.stunting,
        petugasId: req.user.userId,
        catatan: req.body.catatan || null,
      },
    });

    await catatAudit({
      tabel: "pemantauan_gizi",
      recordId: created.id,
      aksi: "CREATE",
      dataBaru: {
        penerimaId,
        statusGizi: klas.statusGizi,
        stunting: klas.stunting,
        zscoreBbU: z.zscoreBbU,
        zscoreTbU: z.zscoreTbU,
        zscoreBbTb: z.zscoreBbTb,
      },
      req,
    });

    invalidatePrefix("dashboard:");

    if (klas.statusGizi === "GIZI_BURUK" || klas.statusGizi === "GIZI_KURANG" || klas.stunting) {
      notif
        .notifikasiGiziBuruk({
          penerima,
          pemantauan: created,
          status: klas.statusGizi,
          stunting: klas.stunting,
        })
        .catch(() => {});
    }

    const akg = hitungPemenuhanAKG({ kategori: penerima.kategori, usiaBulan });
    return sukses(
      res,
      { ...created, klasifikasi: klas, zscore: z, akg: akg ? { kategori: penerima.kategori, standar: akg.standar, targetPorsi: akg.targetPorsi } : null },
      "Pemantauan gizi tersimpan",
      201
    );
  } catch (err) {
    next(err);
  }
}

async function riwayatPenerima(req, res, next) {
  try {
    const penerimaId = req.params.penerimaId;
    const sppgFilter = buildSppgFilter(req.user);
    const penerima = await prisma.penerimaManfaat.findFirst({
      where: {
        id: penerimaId,
        ...(sppgFilter.sppgId ? { sppgId: sppgFilter.sppgId } : {}),
        ...(sppgFilter.sppg ? { sppg: sppgFilter.sppg } : {}),
      },
      include: { sppg: { select: { id: true, namaSppg: true, provinsi: true } } },
    });
    if (!penerima) throw new HttpError(404, "Penerima tidak ditemukan", "NOT_FOUND");

    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });

    const [data, total] = await Promise.all([
      prisma.pemantauanGizi.findMany({
        where: { penerimaId },
        orderBy: { tanggalPengukuran: "asc" },
        skip,
        take: limit,
      }),
      prisma.pemantauanGizi.count({ where: { penerimaId } }),
    ]);

    const grafik = data.map((d) => ({
      tanggal: dayjs(d.tanggalPengukuran).format("YYYY-MM-DD"),
      usiaBulan: d.usiaBulan,
      beratBadanKg: d.beratBadanKg ? Number(d.beratBadanKg) : null,
      tinggiBadanCm: d.tinggiBadanCm ? Number(d.tinggiBadanCm) : null,
      zscoreBbU: d.zscoreBbU ? Number(d.zscoreBbU) : null,
      zscoreTbU: d.zscoreTbU ? Number(d.zscoreTbU) : null,
      zscoreBbTb: d.zscoreBbTb ? Number(d.zscoreBbTb) : null,
      statusGizi: d.statusGizi,
      stunting: d.stunting,
    }));

    return sukses(res, { penerima, riwayat: data, grafik }, "OK", 200, { pagination: buildPaginationMeta({ total, page, limit }) });
  } catch (err) {
    next(err);
  }
}

async function prevalensi(req, res, next) {
  try {
    const where = {};
    const sppgFilter = buildSppgFilter(req.user);

    if (req.user.peran === "PENGAWAS_GIZI") {
      if (req.query.provinsi && req.query.provinsi !== req.user.wilayahZona) {
        throw new HttpError(403, "Anda hanya boleh melihat wilayah zona Anda sendiri", "FORBIDDEN");
      }
      if (req.query.sppgId) {
        const targetSppg = await prisma.sppg.findUnique({
          where: { id: req.query.sppgId },
          select: { provinsi: true },
        });
        if (!targetSppg || targetSppg.provinsi !== req.user.wilayahZona) {
          throw new HttpError(403, "SPPG di luar wilayah zona pengawasan Anda", "FORBIDDEN");
        }
      }
    }

    if (req.user.peran === "OPERATOR_SPPG") {
      if (req.query.sppgId && req.query.sppgId !== req.user.sppgId) {
        throw new HttpError(403, "Anda hanya boleh melihat prevalensi SPPG Anda sendiri", "FORBIDDEN");
      }
      if (req.query.provinsi) {
        throw new HttpError(403, "Anda tidak boleh memfilter berdasarkan provinsi", "FORBIDDEN");
      }
    }

    if (req.query.sppgId) where.penerima = { sppgId: req.query.sppgId };
    else if (req.query.provinsi) where.penerima = { sppg: { provinsi: req.query.provinsi } };
    else if (sppgFilter.sppgId) where.penerima = { sppgId: sppgFilter.sppgId };
    else if (sppgFilter.sppg) where.penerima = { sppg: sppgFilter.sppg };

    const periodeAwal = req.query.periodeAwal ? new Date(req.query.periodeAwal) : dayjs().subtract(6, "month").toDate();
    const periodeAkhir = req.query.periodeAkhir ? new Date(req.query.periodeAkhir) : new Date();
    where.tanggalPengukuran = { gte: periodeAwal, lte: periodeAkhir };

    const all = await prisma.pemantauanGizi.findMany({
      where,
      orderBy: { tanggalPengukuran: "desc" },
      select: { penerimaId: true, statusGizi: true, stunting: true, zscoreBbTb: true, zscoreBbU: true },
    });

    const seen = new Set();
    const latest = [];
    for (const r of all) {
      if (seen.has(r.penerimaId)) continue;
      seen.add(r.penerimaId);
      latest.push(r);
    }

    const totalDiukur = latest.length;
    let stunting = 0, wasting = 0, underweight = 0, baik = 0;
    for (const r of latest) {
      if (r.stunting) stunting++;
      const wf = r.zscoreBbTb !== null && r.zscoreBbTb !== undefined ? Number(r.zscoreBbTb) : null;
      if (wf !== null && wf < -2) wasting++;
      if (r.statusGizi === "GIZI_BURUK" || r.statusGizi === "GIZI_KURANG") underweight++;
      if (r.statusGizi === "GIZI_BAIK") baik++;
    }

    const pct = (n) => (totalDiukur ? Math.round((n / totalDiukur) * 10000) / 100 : 0);

    return sukses(res, {
      totalDiukur,
      prevalensiStunting: pct(stunting),
      prevalensiWasting: pct(wasting),
      prevalensiUnderweight: pct(underweight),
      prevalensiGiziBaik: pct(baik),
      periode: { mulai: periodeAwal, akhir: periodeAkhir },
    });
  } catch (err) {
    next(err);
  }
}

async function standarAKG(req, res, next) {
  try {
    return sukses(res, {
      porsiAkgMbg: PORSI_AKG_MBG,
      keterangan:
        "Nilai AKG harian per orang. Satu porsi MBG menargetkan ~" +
        Math.round(PORSI_AKG_MBG * 100) +
        "% AKG harian.",
      tabel: AKG_TABEL,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { buatPemantauan, riwayatPenerima, prevalensi, standarAKG };

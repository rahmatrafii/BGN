"use strict";

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
dayjs.extend(utc);
const { prisma } = require("../config/database");
const { sukses } = require("../utils/response");
const { buildSppgFilter } = require("../middleware/rbac");
const { getOrSet } = require("../services/cache.service");
const { rangeArray, startOfDay, endOfDay } = require("../utils/dateRange");
const { HttpError } = require("../middleware/errorHandler");

function validateBoundOperator(user) {
  if ((user.peran === "OPERATOR_SPPG" || user.peran === "ASISTEN_LAPANGAN") && !user.sppgId) {
    throw new HttpError(403, "Akun Anda belum terhubung dengan SPPG", "NO_SPPG_BINDING");
  }
}

function cacheKey(prefix, user) {
  if (user.peran === "ADMIN" || user.peran === "PEJABAT_BGN") {
    return prefix + ":global";
  }
  if (user.peran === "OPERATOR_SPPG" || user.peran === "ASISTEN_LAPANGAN") {
    return prefix + ":sppg:" + user.sppgId;
  }
  if (user.peran === "PENGAWAS_GIZI") {
    return prefix + ":zona:" + user.wilayahZona;
  }
  return prefix + ":none";
}

async function getStatistik(req, res, next) {
  try {
    const user = req.user;
    validateBoundOperator(user);
    const filterSppg = buildSppgFilter(user);
    const today = startOfDay(new Date());
    const yest = startOfDay(dayjs().subtract(1, "day").toDate());

    const data = await getOrSet(cacheKey("dashboard:statistik", user), 300, async () => {
      const [
        totalPenerima,
        sppgAktifList,
        distHariIniAgg,
        distKemarinAgg,
        alertGiziBuruk,
      ] = await Promise.all([
        prisma.penerimaManfaat.count({
          where: { statusAktif: true, ...(filterSppg.sppgId ? { sppgId: filterSppg.sppgId } : {}), ...(filterSppg.sppg ? { sppg: filterSppg.sppg } : {}) },
        }),
        prisma.sppg.findMany({
          where: { statusAktif: true, ...(filterSppg.sppgId ? { id: filterSppg.sppgId } : {}), ...(filterSppg.sppg ? filterSppg.sppg : {}) },
          select: { id: true, kapasitasPorsiPerHari: true },
        }),
        prisma.distribusiMbg.aggregate({
          _sum: { totalPorsi: true },
          where: {
            tanggalDistribusi: today,
            ...(filterSppg.sppgId ? { sppgId: filterSppg.sppgId } : {}),
            ...(filterSppg.sppg ? { sppg: filterSppg.sppg } : {}),
          },
        }),
        prisma.distribusiMbg.aggregate({
          _sum: { totalPorsi: true },
          where: {
            tanggalDistribusi: yest,
            ...(filterSppg.sppgId ? { sppgId: filterSppg.sppgId } : {}),
            ...(filterSppg.sppg ? { sppg: filterSppg.sppg } : {}),
          },
        }),
        prisma.pemantauanGizi.count({
          where: {
            statusGizi: { in: ["GIZI_BURUK", "GIZI_KURANG"] },
            tanggalPengukuran: { gte: dayjs().subtract(30, "day").toDate() },
            ...(filterSppg.sppgId
              ? { penerima: { sppgId: filterSppg.sppgId } }
              : filterSppg.sppg
              ? { penerima: { sppg: filterSppg.sppg } }
              : {}),
          },
        }),
      ]);

      const totalKapasitas = sppgAktifList.reduce((s, x) => s + (x.kapasitasPorsiPerHari || 0), 0);
      const distHariIni = distHariIniAgg._sum.totalPorsi || 0;
      const distKemarin = distKemarinAgg._sum.totalPorsi || 0;
      const persentaseCakupan = totalKapasitas > 0 ? (distHariIni / totalKapasitas) * 100 : 0;
      const perubahanDistribusi = distKemarin > 0
        ? ((distHariIni - distKemarin) / distKemarin) * 100
        : (distHariIni > 0 ? 100 : 0);

      return {
        totalPenerima,
        distribusiHariIni: distHariIni,
        persentaseCakupan: Math.round(persentaseCakupan * 100) / 100,
        jumlahSppgAktif: sppgAktifList.length,
        perubahanDistribusi: Math.round(perubahanDistribusi * 100) / 100,
        alertGiziBuruk,
      };
    });

    return sukses(res, data);
  } catch (err) {
    next(err);
  }
}

async function getTrenDistribusi(req, res, next) {
  try {
    const user = req.user;
    validateBoundOperator(user);
    const range = Math.min(365, Math.max(7, parseInt(req.query.range, 10) || 30));
    const filterSppg = buildSppgFilter(user);
    const data = await getOrSet(cacheKey("dashboard:tren:" + range, user), 300, async () => {
      const since = startOfDay(dayjs().subtract(range - 1, "day").toDate());
      const grouped = await prisma.distribusiMbg.groupBy({
        by: ["tanggalDistribusi"],
        _sum: { totalPorsi: true },
        where: {
          tanggalDistribusi: { gte: since },
          ...(filterSppg.sppgId ? { sppgId: filterSppg.sppgId } : {}),
          ...(filterSppg.sppg ? { sppg: filterSppg.sppg } : {}),
        },
      });
      const map = new Map();
      for (const g of grouped) {
        const key = dayjs(g.tanggalDistribusi).utc().format("YYYY-MM-DD");
        map.set(key, g._sum.totalPorsi || 0);
      }
      return rangeArray(range).map((tanggal) => ({
        tanggal,
        totalPorsi: map.get(tanggal) || 0,
      }));
    });
    return sukses(res, data);
  } catch (err) {
    next(err);
  }
}

async function getSebaranSppg(req, res, next) {
  try {
    const user = req.user;
    validateBoundOperator(user);
    const filterSppg = buildSppgFilter(user);
    const data = await getOrSet(cacheKey("dashboard:sebaran", user), 300, async () => {
      // Window 2 hari (UTC + Jakarta) untuk toleransi timezone Vercel region iad1.
      const yestUtc = startOfDay(dayjs().subtract(1, "day").toDate());
      const yestJakarta = startOfDay(dayjs().subtract(1, "day").tz("Asia/Jakarta").toDate());
      const sppgs = await prisma.sppg.findMany({
        where: {
          ...(filterSppg.sppgId ? { id: filterSppg.sppgId } : {}),
          ...(filterSppg.sppg ? filterSppg.sppg : {}),
        },
        include: {
          _count: { select: { penerimaManfaat: { where: { statusAktif: true } } } },
        },
      });
      const ids = sppgs.map((s) => s.id);
      const dists = await prisma.distribusiMbg.findMany({
        where: {
          sppgId: { in: ids },
          OR: [{ tanggalDistribusi: yestUtc }, { tanggalDistribusi: yestJakarta }],
        },
        select: { sppgId: true, totalPorsi: true },
      });
      // Map per SPPG: kalau ada duplikat (UTC vs WIB), ambil yang terbesar.
      const distMap = new Map();
      for (const d of dists) {
        const cur = distMap.get(d.sppgId);
        if (!cur || d.totalPorsi > cur) distMap.set(d.sppgId, d.totalPorsi);
      }
      return sppgs.map((s) => ({
        id: s.id,
        kodeSppg: s.kodeSppg,
        namaSppg: s.namaSppg,
        latitude: s.latitude ? Number(s.latitude) : null,
        longitude: s.longitude ? Number(s.longitude) : null,
        provinsi: s.provinsi,
        kabupatenKota: s.kabupatenKota,
        statusAktif: s.statusAktif,
        kapasitas: s.kapasitasPorsiPerHari,
        jumlahPenerima: s._count.penerimaManfaat,
        distribusiKemarin: distMap.get(s.id) || 0,
      }));
    });
    return sukses(res, data);
  } catch (err) {
    next(err);
  }
}

async function getDistribusiKategori(req, res, next) {
  try {
    const user = req.user;
    validateBoundOperator(user);
    const filterSppg = buildSppgFilter(user);
    const data = await getOrSet(cacheKey("dashboard:kategori", user), 300, async () => {
      const grouped = await prisma.penerimaManfaat.groupBy({
        by: ["kategori"],
        _count: { id: true },
        where: {
          statusAktif: true,
          ...(filterSppg.sppgId ? { sppgId: filterSppg.sppgId } : {}),
          ...(filterSppg.sppg ? { sppg: filterSppg.sppg } : {}),
        },
      });
      const out = { PESERTA_DIDIK: 0, BALITA: 0, IBU_HAMIL: 0, IBU_MENYUSUI: 0 };
      for (const g of grouped) out[g.kategori] = g._count.id;
      return out;
    });
    return sukses(res, data);
  } catch (err) {
    next(err);
  }
}

async function getAlert(req, res, next) {
  try {
    const user = req.user;
    validateBoundOperator(user);
    const filterSppg = buildSppgFilter(user);

    const today = startOfDay(new Date());
    const yest = startOfDay(dayjs().subtract(1, "day").toDate());
    const dayBefore = startOfDay(dayjs().subtract(2, "day").toDate());

    const sppgList = await prisma.sppg.findMany({
      where: {
        statusAktif: true,
        ...(filterSppg.sppgId ? { id: filterSppg.sppgId } : {}),
        ...(filterSppg.sppg ? filterSppg.sppg : {}),
      },
      select: {
        id: true,
        namaSppg: true,
        kapasitasPorsiPerHari: true,
        provinsi: true,
        kabupatenKota: true,
      },
    });

    const sppgIds = sppgList.map((s) => s.id);
    const distRecent = await prisma.distribusiMbg.findMany({
      where: {
        sppgId: { in: sppgIds },
        tanggalDistribusi: { gte: startOfDay(dayjs().subtract(3, "day").toDate()), lte: endOfDay(new Date()) },
      },
      select: { sppgId: true, tanggalDistribusi: true, totalPorsi: true },
    });
    const distMap = new Map();
    for (const d of distRecent) {
      const k = d.sppgId + "|" + dayjs(d.tanggalDistribusi).utc().format("YYYY-MM-DD");
      distMap.set(k, d.totalPorsi);
    }

    const belumLapor = sppgList.filter((s) => {
      const a = distMap.get(s.id + "|" + dayjs(yest).format("YYYY-MM-DD"));
      const b = distMap.get(s.id + "|" + dayjs(dayBefore).format("YYYY-MM-DD"));
      return !a && !b;
    });

    const realisasiRendah = sppgList.filter((s) => {
      const days = [yest, dayBefore, dayjs().subtract(3, "day").toDate()].map((d) => dayjs(d).format("YYYY-MM-DD"));
      const realisasi = days.map((day) => (distMap.get(s.id + "|" + day) || 0) / Math.max(1, s.kapasitasPorsiPerHari));
      return realisasi.every((r) => r < 0.8);
    });

    const giziKurang = await prisma.pemantauanGizi.findMany({
      where: {
        statusGizi: { in: ["GIZI_BURUK", "GIZI_KURANG"] },
        tanggalPengukuran: { gte: dayjs().subtract(30, "day").toDate() },
        ...(filterSppg.sppgId
          ? { penerima: { sppgId: filterSppg.sppgId } }
          : filterSppg.sppg
          ? { penerima: { sppg: filterSppg.sppg } }
          : {}),
      },
      include: { penerima: { include: { sppg: { select: { namaSppg: true } } } } },
      orderBy: { tanggalPengukuran: "desc" },
      take: 20,
    });

    return sukses(res, {
      sppgBelumLapor: belumLapor,
      sppgRealisasiRendah: realisasiRendah,
      penerimaGiziBermasalah: giziKurang.map((g) => ({
        id: g.id,
        penerimaId: g.penerimaId,
        nama: g.penerima.namaLengkap,
        statusGizi: g.statusGizi,
        stunting: g.stunting,
        sppg: g.penerima.sppg && g.penerima.sppg.namaSppg,
        tanggal: g.tanggalPengukuran,
      })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStatistik,
  getTrenDistribusi,
  getSebaranSppg,
  getDistribusiKategori,
  getAlert,
};

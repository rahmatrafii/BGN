"use strict";

const { prisma } = require("../config/database");
const { sukses } = require("../utils/response");
const { startOfDay } = require("../utils/dateRange");
const { runBgnScrapeSync } = require("../services/bgnScrapeSync.service");
const { runDailyDummyNutrition } = require("../services/dummyNutrition.service");

async function getRingkasanPublik(req, res, next) {
  try {
    const tahun = parseInt(req.query.tahun, 10) || new Date().getFullYear();
    const provinsi = req.query.provinsi;
    const data = await prisma.indikatorPublik.findMany({
      where: {
        tahun,
        ...(provinsi ? { namaWilayah: { contains: provinsi, mode: "insensitive" } } : {}),
      },
      include: {
        sumber: {
          select: {
            slug: true,
            nama: true,
          },
        },
      },
      orderBy: [{ kategori: "asc" }, { indikator: "asc" }],
      take: 500,
    });
    return sukses(res, data, "Ringkasan data publik berhasil dimuat");
  } catch (err) {
    return next(err);
  }
}

async function getRealtimeSummary(_req, res, next) {
  try {
    // Pakai startOfDay (WIB) supaya sinkron dengan timezone generator.
    const todayWib = startOfDay(new Date());
    const metrics = await prisma.realtimeMetric.findMany({
      where: {
        dateJakarta: {
          gte: todayWib,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const grouped = {};
    for (const m of metrics) {
      grouped[m.metricKey] = (grouped[m.metricKey] || 0) + m.delta;
    }
    const last = metrics[0]?.generatedAt || null;
    return sukses(
      res,
      {
        timezone: "Asia/Jakarta",
        updatedAt: last,
        values: grouped,
      },
      "Ringkasan realtime MBG berhasil dimuat"
    );
  } catch (err) {
    return next(err);
  }
}

async function realtimeStream(req, res, next) {
  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let closed = false;
    req.on("close", () => {
      closed = true;
    });

    let lastSentIso = null;
    const sendEvents = async () => {
      const items = await prisma.realtimeEventStream.findMany({
        where: lastSentIso
          ? { createdAt: { gt: new Date(lastSentIso) } }
          : undefined,
        orderBy: { createdAt: "asc" },
        take: 20,
      });
      for (const item of items) {
        res.write(`event: ${item.eventType}\n`);
        res.write(`data: ${JSON.stringify(item.payload)}\n\n`);
        lastSentIso = item.createdAt.toISOString();
      }
      if (items.length === 0) {
        res.write(`event: ping\ndata: {"ts":"${new Date().toISOString()}"}\n\n`);
      }
    };

    const id = setInterval(async () => {
      if (closed) {
        clearInterval(id);
        return;
      }
      try {
        await sendEvents();
      } catch (_) {}
    }, 5000);

    await sendEvents();
  } catch (err) {
    return next(err);
  }
}

async function syncScrapeData(req, res, next) {
  try {
    const result = await runBgnScrapeSync({ trigger: "manual_api" });
    if (result && result.skipped) {
      return sukses(
        res,
        {
          skipped: true,
          reason: result.reason,
        },
        "Sinkron sedang berjalan, coba lagi sebentar"
      );
    }
    return sukses(res, result, "Sinkron scraping BGN berhasil dijalankan");
  } catch (err) {
    return next(err);
  }
}

async function syncDummyNutritionData(req, res, next) {
  try {
    const totalRecords = Number(req.body && req.body.totalRecords);
    const totalMenus = Number(req.body && req.body.totalMenus) || 1000;
    const backfillDays = Number(req.body && req.body.backfillDays) || 0;
    // mode: "absurdly_high" (default) untuk demo chart besar di UI; "realistic"
    // untuk cron harian (nasional 1rb-1jt/hari).
    const mode = (req.body && req.body.mode) || "absurdly_high";
    const result = await runDailyDummyNutrition({
      trigger: backfillDays > 0 ? "manual_api_backfill" : "manual_api",
      totalRecords,
      totalMenus,
      backfillDays,
      mode,
    });
    if (result && result.skipped) {
      return sukses(
        res,
        {
          skipped: true,
          reason: result.message || "Generator sedang berjalan",
        },
        "Generator data dummy sedang berjalan, coba lagi sebentar"
      );
    }
    return sukses(res, result, "Generator data dummy gizi harian berhasil dijalankan");
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getRingkasanPublik,
  getRealtimeSummary,
  realtimeStream,
  syncScrapeData,
  syncDummyNutritionData,
};

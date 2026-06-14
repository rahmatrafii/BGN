"use strict";

const { runDailyDummyNutrition } = require("../services/dummyNutrition.service");
const { runRealtimeBatch } = require("../scripts/ingest/realtime-generator");
const { runPublicDataIngest } = require("../scripts/ingest/public-data.ingest");
const { sukses, error } = require("../utils/response");
const { prisma } = require("../config/database");
const { invalidatePrefix } = require("../services/cache.service");
const path = require("path");
const { spawn } = require("child_process");

function isAuthorizedVercelCron(req) {
  // 1) Production: cocokkan dengan CRON_SECRET env var.
  if (process.env.NODE_ENV === "production") {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      return { ok: false, reason: "CRON_SECRET belum diset di environment" };
    }
    const headerToken = req.headers["authorization"] || "";
    const match = /^Bearer\s+(.+)$/i.exec(headerToken);
    const provided = match ? match[1].trim() : "";
    if (provided !== expected) {
      // Fallback: coba decode sebagai JWT token user jika diklik manual dari UI
      try {
        const jwt = require("jsonwebtoken");
        const { ACCESS_SECRET } = require("../config/jwt");
        const payload = jwt.verify(provided, ACCESS_SECRET);
        if (["ADMIN", "PEJABAT_BGN", "PENGAWAS_GIZI"].includes(payload.peran)) {
          return { ok: true, source: "user_jwt_token" };
        }
      } catch (_) {}
      return { ok: false, reason: "Bearer token tidak valid" };
    }
    return { ok: true, source: "bearer_cron_secret" };
  }

  // 2) Non-production (dev/test): izinkan tanpa token untuk本地 testing.
  return { ok: true, source: "dev_skip_auth" };
}

async function withStep(name, fn) {
  const started = Date.now();
  try {
    const result = await fn();
    return {
      name,
      ok: true,
      durationMs: Date.now() - started,
      summary: summarizeResult(name, result),
      raw: result,
    };
  } catch (err) {
    console.error("[cron:daily-generate] step " + name + " gagal:", err.message);
    return {
      name,
      ok: false,
      durationMs: Date.now() - started,
      error: err.message,
    };
  }
}

function summarizeResult(name, result) {
  if (!result) return null;
  if (name === "dummy") {
    return {
      success: result.success === true,
      skipped: result.skipped === true,
      totalMenuPool: result.totalMenuPool,
      totalUniqueMenus: result.totalUniqueMenus,
      totalPorsiGenerated: result.totalPorsiGenerated,
      totalPorsiKemarin: result.totalPorsiKemarin,
      totalPorsiBesok: result.totalPorsiBesok,
      totalPemantauanInserted: result.totalPemantauanInserted,
      totalSppgUpdated: result.totalSppgUpdated,
      daysGenerated: result.daysGenerated,
    };
  }
  if (name === "realtime") {
    return {
      success: result.success === true,
      totalRows: result.totalRows,
      metricKeys: (result.metrics || []).map((m) => m.metricKey),
    };
  }
  if (name === "public") {
    return {
      success: result.success === true,
      total: result.total,
      sources: (result.sources || []).map((s) => ({ slug: s.slug, count: s.count })),
    };
  }
  return null;
}

async function dailyGenerate(req, res, next) {
  const startedAt = new Date();
  try {
    const auth = isAuthorizedVercelCron(req);
    if (!auth.ok) {
      return error(res, 401, "Tidak diizinkan: " + auth.reason);
    }

    const trigger =
      (req.headers["user-agent"] || "").includes("vercel-cron")
        ? "vercel_cron"
        : req.body && req.body.trigger
        ? String(req.body.trigger)
        : "manual_api_cron";

    // Jalankan steps secara allSettled agar 1 step gagal tidak menghentikan step lain.
    // Urutan: dummy -> realtime -> public.
    // Cron harian Vercel pakai mode "realistic" (nasional 1rb-1jt/hari).
    const [dummyStep, realtimeStep, publicStep] = await Promise.all([
      withStep("dummy", () => runDailyDummyNutrition({ trigger, skipLock: true, mode: "realistic" })),
      withStep("realtime", () => runRealtimeBatch({ trigger })),
      withStep("public", () => runPublicDataIngest({ trigger })),
    ]);

    const finishedAt = new Date();
    const totalMs = finishedAt - startedAt;

    // Catat batch ringkas ke ingest_batch untuk audit.
    try {
      await prisma.ingestBatch.create({
        data: {
          source: "vercel_cron_daily",
          fetchedAt: startedAt,
          generatedAt: finishedAt,
          timezone: "Asia/Jakarta",
          qualityFlag: dummyStep.ok && realtimeStep.ok ? "OK" : "PARTIAL",
          isFallback: false,
          totalRecords:
            (dummyStep.summary && dummyStep.summary.totalPorsiGenerated ? dummyStep.summary.totalPorsiGenerated : 0) +
            (realtimeStep.summary && realtimeStep.summary.totalRows ? realtimeStep.summary.totalRows : 0) +
            (publicStep.summary && publicStep.summary.total ? publicStep.summary.total : 0),
          notes: JSON.stringify({
            trigger,
            authSource: auth.source,
            scheduleHeader: req.headers["x-vercel-cron-schedule"] || null,
            steps: [dummyStep, realtimeStep, publicStep].map((s) => ({
              name: s.name,
              ok: s.ok,
              durationMs: s.durationMs,
              error: s.error || null,
            })),
            totalMs,
          }),
        },
      });
    } catch (err) {
      console.error("[cron:daily-generate] gagal catat ingest_batch:", err.message);
    }

    const allOk = dummyStep.ok && realtimeStep.ok && publicStep.ok;
    // Invalidate dashboard & laporan cache supaya data langsung konsisten
    // untuk user yang baru me-refresh UI setelah trigger cron.
    await invalidatePrefix("dashboard:");
    await invalidatePrefix("laporan:");
    return sukses(
      res,
      {
        ok: allOk,
        trigger,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        totalMs,
        steps: { dummy: dummyStep, realtime: realtimeStep, public: publicStep },
      },
      allOk ? "Sinkronisasi harian berhasil" : "Sinkronisasi harian selesai sebagian"
    );
  } catch (err) {
    return next(err);
  }
}

function runBackfillScript() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, "..", "scripts", "ingest", "sppg-backfill.js")],
      { cwd: process.cwd(), stdio: "pipe", env: process.env }
    );
    let stderr = "";
    child.stdout.on("data", (d) => console.log("[cron:sppg-backfill]", d.toString().trim()));
    child.stderr.on("data", (d) => { stderr += d.toString(); console.error("[cron:sppg-backfill]", d.toString().trim()); });
    child.on("close", (code) => {
      if (code === 0) resolve({ ok: true });
      else reject(new Error("Backfill gagal (exit " + code + "): " + stderr));
    });
  });
}

async function backfillSppg(req, res, next) {
  const startedAt = new Date();
  try {
    const step = await withStep("sppg_backfill", () => runBackfillScript());
    const finishedAt = new Date();
    await invalidatePrefix("dashboard:");
    await invalidatePrefix("laporan:");
    return sukses(
      res,
      {
        ok: step.ok,
        trigger: "manual_backfill_sppg",
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        totalMs: finishedAt - startedAt,
        steps: { sppg_backfill: step },
      },
      step.ok ? "Backfill SPPG selesai" : "Backfill SPPG selesai sebagian"
    );
  } catch (err) {
    return next(err);
  }
}

async function backfill30d(req, res, next) {
  const startedAt = new Date();
  try {
    const backfillDays = Math.max(1, Math.min(60, parseInt(req.body && req.body.backfillDays, 10) || 30));
    // mode realistic = nasional 1rb-1jt/hari
    const [dummyStep, realtimeStep, publicStep] = await Promise.all([
      withStep("dummy", () =>
        runDailyDummyNutrition({ trigger: "manual_backfill_30d", backfillDays, skipLock: true, mode: "realistic" })
      ),
      withStep("realtime", () => runRealtimeBatch({ trigger: "manual_backfill_30d" })),
      withStep("public", () => runPublicDataIngest({ trigger: "manual_backfill_30d" })),
    ]);
    const finishedAt = new Date();
    const allOk = dummyStep.ok && realtimeStep.ok && publicStep.ok;
    await invalidatePrefix("dashboard:");
    await invalidatePrefix("laporan:");
    return sukses(
      res,
      {
        ok: allOk,
        trigger: "manual_backfill_30d",
        backfillDays,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        totalMs: finishedAt - startedAt,
        steps: { dummy: dummyStep, realtime: realtimeStep, public: publicStep },
      },
      allOk ? "Backfill 30 hari berhasil" : "Backfill 30 hari selesai sebagian"
    );
  } catch (err) {
    return next(err);
  }
}

module.exports = { dailyGenerate, backfillSppg, backfill30d };

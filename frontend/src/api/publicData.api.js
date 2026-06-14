import api from "./axios";
import { useAuthStore } from "../store/authStore";

export function getRingkasanPublik(tahun, provinsi) {
  const params = { tahun };
  if (provinsi) params.provinsi = provinsi;
  return api.get("/public-data/ringkasan", { params }).then((r) => r.data);
}

export function getRealtimeSummary() {
  return api.get("/public-data/realtime-summary").then((r) => r.data);
}

export function createRealtimeStream(onEvent, onError) {
  const tokenRaw = localStorage.getItem("sipgn-auth");
  let accessToken = null;
  try {
    accessToken = tokenRaw ? JSON.parse(tokenRaw)?.state?.accessToken : null;
  } catch (_) {
    accessToken = null;
  }
  const base = import.meta.env.VITE_SOCKET_URL || window.location.origin;
  const url = new URL("/api/public-data/realtime-stream", base);
  if (accessToken) url.searchParams.set("token", accessToken);
  const es = new EventSource(url.toString());
  es.onmessage = (evt) => onEvent && onEvent("message", evt.data);
  es.addEventListener("DAILY_METRIC_BATCH_CREATED", (evt) => onEvent && onEvent("batch", evt.data));
  es.addEventListener("ping", (evt) => onEvent && onEvent("ping", evt.data));
  es.onerror = (err) => onError && onError(err);
  return es;
}

export function syncScrapeData() {
  const accessToken = useAuthStore.getState().accessToken;
  const token = accessToken || (() => {
    try {
      const raw = localStorage.getItem("sipgn-auth");
      return raw ? JSON.parse(raw)?.state?.accessToken : null;
    } catch (_) {
      return null;
    }
  })();

  return api.post("/public-data/sync-scrape", null, token ? { params: { token } } : undefined).then((r) => r.data);
}

export function syncDummyNutritionData(options = {}) {
  const totalRecords = options.totalRecords;
  return api
    .post("/public-data/sync-dummy-nutrition", totalRecords ? { totalRecords } : {}, { timeout: 360000 })
    .then((r) => r.data);
}

export const triggerDailyCron = () => api.post("/cron/daily-generate", {}, { timeout: 360000 }).then((r) => r.data);

export const backfill30d = (backfillDays = 30) =>
  api.post("/admin/backfill-30d", { backfillDays }, { timeout: 600000 }).then((r) => r.data);

export const resetDistribusi = (mode = "all") =>
  api.post("/admin/reset-distribusi", { mode }, { timeout: 60000 }).then((r) => r.data);
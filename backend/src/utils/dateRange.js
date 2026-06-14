"use strict";

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

// Standarisasi timezone ke WIB (Asia/Jakarta) untuk SEMUA query tanggal.
// Server Vercel region iad1 jalan di UTC, tapi data distribusi & pemantauan
// disimpan dengan reference timezone WIB. Tanpa standarisasi ini,
// query `startOfDay(new Date())` di server UTC = midnight UTC (07:00 WIB),
// sedangkan row distribusi 10 Juni WIB = 2026-06-09T17:00:00.000Z (UTC).
// Hasilnya: distribusiHariIni = 0 padahal data ada.
const TZ = "Asia/Jakarta";

function startOfDay(d) {
  if (!d) {
    const dateStr = dayjs().tz(TZ).format("YYYY-MM-DD");
    return dayjs.utc(dateStr).startOf("day").toDate();
  }
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return dayjs.utc(d).startOf("day").toDate();
  }
  const dateStr = dayjs(d).tz(TZ).format("YYYY-MM-DD");
  return dayjs.utc(dateStr).startOf("day").toDate();
}

function endOfDay(d) {
  if (!d) {
    const dateStr = dayjs().tz(TZ).format("YYYY-MM-DD");
    return dayjs.utc(dateStr).endOf("day").toDate();
  }
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return dayjs.utc(d).endOf("day").toDate();
  }
  const dateStr = dayjs(d).tz(TZ).format("YYYY-MM-DD");
  return dayjs.utc(dateStr).endOf("day").toDate();
}

function rangeArray(days) {
  const out = [];
  const today = dayjs().tz(TZ).startOf("day");
  for (let i = days - 1; i >= 0; i--) {
    out.push(today.subtract(i, "day").format("YYYY-MM-DD"));
  }
  return out;
}

module.exports = { startOfDay, endOfDay, rangeArray };

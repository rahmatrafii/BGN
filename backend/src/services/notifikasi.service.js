"use strict";

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

const { prisma } = require("../config/database");
const socket = require("./socket.service");
const email = require("./email.service");
const { startOfDay, endOfDay } = require("../utils/dateRange");

async function simpanDanKirim({ penggunaId, jenis, judul, pesan, data, emailTo, emailSubject }) {
  const notif = await prisma.notifikasi.create({
    data: { penggunaId, jenis, judul, pesan, data: data || null },
  });
  socket.emitToUser(penggunaId, "new-notification", notif);
  if (emailTo) {
    email.kirimEmail({
      to: emailTo,
      subject: emailSubject || ("[SIPGN-BGN] " + judul),
      html: "<p>" + pesan + "</p>",
      text: pesan,
    }).catch(() => {});
  }
  return notif;
}

async function pengawasUntukProvinsi(provinsi) {
  return prisma.pengguna.findMany({
    where: { peran: "PENGAWAS_GIZI", statusAktif: true, wilayahZona: provinsi },
  });
}

async function adminAndPejabat() {
  return prisma.pengguna.findMany({
    where: { peran: { in: ["ADMIN", "PEJABAT_BGN"] }, statusAktif: true },
  });
}

async function notifikasiDistribusiBaru({ distribusi, sppg }) {
  if (!sppg) return;
  const pengawas = await pengawasUntukProvinsi(sppg.provinsi);
  for (const p of pengawas) {
    await simpanDanKirim({
      penggunaId: p.id,
      jenis: "DISTRIBUSI_BARU",
      judul: "Distribusi MBG baru di " + sppg.namaSppg,
      pesan:
        "Distribusi tanggal " +
        dayjs(distribusi.tanggalDistribusi).format("DD MMM YYYY") +
        " (Total porsi: " +
        distribusi.totalPorsi +
        ") telah diinput dan menunggu validasi.",
      data: { distribusiId: distribusi.id, sppgId: sppg.id },
    });
  }
}

async function notifikasiGiziBuruk({ penerima, pemantauan, status, stunting }) {
  if (!penerima || !penerima.sppg) return;
  const pengawas = await pengawasUntukProvinsi(penerima.sppg.provinsi);
  const targets = pengawas.length ? pengawas : await adminAndPejabat();
  const judul = "Status Gizi: " + status + (stunting ? " + Stunting" : "");
  const pesan =
    "Penerima " +
    penerima.namaLengkap +
    " (" +
    penerima.kategori +
    ") di " +
    penerima.sppg.namaSppg +
    " terdeteksi " +
    status.replace(/_/g, " ") +
    (stunting ? " dan Stunting." : ".");
  for (const p of targets) {
    await simpanDanKirim({
      penggunaId: p.id,
      jenis: "GIZI_BURUK",
      judul,
      pesan,
      data: { penerimaId: penerima.id, pemantauanId: pemantauan.id },
      emailTo: p.email,
    });
  }
}

async function kirimNotifikasiSppgBelumLapor() {
  const today = startOfDay(new Date());
  const yest = startOfDay(dayjs().subtract(1, "day").toDate());

  const sppgs = await prisma.sppg.findMany({
    where: { statusAktif: true },
    select: { id: true, namaSppg: true, provinsi: true },
  });
  const ids = sppgs.map((s) => s.id);
  const dist = await prisma.distribusiMbg.findMany({
    where: { sppgId: { in: ids }, tanggalDistribusi: { gte: yest, lte: endOfDay(today) } },
    select: { sppgId: true, tanggalDistribusi: true },
  });
  const setMap = new Set(dist.map((d) => d.sppgId + "|" + dayjs(d.tanggalDistribusi).tz("Asia/Jakarta").format("YYYY-MM-DD")));
  const belumLapor = sppgs.filter((s) => !setMap.has(s.id + "|" + dayjs(yest).tz("Asia/Jakarta").format("YYYY-MM-DD")));

  for (const s of belumLapor) {
    const pengawas = await pengawasUntukProvinsi(s.provinsi);
    for (const p of pengawas) {
      await simpanDanKirim({
        penggunaId: p.id,
        jenis: "SPPG_BELUM_LAPOR",
        judul: "SPPG belum lapor: " + s.namaSppg,
        pesan: "SPPG " + s.namaSppg + " (" + s.provinsi + ") belum mengirimkan laporan distribusi kemarin.",
        data: { sppgId: s.id },
        emailTo: p.email,
      });
    }
  }
}

async function kirimNotifikasiDistribusiRendah() {
  const sppgs = await prisma.sppg.findMany({
    where: { statusAktif: true },
    select: { id: true, namaSppg: true, provinsi: true, kapasitasPorsiPerHari: true },
  });
  for (const s of sppgs) {
    const since = dayjs().subtract(3, "day").startOf("day").toDate();
    const dist = await prisma.distribusiMbg.findMany({
      where: { sppgId: s.id, tanggalDistribusi: { gte: since } },
      select: { totalPorsi: true },
    });
    if (dist.length < 3) continue;
    const lowAll = dist.every((d) => d.totalPorsi / Math.max(1, s.kapasitasPorsiPerHari) < 0.8);
    if (!lowAll) continue;

    const targets = [
      ...(await pengawasUntukProvinsi(s.provinsi)),
      ...(await adminAndPejabat()),
    ];
    for (const p of targets) {
      await simpanDanKirim({
        penggunaId: p.id,
        jenis: "DISTRIBUSI_RENDAH",
        judul: "Realisasi rendah: " + s.namaSppg,
        pesan: "SPPG " + s.namaSppg + " memiliki realisasi <80% kapasitas selama 3 hari berturut.",
        data: { sppgId: s.id },
      });
    }
  }
}

async function listForUser(userId, { take = 30 } = {}) {
  return prisma.notifikasi.findMany({
    where: { penggunaId: userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

async function tandaiDibaca(userId, ids) {
  await prisma.notifikasi.updateMany({
    where: { penggunaId: userId, id: { in: ids } },
    data: { dibaca: true },
  });
}

async function tandaiSemuaDibaca(userId) {
  await prisma.notifikasi.updateMany({
    where: { penggunaId: userId, dibaca: false },
    data: { dibaca: true },
  });
}

async function jumlahBelumDibaca(userId) {
  return prisma.notifikasi.count({ where: { penggunaId: userId, dibaca: false } });
}

module.exports = {
  notifikasiDistribusiBaru,
  notifikasiGiziBuruk,
  kirimNotifikasiSppgBelumLapor,
  kirimNotifikasiDistribusiRendah,
  listForUser,
  tandaiDibaca,
  tandaiSemuaDibaca,
  jumlahBelumDibaca,
};

"use strict";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-min-32-chars-aaaaa";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-aaaaaaa";
process.env.DATA_ENCRYPTION_KEY = "unit-test-key-please-change-1234567890";

const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockCreate = jest.fn();
const mockFindUniqueSppg = jest.fn();
const mockFindUniquePenerima = jest.fn();
const mockUpdatePenerima = jest.fn();
const mockFindFirst = jest.fn();
const mockDistribusiFindMany = jest.fn();

jest.mock("../../config/database", () => ({
  prisma: {
    penerimaManfaat: {
      findMany: (...a) => mockFindMany(...a),
      count: (...a) => mockCount(...a),
      create: (...a) => mockCreate(...a),
      findUnique: (...a) => mockFindUniquePenerima(...a),
      findFirst: (...a) => mockFindFirst(...a),
      update: (...a) => mockUpdatePenerima(...a),
    },
    auditTrail: { create: jest.fn(async () => ({})) },
    sppg: { findUnique: (...a) => mockFindUniqueSppg(...a) },
    distribusiMbg: { findMany: (...a) => mockDistribusiFindMany(...a) },
  },
  checkDatabase: jest.fn(async () => ({ ok: true })),
}));

let mockExcelRows = [];
jest.mock("exceljs", () => {
  return {
    Workbook: jest.fn().mockImplementation(() => {
      return {
        xlsx: {
          load: jest.fn().mockResolvedValue(undefined),
        },
        worksheets: [
          {
            eachRow: jest.fn().mockImplementation((options, callback) => {
              mockExcelRows.forEach((row, index) => {
                callback({ values: row }, index + 2);
              });
            }),
          },
        ],
      };
    }),
  };
});

jest.mock("../../config/redis", () => {
  const store = new Map();
  const redis = {
    get: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    set: jest.fn(async () => "OK"),
    del: jest.fn(async () => 1),
    scan: jest.fn(async () => ["0", []]),
    ping: jest.fn(async () => "PONG"),
  };
  return {
    getRedis: () => redis,
    getPubClient: () => redis,
    getSubClient: () => redis,
    checkRedis: jest.fn(async () => ({ ok: true })),
    closeRedis: jest.fn(async () => {}),
  };
});

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { buildApp } = require("../../app");
const { ACCESS_SECRET } = require("../../config/jwt");

const app = buildApp();

function tokenFor(user) {
  return jwt.sign(user, ACCESS_SECRET, { expiresIn: "1h" });
}

describe("GET /api/penerima", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockCount.mockReset();
    mockCreate.mockReset();
    mockFindUniqueSppg.mockReset();
    mockFindUniquePenerima.mockReset();
    mockUpdatePenerima.mockReset();
    mockFindFirst.mockReset();
    mockDistribusiFindMany.mockReset();
  });

  test("401 tanpa token", async () => {
    const r = await request(app).get("/api/penerima");
    expect(r.status).toBe(401);
  });

  test("200 untuk OPERATOR_SPPG, hanya filter sppgId sendiri", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app).get("/api/penerima").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalled();
    const args = mockFindMany.mock.calls[0][0];
    expect(args.where.sppgId).toBe("sp1");
  });

  test("200 untuk OPERATOR_SPPG menyertakan sppgId sendiri pada query -> lolos", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app).get("/api/penerima?sppgId=sp1").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
  });

  test("403 untuk OPERATOR_SPPG menyertakan sppgId lain pada query -> 403", async () => {
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app).get("/api/penerima?sppgId=sp2").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(403);
  });

  test("200 sortBy=namaLengkap&sortOrder=asc -> orderBy namaLengkap asc", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .get("/api/penerima?sortBy=namaLengkap&sortOrder=asc")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
    const args = mockFindMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ namaLengkap: "asc" });
  });

  test("200 sortBy invalid -> fallback orderBy createdAt desc", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .get("/api/penerima?sortBy=password&sortOrder=asc")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
    const args = mockFindMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: "asc" });
  });

  test("200 untuk PENGAWAS_GIZI menyertakan sppgId di dalam wilayah zonanya -> lolos", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    mockFindUniqueSppg.mockResolvedValue({ id: "sp1", provinsi: "Jawa Barat" });
    const token = tokenFor({ userId: "u1", username: "p", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat", namaLengkap: "P" });
    const r = await request(app).get("/api/penerima?sppgId=sp1").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
    expect(mockFindUniqueSppg).toHaveBeenCalledWith({ where: { id: "sp1" }, select: { provinsi: true } });
  });

  test("403 untuk PENGAWAS_GIZI menyertakan sppgId di luar wilayah zonanya -> 403", async () => {
    mockFindUniqueSppg.mockResolvedValue({ id: "sp2", provinsi: "Jawa Timur" });
    const token = tokenFor({ userId: "u1", username: "p", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat", namaLengkap: "P" });
    const r = await request(app).get("/api/penerima?sppgId=sp2").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(403);
  });

  test("403 untuk PENGAWAS membuat penerima (tidak diizinkan)", async () => {
    const token = tokenFor({ userId: "u1", username: "p", peran: "PENGAWAS_GIZI", wilayahZona: "DKI Jakarta", namaLengkap: "P" });
    const r = await request(app).post("/api/penerima").set("Authorization", "Bearer " + token).send({});
    expect(r.status).toBe(403);
  });

  test("422 jika body tanpa NIK", async () => {
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app).post("/api/penerima").set("Authorization", "Bearer " + token).send({
      namaLengkap: "Test",
      tanggalLahir: new Date().toISOString(),
      jenisKelamin: "LAKI_LAKI",
      kategori: "BALITA",
    });
    expect(r.status).toBe(422);
  });

  test("201 untuk OPERATOR menambahkan penerima dengan data valid", async () => {
    mockCreate.mockResolvedValue({ id: "p1", namaLengkap: "Andi", nikMasked: "1234********9012" });
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const tanggalLahir = new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const r = await request(app)
      .post("/api/penerima")
      .set("Authorization", "Bearer " + token)
      .send({
        nik: "1234567890129012",
        namaLengkap: "Andi",
        tanggalLahir,
        jenisKelamin: "LAKI_LAKI",
        kategori: "BALITA",
      });
    expect(r.status).toBe(201);
    expect(mockCreate).toHaveBeenCalled();
  });

  test("422 jika OPERATOR menambahkan LAKI_LAKI dengan kategori IBU_HAMIL", async () => {
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const tanggalLahir = new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const r = await request(app)
      .post("/api/penerima")
      .set("Authorization", "Bearer " + token)
      .send({
        nik: "1234567890129012",
        namaLengkap: "Andi",
        tanggalLahir,
        jenisKelamin: "LAKI_LAKI",
        kategori: "IBU_HAMIL",
      });
    expect(r.status).toBe(422);
    expect(r.body.message).toContain("Kategori Ibu Hamil atau Menyusui harus berjenis kelamin Perempuan");
  });

  test("422 jika OPERATOR memperbarui kategori menjadi IBU_MENYUSUI untuk penerima LAKI_LAKI", async () => {
    mockFindUniquePenerima.mockResolvedValue({
      id: "p1",
      namaLengkap: "Andi",
      nikMasked: "1234********9012",
      jenisKelamin: "LAKI_LAKI",
      kategori: "BALITA",
      sppgId: "sp1",
    });
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .put("/api/penerima/p1")
      .set("Authorization", "Bearer " + token)
      .send({
        kategori: "IBU_MENYUSUI",
      });
    expect(r.status).toBe(422);
    expect(r.body.message).toContain("Kategori Ibu Hamil atau Menyusui harus berjenis kelamin Perempuan");
  });

  test("422 jika OPERATOR memperbarui tanggal lahir ke masa depan", async () => {
    mockFindUniquePenerima.mockResolvedValue({
      id: "p1",
      namaLengkap: "Andi",
      nikMasked: "1234********9012",
      jenisKelamin: "BALITA",
      kategori: "BALITA",
      sppgId: "sp1",
    });
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000 * 365).toISOString();
    const r = await request(app)
      .put("/api/penerima/p1")
      .set("Authorization", "Bearer " + token)
      .send({
        tanggalLahir: futureDate,
      });
    expect(r.status).toBe(422);
    expect(r.body.message).toContain("Tanggal lahir tidak valid atau berada di masa depan");
  });

  test("200 jika OPERATOR mengaktifkan kembali penerima manfaat SPPG sendiri", async () => {
    mockFindUniquePenerima.mockResolvedValue({
      id: "p1",
      namaLengkap: "Andi",
      nikMasked: "1234********9012",
      sppgId: "sp1",
      statusAktif: false,
    });
    mockUpdatePenerima.mockResolvedValue({
      id: "p1",
      statusAktif: true,
    });
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .patch("/api/penerima/p1/aktifkan")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(mockUpdatePenerima).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { statusAktif: true },
    });
  });

  test("403 jika OPERATOR mengaktifkan penerima SPPG lain", async () => {
    mockFindUniquePenerima.mockResolvedValue({
      id: "p2",
      namaLengkap: "Budi",
      sppgId: "sp2",
      statusAktif: false,
    });
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .patch("/api/penerima/p2/aktifkan")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(403);
    expect(r.body.message).toContain("SPPG sendiri");
  });

  test("404 jika OPERATOR mengaktifkan penerima yang tidak ada", async () => {
    mockFindUniquePenerima.mockResolvedValue(null);
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .patch("/api/penerima/p999/aktifkan")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(404);
  });

  test("200 jika OPERATOR menonaktifkan penerima SPPG sendiri", async () => {
    mockFindUniquePenerima.mockResolvedValue({
      id: "p1",
      namaLengkap: "Andi",
      sppgId: "sp1",
      statusAktif: true,
    });
    mockUpdatePenerima.mockResolvedValue({ id: "p1", statusAktif: false });
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .delete("/api/penerima/p1")
      .set("Authorization", "Bearer " + token)
      .send({ konfirmasi: true });
    expect(r.status).toBe(200);
    expect(mockUpdatePenerima).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { statusAktif: false },
    });
  });

  test("403 jika OPERATOR menonaktifkan penerima SPPG lain", async () => {
    mockFindUniquePenerima.mockResolvedValue({
      id: "p2",
      namaLengkap: "Budi",
      sppgId: "sp2",
      statusAktif: true,
    });
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .delete("/api/penerima/p2")
      .set("Authorization", "Bearer " + token)
      .send({ konfirmasi: true });
    expect(r.status).toBe(403);
  });

  test("400 jika OPERATOR menonaktifkan tanpa konfirmasi", async () => {
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .delete("/api/penerima/p1")
      .set("Authorization", "Bearer " + token)
      .send({});
    expect(r.status).toBe(400);
    expect(r.body.message).toContain("konfirmasi");
  });

  test("200 detail penerima mengembalikan data lengkap termasuk riwayat distribusi", async () => {
    mockFindFirst.mockResolvedValue({
      id: "p1",
      nikMasked: "1234********9012",
      namaLengkap: "Andi",
      tanggalLahir: new Date("2020-01-15"),
      jenisKelamin: "LAKI_LAKI",
      kategori: "BALITA",
      satuanPendidikan: null,
      sppgId: "sp1",
      sppg: { id: "sp1", namaSppg: "SPPG Test" },
      statusAktif: true,
      pemantauanGizi: [],
    });
    mockDistribusiFindMany.mockResolvedValue([
      { id: "d1", tanggalDistribusi: new Date("2025-06-01"), totalPorsi: 100, status: "SELESAI" },
    ]);
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .get("/api/penerima/p1")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
    expect(r.body.data.namaLengkap).toBe("Andi");
    expect(r.body.data.riwayatDistribusi).toHaveLength(1);
    expect(r.body.data.usia).toBeDefined();
  });

  test("422 jika OPERATOR menambahkan LAKI_LAKI dengan kategori IBU_MENYUSUI", async () => {
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const tanggalLahir = new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const r = await request(app)
      .post("/api/penerima")
      .set("Authorization", "Bearer " + token)
      .send({
        nik: "1234567890129012",
        namaLengkap: "Test",
        tanggalLahir,
        jenisKelamin: "LAKI_LAKI",
        kategori: "IBU_MENYUSUI",
      });
    expect(r.status).toBe(422);
    expect(r.body.message).toContain("Kategori Ibu Hamil atau Menyusui harus berjenis kelamin Perempuan");
  });

  test("409 jika OPERATOR menambahkan NIK yang sudah terdaftar di SPPG sendiri", async () => {
    mockFindFirst.mockResolvedValue({ id: "existing-penerima" });
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const tanggalLahir = new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const r = await request(app)
      .post("/api/penerima")
      .set("Authorization", "Bearer " + token)
      .send({
        nik: "1234567890129012",
        namaLengkap: "Andi",
        tanggalLahir,
        jenisKelamin: "LAKI_LAKI",
        kategori: "BALITA",
      });
    expect(r.status).toBe(409);
    expect(r.body.message).toContain("NIK sudah terdaftar di SPPG ini");
  });

  test("409 jika OPERATOR memperbarui NIK menjadi milik orang lain di SPPG yang sama", async () => {
    mockFindUniquePenerima.mockResolvedValue({
      id: "p1",
      namaLengkap: "Andi",
      sppgId: "sp1",
    });
    mockFindFirst.mockResolvedValue({ id: "p2", namaLengkap: "Budi" });
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .put("/api/penerima/p1")
      .set("Authorization", "Bearer " + token)
      .send({
        nik: "1234567890129013",
      });
    expect(r.status).toBe(409);
    expect(r.body.message).toContain("NIK sudah terdaftar di SPPG ini");
  });

  test("422 jika OPERATOR memperbarui tanggalLahir saja yang tidak cocok dengan kategori saat ini", async () => {
    mockFindUniquePenerima.mockResolvedValue({
      id: "p1",
      namaLengkap: "Andi",
      sppgId: "sp1",
      tanggalLahir: new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000),
      kategori: "BALITA",
    });
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const newDate = new Date(Date.now() - 10 * 12 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const r = await request(app)
      .put("/api/penerima/p1")
      .set("Authorization", "Bearer " + token)
      .send({
        tanggalLahir: newDate,
      });
    expect(r.status).toBe(422);
    expect(r.body.message).toContain("Kategori BALITA hanya untuk usia 0-60 bulan");
  });

  test("200 tanpa sortBy/sortOrder -> default orderBy createdAt desc", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .get("/api/penerima")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
    const args = mockFindMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: "desc" });
  });
});

describe("GET /api/penerima/satuan-pendidikan", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindUniqueSppg.mockReset();
  });

  test("401 tanpa token", async () => {
    const r = await request(app).get("/api/penerima/satuan-pendidikan");
    expect(r.status).toBe(401);
  });

  test("200 untuk OPERATOR_SPPG, mengembalikan daftar sekolah", async () => {
    mockFindMany.mockResolvedValue([
      { satuanPendidikan: "SDN 1 Malang" },
      { satuanPendidikan: "SDN 2 Malang" }
    ]);
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app).get("/api/penerima/satuan-pendidikan").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toEqual(["SDN 1 Malang", "SDN 2 Malang"]);
    expect(mockFindMany).toHaveBeenCalled();
    const args = mockFindMany.mock.calls[0][0];
    expect(args.where.sppgId).toBe("sp1");
    expect(args.distinct).toEqual(["satuanPendidikan"]);
  });

  test("403 untuk OPERATOR_SPPG menyertakan sppgId lain pada query", async () => {
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app).get("/api/penerima/satuan-pendidikan?sppgId=sp2").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(403);
  });
});

describe("POST /api/penerima/import", () => {
  beforeEach(() => {
    mockExcelRows = [];
    mockCreate.mockReset();
    mockFindFirst.mockReset();
  });

  test("200 import sukses dengan data valid", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ id: "p1" });
    mockExcelRows = [
      [, "1234567890123456", "Andi", new Date("2024-06-14"), "LAKI_LAKI", "BALITA", "SD 1"]
    ];

    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .post("/api/penerima/import")
      .set("Authorization", "Bearer " + token)
      .attach("file", Buffer.from("dummy excel content"), "test.xlsx");

    expect(r.status).toBe(200);
    expect(r.body.data.berhasil).toBe(1);
    expect(r.body.data.gagal).toBe(0);
    expect(mockCreate).toHaveBeenCalled();
  });

  test("200 import gagal karena gender vs kategori tidak sesuai", async () => {
    mockExcelRows = [
      [, "1234567890123456", "Andi", new Date("2024-06-14"), "LAKI_LAKI", "IBU_HAMIL", "SD 1"]
    ];

    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .post("/api/penerima/import")
      .set("Authorization", "Bearer " + token)
      .attach("file", Buffer.from("dummy excel content"), "test.xlsx");

    expect(r.status).toBe(200);
    expect(r.body.data.berhasil).toBe(0);
    expect(r.body.data.gagal).toBe(1);
    expect(r.body.data.errors[0].pesan).toContain("Kategori Ibu Hamil atau Menyusui harus berjenis kelamin Perempuan");
  });

  test("200 import gagal karena tanggal lahir di masa depan", async () => {
    mockExcelRows = [
      [, "1234567890123456", "Andi", new Date(Date.now() + 24 * 60 * 60 * 1000 * 365), "LAKI_LAKI", "BALITA", "SD 1"]
    ];

    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .post("/api/penerima/import")
      .set("Authorization", "Bearer " + token)
      .attach("file", Buffer.from("dummy excel content"), "test.xlsx");

    expect(r.status).toBe(200);
    expect(r.body.data.berhasil).toBe(0);
    expect(r.body.data.gagal).toBe(1);
    expect(r.body.data.errors[0].pesan).toContain("Tanggal lahir tidak valid atau berada di masa depan");
  });

  test("200 import gagal karena NIK sudah terdaftar", async () => {
    mockFindFirst.mockResolvedValue({ id: "p-existing" });
    mockExcelRows = [
      [, "1234567890123456", "Andi", new Date("2024-06-14"), "LAKI_LAKI", "BALITA", "SD 1"]
    ];

    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .post("/api/penerima/import")
      .set("Authorization", "Bearer " + token)
      .attach("file", Buffer.from("dummy excel content"), "test.xlsx");

    expect(r.status).toBe(200);
    expect(r.body.data.berhasil).toBe(0);
    expect(r.body.data.gagal).toBe(1);
    expect(r.body.data.errors[0].pesan).toContain("NIK sudah terdaftar di SPPG ini");
  });
});

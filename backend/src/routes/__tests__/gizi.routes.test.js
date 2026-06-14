"use strict";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-min-32-chars-aaaaa";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-aaaaaaa";
process.env.DATA_ENCRYPTION_KEY = "unit-test-key-please-change-1234567890";

const mockFindUniquePenerima = jest.fn();
const mockCreatePemantauan = jest.fn();
const mockFindManyPemantauan = jest.fn();
const mockFindUniqueSppg = jest.fn();

jest.mock("../../config/database", () => ({
  prisma: {
    penerimaManfaat: {
      findUnique: (...a) => mockFindUniquePenerima(...a),
    },
    pemantauanGizi: {
      create: (...a) => mockCreatePemantauan(...a),
      findMany: (...a) => mockFindManyPemantauan(...a),
    },
    sppg: {
      findUnique: (...a) => mockFindUniqueSppg(...a),
    },
    auditTrail: { create: jest.fn(async () => ({})) },
  },
  checkDatabase: jest.fn(async () => ({ ok: true })),
}));

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

jest.mock("../../middleware/upload", () => ({
  uploadDistribusi: {
    single: () => (req, res, next) => next(),
  },
  uploadExcel: {
    single: () => (req, res, next) => next(),
  },
  UPLOAD_DIR: "./uploads",
}));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { buildApp } = require("../../app");
const { ACCESS_SECRET } = require("../../config/jwt");

const app = buildApp();

function tokenFor(user) {
  return jwt.sign(user, ACCESS_SECRET, { expiresIn: "1h" });
}

describe("POST /api/gizi", () => {
  beforeEach(() => {
    mockFindUniquePenerima.mockReset();
    mockCreatePemantauan.mockReset();
    mockFindManyPemantauan.mockReset();
    mockFindUniqueSppg.mockReset();
  });

  test("401 tanpa token", async () => {
    const r = await request(app).post("/api/gizi").send({ penerimaId: "p1" });
    expect(r.status).toBe(401);
  });

  test("201 untuk PENGAWAS_GIZI menginput dalam wilayah zonanya", async () => {
    mockFindUniquePenerima.mockResolvedValue({
      id: "p1",
      tanggalLahir: "2024-01-01",
      jenisKelamin: "LAKI_LAKI",
      kategori: "BALITA",
      sppgId: "sp1",
      sppg: { id: "sp1", provinsi: "Jawa Barat", namaSppg: "SPPG 1" },
    });
    mockCreatePemantauan.mockResolvedValue({ id: "pm1" });

    const token = tokenFor({ userId: "u1", username: "pengawas", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat", namaLengkap: "Pengawas" });
    const r = await request(app)
      .post("/api/gizi")
      .set("Authorization", "Bearer " + token)
      .send({
        penerimaId: "p1",
        beratBadanKg: 10,
        tinggiBadanCm: 80,
        tanggalPengukuran: "2025-01-01",
      });
    expect(r.status).toBe(201);
    expect(mockCreatePemantauan).toHaveBeenCalled();
  });

  test("403 untuk PENGAWAS_GIZI menginput di luar wilayah zonanya", async () => {
    mockFindUniquePenerima.mockResolvedValue({
      id: "p1",
      tanggalLahir: "2024-01-01",
      jenisKelamin: "LAKI_LAKI",
      kategori: "BALITA",
      sppgId: "sp1",
      sppg: { id: "sp1", provinsi: "Jawa Timur", namaSppg: "SPPG 1" },
    });

    const token = tokenFor({ userId: "u1", username: "pengawas", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat", namaLengkap: "Pengawas" });
    const r = await request(app)
      .post("/api/gizi")
      .set("Authorization", "Bearer " + token)
      .send({
        penerimaId: "p1",
        beratBadanKg: 10,
        tinggiBadanCm: 80,
        tanggalPengukuran: "2025-01-01",
      });
    expect(r.status).toBe(403);
    expect(mockCreatePemantauan).not.toHaveBeenCalled();
  });
});

describe("GET /api/gizi/prevalensi", () => {
  beforeEach(() => {
    mockFindUniquePenerima.mockReset();
    mockCreatePemantauan.mockReset();
    mockFindManyPemantauan.mockReset();
    mockFindUniqueSppg.mockReset();
  });

  test("200 untuk PENGAWAS_GIZI mengakses prevalensi provinsi zonanya sendiri -> lolos", async () => {
    mockFindManyPemantauan.mockResolvedValue([]);
    const token = tokenFor({ userId: "u1", username: "p", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat", namaLengkap: "P" });
    const r = await request(app)
      .get("/api/gizi/prevalensi?provinsi=Jawa Barat")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
    expect(mockFindManyPemantauan).toHaveBeenCalled();
  });

  test("403 untuk PENGAWAS_GIZI mengakses prevalensi provinsi lain -> 403", async () => {
    const token = tokenFor({ userId: "u1", username: "p", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat", namaLengkap: "P" });
    const r = await request(app)
      .get("/api/gizi/prevalensi?provinsi=Jawa Timur")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(403);
    expect(mockFindManyPemantauan).not.toHaveBeenCalled();
  });

  test("200 untuk PENGAWAS_GIZI dengan sppgId di dalam zonanya -> lolos", async () => {
    mockFindManyPemantauan.mockResolvedValue([]);
    mockFindUniqueSppg.mockResolvedValue({ id: "sp1", provinsi: "Jawa Barat" });
    const token = tokenFor({ userId: "u1", username: "p", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat", namaLengkap: "P" });
    const r = await request(app)
      .get("/api/gizi/prevalensi?sppgId=sp1")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
    expect(mockFindUniqueSppg).toHaveBeenCalledWith({ where: { id: "sp1" }, select: { provinsi: true } });
  });

  test("403 untuk PENGAWAS_GIZI dengan sppgId di luar zonanya -> 403", async () => {
    mockFindUniqueSppg.mockResolvedValue({ id: "sp2", provinsi: "Jawa Timur" });
    const token = tokenFor({ userId: "u1", username: "p", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat", namaLengkap: "P" });
    const r = await request(app)
      .get("/api/gizi/prevalensi?sppgId=sp2")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(403);
  });

  test("200 untuk OPERATOR_SPPG mengakses prevalensi SPPG-nya sendiri -> lolos", async () => {
    mockFindManyPemantauan.mockResolvedValue([]);
    const token = tokenFor({ userId: "u2", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Operator" });
    const r = await request(app)
      .get("/api/gizi/prevalensi?sppgId=sp1")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
    expect(mockFindManyPemantauan).toHaveBeenCalled();
  });

  test("403 untuk OPERATOR_SPPG mengakses prevalensi SPPG lain -> 403", async () => {
    const token = tokenFor({ userId: "u2", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Operator" });
    const r = await request(app)
      .get("/api/gizi/prevalensi?sppgId=sp2")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(403);
  });

  test("403 untuk OPERATOR_SPPG mencoba filter provinsi -> 403", async () => {
    const token = tokenFor({ userId: "u2", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Operator" });
    const r = await request(app)
      .get("/api/gizi/prevalensi?provinsi=Jawa Barat")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(403);
  });
});

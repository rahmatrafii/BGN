"use strict";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-min-32-chars-aaaaa";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-aaaaaaa";
process.env.DATA_ENCRYPTION_KEY = "unit-test-key-please-change-1234567890";

const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockFindManyDist = jest.fn();
const mockCountDist = jest.fn();
const mockFindUniqueSppg = jest.fn();

jest.mock("../../config/database", () => ({
  prisma: {
    distribusiMbg: {
      findUnique: (...a) => mockFindUnique(...a),
      update: (...a) => mockUpdate(...a),
      delete: (...a) => mockDelete(...a),
      findMany: (...a) => mockFindManyDist(...a),
      count: (...a) => mockCountDist(...a),
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
    single: () => (req, res, next) => {
      req.file = { path: "uploads/mock-file.jpg", originalname: "mock-file.jpg", mimetype: "image/jpeg" };
      next();
    },
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

describe("POST /api/distribusi/:id/upload-bukti", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockFindManyDist.mockReset();
    mockCountDist.mockReset();
    mockFindUniqueSppg.mockReset();
  });

  test("401 tanpa token", async () => {
    const r = await request(app).post("/api/distribusi/d1/upload-bukti");
    expect(r.status).toBe(401);
  });

  test("200 untuk OPERATOR_SPPG mengunggah bukti ke SPPG sendiri", async () => {
    mockFindUnique.mockResolvedValue({ id: "d1", sppgId: "sp1", status: "DRAFT" });
    mockUpdate.mockResolvedValue({ id: "d1", fotoBuktiUrl: "/uploads/mock-file.jpg" });

    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .post("/api/distribusi/d1/upload-bukti")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  test("403 untuk OPERATOR_SPPG mengunggah bukti ke SPPG orang lain", async () => {
    mockFindUnique.mockResolvedValue({ id: "d1", sppgId: "sp2", status: "DRAFT" });

    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .post("/api/distribusi/d1/upload-bukti")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("200 untuk ASISTEN_LAPANGAN mengunggah bukti ke SPPG sendiri", async () => {
    mockFindUnique.mockResolvedValue({ id: "d1", sppgId: "sp1", status: "DRAFT" });
    mockUpdate.mockResolvedValue({ id: "d1", fotoBuktiUrl: "/uploads/mock-file.jpg" });

    const token = tokenFor({ userId: "u2", username: "asisten", peran: "ASISTEN_LAPANGAN", sppgId: "sp1", namaLengkap: "Asisten" });
    const r = await request(app)
      .post("/api/distribusi/d1/upload-bukti")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  test("403 untuk ASISTEN_LAPANGAN mengunggah bukti ke SPPG orang lain", async () => {
    mockFindUnique.mockResolvedValue({ id: "d1", sppgId: "sp2", status: "DRAFT" });

    const token = tokenFor({ userId: "u2", username: "asisten", peran: "ASISTEN_LAPANGAN", sppgId: "sp1", namaLengkap: "Asisten" });
    const r = await request(app)
      .post("/api/distribusi/d1/upload-bukti")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("422 jika status distribusi bukan DRAFT", async () => {
    mockFindUnique.mockResolvedValue({ id: "d1", sppgId: "sp1", status: "TERKONFIRMASI" });

    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .post("/api/distribusi/d1/upload-bukti")
      .set("Authorization", "Bearer " + token);
    expect(r.status).toBe(422);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("GET /api/distribusi", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockFindManyDist.mockReset();
    mockCountDist.mockReset();
    mockFindUniqueSppg.mockReset();
  });

  test("200 untuk OPERATOR_SPPG menyertakan sppgId sendiri pada query -> lolos", async () => {
    mockFindManyDist.mockResolvedValue([]);
    mockCountDist.mockResolvedValue(0);
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app).get("/api/distribusi?sppgId=sp1").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
  });

  test("403 untuk OPERATOR_SPPG menyertakan sppgId lain pada query -> 403", async () => {
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app).get("/api/distribusi?sppgId=sp2").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(403);
  });

  test("200 untuk PENGAWAS_GIZI menyertakan sppgId di dalam wilayah zonanya -> lolos", async () => {
    mockFindManyDist.mockResolvedValue([]);
    mockCountDist.mockResolvedValue(0);
    mockFindUniqueSppg.mockResolvedValue({ id: "sp1", provinsi: "Jawa Barat" });
    const token = tokenFor({ userId: "u1", username: "p", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat", namaLengkap: "P" });
    const r = await request(app).get("/api/distribusi?sppgId=sp1").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
    expect(mockFindUniqueSppg).toHaveBeenCalledWith({ where: { id: "sp1" }, select: { provinsi: true } });
  });

  test("403 untuk PENGAWAS_GIZI menyertakan sppgId di luar wilayah zonanya -> 403", async () => {
    mockFindUniqueSppg.mockResolvedValue({ id: "sp2", provinsi: "Jawa Timur" });
    const token = tokenFor({ userId: "u1", username: "p", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat", namaLengkap: "P" });
    const r = await request(app).get("/api/distribusi?sppgId=sp2").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(403);
  });
});

describe("GET /api/distribusi/:id", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
  });

  test("200 detail distribusi untuk admin", async () => {
    mockFindUnique.mockResolvedValue({ id: "d1", sppgId: "sp1", sppg: { provinsi: "Jawa Barat" } });
    const token = tokenFor({ userId: "u1", username: "admin", peran: "ADMIN", namaLengkap: "Admin" });
    const r = await request(app).get("/api/distribusi/d1").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
  });

  test("403 detail distribusi SPPG lain untuk operator", async () => {
    mockFindUnique.mockResolvedValue({ id: "d1", sppgId: "sp2", sppg: { provinsi: "Jawa Barat" } });
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app).get("/api/distribusi/d1").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(403);
  });
});

describe("PUT /api/distribusi/:id", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  test("200 update distribusi DRAFT oleh operator sendiri", async () => {
    mockFindUnique.mockResolvedValue({ id: "d1", sppgId: "sp1", status: "DRAFT", sppg: { kapasitasPorsiPerHari: 100 } });
    mockUpdate.mockResolvedValue({ id: "d1", totalPorsi: 50 });
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .put("/api/distribusi/d1")
      .set("Authorization", "Bearer " + token)
      .send({ porsiPesertaDidik: 50 });
    expect(r.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  test("422 update total porsi = 0", async () => {
    mockFindUnique.mockResolvedValue({ id: "d1", sppgId: "sp1", status: "DRAFT", sppg: { kapasitasPorsiPerHari: 100 } });
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app)
      .put("/api/distribusi/d1")
      .set("Authorization", "Bearer " + token)
      .send({ porsiPesertaDidik: 0 });
    expect(r.status).toBe(422);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/distribusi/:id", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockDelete.mockReset();
  });

  test("200 hapus DRAFT", async () => {
    mockFindUnique.mockResolvedValue({ id: "d1", sppgId: "sp1", status: "DRAFT" });
    mockDelete.mockResolvedValue({});
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app).delete("/api/distribusi/d1").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
  });

  test("422 hapus TERKONFIRMASI", async () => {
    mockFindUnique.mockResolvedValue({ id: "d1", sppgId: "sp1", status: "TERKONFIRMASI" });
    const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Op" });
    const r = await request(app).delete("/api/distribusi/d1").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(422);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

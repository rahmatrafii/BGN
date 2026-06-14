"use strict";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-min-32-chars-aaaaa";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-aaaaaaa";
process.env.DATA_ENCRYPTION_KEY = "unit-test-key-please-change-1234567890";

const mockFindUnique = jest.fn();
const mockFindManyDist = jest.fn();
const mockFindFirstDist = jest.fn();
const mockCountPenerima = jest.fn();

jest.mock("../../config/database", () => ({
  prisma: {
    sppg: {
      findUnique: (...a) => mockFindUnique(...a),
    },
    distribusiMbg: {
      findMany: (...a) => mockFindManyDist(...a),
      findFirst: (...a) => mockFindFirstDist(...a),
    },
    penerimaManfaat: {
      count: (...a) => mockCountPenerima(...a),
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

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { buildApp } = require("../../app");
const { ACCESS_SECRET } = require("../../config/jwt");

const app = buildApp();

function tokenFor(user) {
  return jwt.sign(user, ACCESS_SECRET, { expiresIn: "1h" });
}

describe("GET /api/sppg/:id", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockFindManyDist.mockReset();
    mockFindFirstDist.mockReset();
    mockCountPenerima.mockReset();
  });

  test("401 tanpa token", async () => {
    const r = await request(app).get("/api/sppg/sp1");
    expect(r.status).toBe(401);
  });

  test("200 untuk ADMIN mengakses SPPG mana pun", async () => {
    mockFindUnique.mockResolvedValue({ id: "sp1", namaSppg: "SPPG 1", kapasitasPorsiPerHari: 100 });
    mockFindManyDist.mockResolvedValue([]);
    mockFindFirstDist.mockResolvedValue(null);
    mockCountPenerima.mockResolvedValue(0);

    const token = tokenFor({ userId: "u1", username: "admin", peran: "ADMIN", namaLengkap: "Admin" });
    const r = await request(app).get("/api/sppg/sp1").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
    expect(mockFindUnique).toHaveBeenCalled();
  });

  test("200 untuk OPERATOR_SPPG mengakses SPPG-nya sendiri", async () => {
    mockFindUnique.mockResolvedValue({ id: "sp1", namaSppg: "SPPG 1", kapasitasPorsiPerHari: 100 });
    mockFindManyDist.mockResolvedValue([]);
    mockFindFirstDist.mockResolvedValue(null);
    mockCountPenerima.mockResolvedValue(0);

    const token = tokenFor({ userId: "u2", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Operator" });
    const r = await request(app).get("/api/sppg/sp1").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(200);
  });

  test("403 untuk OPERATOR_SPPG mengakses SPPG orang lain", async () => {
    const token = tokenFor({ userId: "u2", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1", namaLengkap: "Operator" });
    const r = await request(app).get("/api/sppg/sp2").set("Authorization", "Bearer " + token);
    expect(r.status).toBe(403);
  });
});

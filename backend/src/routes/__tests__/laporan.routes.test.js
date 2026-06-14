"use strict";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-min-32-chars-aaaaa";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-aaaaaaa";
process.env.DATA_ENCRYPTION_KEY = "unit-test-key-please-change-1234567890";

const mockCountSppg = jest.fn();
const mockFindManySppg = jest.fn();
const mockFindManyDistribusi = jest.fn();
const mockAggregateSppg = jest.fn();
const mockAggregateDistribusi = jest.fn();
const mockFindUniqueSppg = jest.fn();
const mockCountPenerima = jest.fn();
const mockFindManyPenerima = jest.fn();
const mockFindManyPemantauanGizi = jest.fn();

jest.mock("../../config/database", () => ({
  prisma: {
    sppg: {
      count: (...a) => mockCountSppg(...a),
      findMany: (...a) => mockFindManySppg(...a),
      aggregate: (...a) => mockAggregateSppg(...a),
      findUnique: (...a) => mockFindUniqueSppg(...a),
    },
    distribusiMbg: {
      findMany: (...a) => mockFindManyDistribusi(...a),
      aggregate: (...a) => mockAggregateDistribusi(...a),
    },
    penerimaManfaat: {
      count: (...a) => mockCountPenerima(...a),
      findMany: (...a) => mockFindManyPenerima(...a),
    },
    pemantauanGizi: {
      findMany: (...a) => mockFindManyPemantauanGizi(...a),
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

jest.mock("../../services/pdf.service", () => ({
  generatePdfBuffer: jest.fn(async () => Buffer.from("mocked-pdf-buffer")),
}));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { buildApp } = require("../../app");
const { ACCESS_SECRET } = require("../../config/jwt");

const app = buildApp();

function tokenFor(user) {
  return jwt.sign(user, ACCESS_SECRET, { expiresIn: "1h" });
}

describe("Laporan Routes Test Suite", () => {
  beforeEach(() => {
    mockCountSppg.mockReset();
    mockFindManySppg.mockReset();
    mockFindManyDistribusi.mockReset();
    mockAggregateSppg.mockReset();
    mockAggregateDistribusi.mockReset();
    mockFindUniqueSppg.mockReset();
    mockCountPenerima.mockReset();
    mockFindManyPenerima.mockReset();
    mockFindManyPemantauanGizi.mockReset();
  });

  describe("POST /api/laporan/kinerja-sppg/preview", () => {
    test("401 tanpa token", async () => {
      const r = await request(app).post("/api/laporan/kinerja-sppg/preview").send({});
      expect(r.status).toBe(401);
    });

    test("403 untuk OPERATOR_SPPG karena route dibatasi", async () => {
      const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1" });
      const r = await request(app)
        .post("/api/laporan/kinerja-sppg/preview")
        .set("Authorization", "Bearer " + token)
        .send({});
      expect(r.status).toBe(403);
    });

    test("200 untuk PENGAWAS_GIZI mengakses kinerja SPPG provinsinya sendiri", async () => {
      mockCountSppg.mockResolvedValue(1);
      mockFindManySppg.mockResolvedValue([
        {
          id: "sp1",
          kodeSppg: "SP1",
          namaSppg: "SPPG 1",
          provinsi: "Jawa Barat",
          kapasitasPorsiPerHari: 100,
          statusAktif: true,
          _count: { penerimaManfaat: 50 },
        },
      ]);
      mockFindManyDistribusi.mockResolvedValue([]);
      mockAggregateSppg.mockResolvedValue({ _sum: { kapasitasPorsiPerHari: 100 } });
      mockAggregateDistribusi.mockResolvedValue({ _sum: { totalPorsi: 0 }, _count: { _all: 0 } });

      const token = tokenFor({ userId: "u2", username: "pengawas", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat" });
      const r = await request(app)
        .post("/api/laporan/kinerja-sppg/preview")
        .set("Authorization", "Bearer " + token)
        .send({ provinsi: "Jawa Barat" });

      expect(r.status).toBe(200);
      expect(mockCountSppg).toHaveBeenCalledWith({
        where: { statusAktif: true, provinsi: "Jawa Barat" },
      });
    });

    test("403 untuk PENGAWAS_GIZI mencoba mengakses provinsi lain", async () => {
      const token = tokenFor({ userId: "u2", username: "pengawas", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat" });
      const r = await request(app)
        .post("/api/laporan/kinerja-sppg/preview")
        .set("Authorization", "Bearer " + token)
        .send({ provinsi: "Jawa Timur" });

      expect(r.status).toBe(403);
    });

    test("200 untuk PENGAWAS_GIZI dengan sppgId di dalam zonanya sendiri", async () => {
      mockFindUniqueSppg.mockResolvedValue({ id: "sp1", provinsi: "Jawa Barat" });
      mockCountSppg.mockResolvedValue(1);
      mockFindManySppg.mockResolvedValue([
        {
          id: "sp1",
          kodeSppg: "SP1",
          namaSppg: "SPPG 1",
          provinsi: "Jawa Barat",
          kapasitasPorsiPerHari: 100,
          statusAktif: true,
          _count: { penerimaManfaat: 50 },
        },
      ]);
      mockFindManyDistribusi.mockResolvedValue([]);
      mockAggregateSppg.mockResolvedValue({ _sum: { kapasitasPorsiPerHari: 100 } });
      mockAggregateDistribusi.mockResolvedValue({ _sum: { totalPorsi: 0 }, _count: { _all: 0 } });

      const token = tokenFor({ userId: "u2", username: "pengawas", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat" });
      const r = await request(app)
        .post("/api/laporan/kinerja-sppg/preview")
        .set("Authorization", "Bearer " + token)
        .send({ sppgId: "sp1" });

      expect(r.status).toBe(200);
    });

    test("403 untuk PENGAWAS_GIZI dengan sppgId di luar zonanya", async () => {
      mockFindUniqueSppg.mockResolvedValue({ id: "sp2", provinsi: "Jawa Timur" });

      const token = tokenFor({ userId: "u2", username: "pengawas", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat" });
      const r = await request(app)
        .post("/api/laporan/kinerja-sppg/preview")
        .set("Authorization", "Bearer " + token)
        .send({ sppgId: "sp2" });

      expect(r.status).toBe(403);
    });
  });

  describe("POST /api/laporan/distribusi/preview", () => {
    test("200 untuk OPERATOR_SPPG mengakses distribusi SPPG milik sendiri", async () => {
      mockFindManyDistribusi.mockResolvedValue([]);
      mockFindManySppg.mockResolvedValue([]);
      const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1" });
      const r = await request(app)
        .post("/api/laporan/distribusi/preview")
        .set("Authorization", "Bearer " + token)
        .send({ sppgId: "sp1" });

      expect(r.status).toBe(200);
      expect(mockFindManyDistribusi).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });

    test("403 untuk OPERATOR_SPPG mengakses distribusi SPPG lain", async () => {
      const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1" });
      const r = await request(app)
        .post("/api/laporan/distribusi/preview")
        .set("Authorization", "Bearer " + token)
        .send({ sppgId: "sp2" });

      expect(r.status).toBe(403);
      expect(mockFindManyDistribusi).not.toHaveBeenCalled();
    });

    test("403 untuk PENGAWAS_GIZI mengakses distribusi provinsi lain", async () => {
      const token = tokenFor({ userId: "u2", username: "pengawas", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat" });
      const r = await request(app)
        .post("/api/laporan/distribusi/preview")
        .set("Authorization", "Bearer " + token)
        .send({ provinsi: "Jawa Timur" });

      expect(r.status).toBe(403);
    });

    test("403 untuk OPERATOR_SPPG tanpa sppgId (unbound) mengakses distribusi", async () => {
      const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: null });
      const r = await request(app)
        .post("/api/laporan/distribusi/preview")
        .set("Authorization", "Bearer " + token)
        .send({});

      expect(r.status).toBe(403);
      expect(r.body.code).toBe("NO_SPPG_BINDING");
    });
  });

  describe("POST /api/laporan/distribusi/pdf", () => {
    test("200 untuk OPERATOR_SPPG mengakses distribusi PDF SPPG milik sendiri", async () => {
      mockFindManyDistribusi.mockResolvedValue([]);
      mockFindManySppg.mockResolvedValue([]);
      const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1" });
      const r = await request(app)
        .post("/api/laporan/distribusi/pdf")
        .set("Authorization", "Bearer " + token)
        .send({ sppgId: "sp1" });

      expect(r.status).toBe(200);
      expect(r.header["content-type"]).toBe("application/pdf");
      expect(mockFindManyDistribusi).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50000,
        })
      );
    });

    test("403 untuk OPERATOR_SPPG tanpa sppgId (unbound) mengakses pdf", async () => {
      const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: null });
      const r = await request(app)
        .post("/api/laporan/distribusi/pdf")
        .set("Authorization", "Bearer " + token)
        .send({});

      expect(r.status).toBe(403);
      expect(r.body.code).toBe("NO_SPPG_BINDING");
    });
  });

  describe("POST /api/laporan/status-gizi/preview", () => {
    test("200 untuk PENGAWAS_GIZI status gizi provinsi sendiri", async () => {
      mockFindManyPemantauanGizi.mockResolvedValue([]);
      mockFindManySppg.mockResolvedValue([]);
      const token = tokenFor({ userId: "u2", username: "pengawas", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat" });
      const r = await request(app)
        .post("/api/laporan/status-gizi/preview")
        .set("Authorization", "Bearer " + token)
        .send({ provinsi: "Jawa Barat" });

      expect(r.status).toBe(200);
      expect(mockFindManyPemantauanGizi).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });

    test("200 untuk PENGAWAS_GIZI status gizi provinsi sendiri dengan data zscoreBbTb", async () => {
      mockFindManyPemantauanGizi.mockResolvedValue([
        {
          id: "pg1",
          penerimaId: "p1",
          tanggalPengukuran: new Date(),
          beratBadanKg: 12.5,
          tinggiBadanCm: 88.0,
          lilaCm: null,
          zscoreBbU: 0.1,
          zscoreTbU: -0.2,
          zscoreBbTb: 0.35,
          statusGizi: "GIZI_BAIK",
          stunting: false,
          penerima: {
            namaLengkap: "Budi",
            nikMasked: "************1234",
            kategori: "BALITA",
            sppg: { namaSppg: "SPPG 1", provinsi: "Jawa Barat" },
          },
        },
      ]);
      const token = tokenFor({ userId: "u2", username: "pengawas", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat" });
      const r = await request(app)
        .post("/api/laporan/status-gizi/preview")
        .set("Authorization", "Bearer " + token)
        .send({ provinsi: "Jawa Barat" });

      expect(r.status).toBe(200);
      expect(r.body.data.rows[0].zscoreBbTb).toBe(0.35);
    });

    test("403 untuk PENGAWAS_GIZI status gizi provinsi lain", async () => {
      const token = tokenFor({ userId: "u2", username: "pengawas", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat" });
      const r = await request(app)
        .post("/api/laporan/status-gizi/preview")
        .set("Authorization", "Bearer " + token)
        .send({ provinsi: "Jawa Timur" });

      expect(r.status).toBe(403);
    });

    test("200 untuk PENGAWAS_GIZI dengan filter kategori tertentu", async () => {
      mockFindManyPemantauanGizi.mockResolvedValue([]);
      mockFindManySppg.mockResolvedValue([]);
      const token = tokenFor({ userId: "u2", username: "pengawas", peran: "PENGAWAS_GIZI", wilayahZona: "Jawa Barat" });
      const r = await request(app)
        .post("/api/laporan/status-gizi/preview")
        .set("Authorization", "Bearer " + token)
        .send({ provinsi: "Jawa Barat", kategori: "BALITA" });

      expect(r.status).toBe(200);
      expect(mockFindManyPemantauanGizi).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            penerima: expect.objectContaining({
              kategori: "BALITA",
            }),
          }),
        })
      );
    });
  });

  describe("POST /api/laporan/penerima/preview", () => {
    test("200 untuk OPERATOR_SPPG penerima manfaat SPPG sendiri", async () => {
      mockCountPenerima.mockResolvedValue(0);
      mockFindManyPenerima.mockResolvedValue([]);
      mockFindManySppg.mockResolvedValue([]);
      const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1" });
      const r = await request(app)
        .post("/api/laporan/penerima/preview")
        .set("Authorization", "Bearer " + token)
        .send({ sppgId: "sp1" });

      expect(r.status).toBe(200);
      expect(mockFindManyPenerima).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sppgId: "sp1",
          }),
        })
      );
    });

    test("200 untuk OPERATOR_SPPG penerima manfaat dengan query pencarian (search)", async () => {
      mockCountPenerima.mockResolvedValue(0);
      mockFindManyPenerima.mockResolvedValue([]);
      mockFindManySppg.mockResolvedValue([]);
      const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1" });
      const r = await request(app)
        .post("/api/laporan/penerima/preview")
        .set("Authorization", "Bearer " + token)
        .send({ sppgId: "sp1", search: "Ahmad" });

      expect(r.status).toBe(200);
      expect(mockFindManyPenerima).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sppgId: "sp1",
            OR: [
              { namaLengkap: { contains: "Ahmad", mode: "insensitive" } },
              { nikMasked: { contains: "Ahmad", mode: "insensitive" } },
            ],
          }),
        })
      );
    });

    test("403 untuk OPERATOR_SPPG penerima manfaat SPPG lain", async () => {
      const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: "sp1" });
      const r = await request(app)
        .post("/api/laporan/penerima/preview")
        .set("Authorization", "Bearer " + token)
        .send({ sppgId: "sp2" });

      expect(r.status).toBe(403);
    });

    test("403 untuk OPERATOR_SPPG tanpa sppgId (unbound) mengakses penerima manfaat", async () => {
      const token = tokenFor({ userId: "u1", username: "op", peran: "OPERATOR_SPPG", sppgId: null });
      const r = await request(app)
        .post("/api/laporan/penerima/preview")
        .set("Authorization", "Bearer " + token)
        .send({});

      expect(r.status).toBe(403);
      expect(r.body.code).toBe("NO_SPPG_BINDING");
    });
  });
});

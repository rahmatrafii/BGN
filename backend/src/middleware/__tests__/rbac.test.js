"use strict";

jest.mock("../../config/database", () => ({
  prisma: { sppg: { findUnique: jest.fn() } },
}));

const { requireRole, buildSppgFilter, requireSppgAccess } = require("../rbac");
const { prisma } = require("../../config/database");

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("requireRole", () => {
  test("tanpa user -> 401", () => {
    const next = jest.fn();
    const res = mockRes();
    requireRole("ADMIN")({}, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("user dengan peran tidak sesuai -> 403", () => {
    const next = jest.fn();
    const res = mockRes();
    requireRole("ADMIN")({ user: { peran: "OPERATOR_SPPG" } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("peran sesuai -> next()", () => {
    const next = jest.fn();
    const res = mockRes();
    requireRole("ADMIN", "OPERATOR_SPPG")({ user: { peran: "OPERATOR_SPPG" } }, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("buildSppgFilter", () => {
  test("ADMIN tidak filter", () => {
    expect(buildSppgFilter({ peran: "ADMIN" })).toEqual({});
  });
  test("OPERATOR -> filter sppgId sendiri", () => {
    expect(buildSppgFilter({ peran: "OPERATOR_SPPG", sppgId: "sp1" })).toEqual({ sppgId: "sp1" });
  });
  test("PENGAWAS_GIZI -> filter zona provinsi", () => {
    expect(buildSppgFilter({ peran: "PENGAWAS_GIZI", wilayahZona: "DKI Jakarta" })).toEqual({ sppg: { provinsi: "DKI Jakarta" } });
  });
});

describe("requireSppgAccess", () => {
  beforeEach(() => jest.clearAllMocks());

  test("ADMIN langsung lolos", async () => {
    const next = jest.fn();
    await requireSppgAccess({ user: { peran: "ADMIN" }, params: {}, body: {}, query: {} }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test("OPERATOR akses SPPG sendiri -> lolos", async () => {
    const next = jest.fn();
    await requireSppgAccess({ user: { peran: "OPERATOR_SPPG", sppgId: "sp1" }, params: { sppgId: "sp1" }, body: {}, query: {} }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test("OPERATOR akses SPPG lain -> 403", async () => {
    const next = jest.fn();
    const res = mockRes();
    await requireSppgAccess({ user: { peran: "OPERATOR_SPPG", sppgId: "sp1" }, params: { sppgId: "sp2" }, body: {}, query: {} }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test("PENGAWAS akses SPPG di luar zona -> 403", async () => {
    prisma.sppg.findUnique.mockResolvedValue({ id: "sp1", provinsi: "Jawa Barat" });
    const res = mockRes();
    const next = jest.fn();
    await requireSppgAccess(
      { user: { peran: "PENGAWAS_GIZI", wilayahZona: "DKI Jakarta" }, params: { sppgId: "sp1" }, body: {}, query: {} },
      res,
      next
    );
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test("OPERATOR akses SPPG sendiri via baseUrl /api/sppg dan params.id -> lolos", async () => {
    const next = jest.fn();
    await requireSppgAccess(
      { user: { peran: "OPERATOR_SPPG", sppgId: "sp1" }, baseUrl: "/api/sppg", params: { id: "sp1" }, body: {}, query: {} },
      mockRes(),
      next
    );
    expect(next).toHaveBeenCalled();
  });

  test("OPERATOR akses SPPG lain via baseUrl /api/sppg dan params.id -> 403", async () => {
    const next = jest.fn();
    const res = mockRes();
    await requireSppgAccess(
      { user: { peran: "OPERATOR_SPPG", sppgId: "sp1" }, baseUrl: "/api/sppg", params: { id: "sp2" }, body: {}, query: {} },
      res,
      next
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

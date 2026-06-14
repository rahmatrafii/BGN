"use strict";

const { prisma } = require("../config/database");

function requireRole(...roles) {
  const allowed = new Set(roles);
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Tidak terautentikasi",
        code: "UNAUTHENTICATED",
      });
    }
    if (!allowed.has(req.user.peran)) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses ke fitur ini",
        code: "FORBIDDEN",
      });
    }
    next();
  };
}

async function resolveSppgId(req) {
  let sppgId =
    req.params.sppgId ||
    req.body.sppgId ||
    req.query.sppgId;

  if (!sppgId && req.baseUrl && req.baseUrl.includes("/sppg") && req.params.id) {
    sppgId = req.params.id;
  }

  return sppgId || null;
}

async function requireSppgAccess(req, res, next) {
  try {
    const peran = req.user && req.user.peran;
    if (!peran) {
      return res.status(401).json({
        success: false,
        message: "Tidak terautentikasi",
        code: "UNAUTHENTICATED",
      });
    }

    if (peran === "ADMIN" || peran === "PEJABAT_BGN") return next();

    const sppgId = await resolveSppgId(req);

    if (peran === "OPERATOR_SPPG" || peran === "ASISTEN_LAPANGAN") {
      if (!req.user.sppgId) {
        return res.status(403).json({
          success: false,
          message: "Akun belum terhubung dengan SPPG",
          code: "NO_SPPG_BINDING",
        });
      }
      if (sppgId && sppgId !== req.user.sppgId) {
        return res.status(403).json({
          success: false,
          message: "Anda hanya boleh mengakses data SPPG sendiri",
          code: "FORBIDDEN_SPPG",
        });
      }
      return next();
    }

    if (peran === "PENGAWAS_GIZI") {
      if (!req.user.wilayahZona) {
        return res.status(403).json({
          success: false,
          message: "Akun belum terhubung dengan wilayah/zona",
          code: "NO_ZONA",
        });
      }
      if (sppgId) {
        const sppg = await prisma.sppg.findUnique({ where: { id: sppgId } });
        if (!sppg) {
          return res.status(404).json({
            success: false,
            message: "SPPG tidak ditemukan",
            code: "NOT_FOUND",
          });
        }
        if (sppg.provinsi !== req.user.wilayahZona) {
          return res.status(403).json({
            success: false,
            message: "SPPG di luar zona pengawasan Anda",
            code: "FORBIDDEN_ZONA",
          });
        }
      }
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Akses ditolak",
      code: "FORBIDDEN",
    });
  } catch (err) {
    next(err);
  }
}

function buildSppgFilter(user) {
  const peran = user && user.peran;
  if (peran === "ADMIN" || peran === "PEJABAT_BGN") return {};
  if (peran === "OPERATOR_SPPG" || peran === "ASISTEN_LAPANGAN") {
    return { sppgId: user.sppgId };
  }
  if (peran === "PENGAWAS_GIZI") {
    return { sppg: { provinsi: user.wilayahZona } };
  }
  return { id: "__none__" };
}

module.exports = { requireRole, requireSppgAccess, buildSppgFilter };

"use strict";

const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { uploadExcel } = require("../middleware/upload");
const ctrl = require("../controllers/penerima.controller");

router.use(verifyToken);

router.get("/template-excel", requireRole("ADMIN", "OPERATOR_SPPG"), ctrl.templateExcel);
router.post(
  "/import",
  requireRole("ADMIN", "OPERATOR_SPPG"),
  uploadExcel.single("file"),
  ctrl.importExcel
);

router.get("/", requireRole("ADMIN", "PEJABAT_BGN", "PENGAWAS_GIZI", "OPERATOR_SPPG", "ASISTEN_LAPANGAN"), ctrl.listPenerima);
router.post("/", requireRole("ADMIN", "OPERATOR_SPPG"), ctrl.buatPenerima);
router.get("/satuan-pendidikan", requireRole("ADMIN", "PEJABAT_BGN", "PENGAWAS_GIZI", "OPERATOR_SPPG", "ASISTEN_LAPANGAN"), ctrl.listSatuanPendidikan);
router.get("/:id", requireRole("ADMIN", "PEJABAT_BGN", "PENGAWAS_GIZI", "OPERATOR_SPPG", "ASISTEN_LAPANGAN"), ctrl.detailPenerima);
router.put("/:id", requireRole("ADMIN", "OPERATOR_SPPG"), ctrl.updatePenerima);
router.delete("/:id", requireRole("ADMIN", "OPERATOR_SPPG"), ctrl.nonaktifkanPenerima);
router.patch("/:id/aktifkan", requireRole("ADMIN", "OPERATOR_SPPG"), ctrl.aktifkanPenerima);

module.exports = router;

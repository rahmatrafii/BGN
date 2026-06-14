"use strict";

const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { uploadDistribusi } = require("../middleware/upload");
const ctrl = require("../controllers/distribusi.controller");

router.use(verifyToken);

router.get("/kalkulasi-anggaran", requireRole("ADMIN", "PEJABAT_BGN", "PENGAWAS_GIZI"), ctrl.kalkulasiAnggaran);
router.get("/alert-belum-lapor", ctrl.alertBelumLapor);

router.get("/", ctrl.listDistribusi);
router.post("/", requireRole("OPERATOR_SPPG", "ASISTEN_LAPANGAN", "ADMIN"), ctrl.buatDistribusi);
router.get("/:id", requireRole("ADMIN", "PEJABAT_BGN", "PENGAWAS_GIZI", "OPERATOR_SPPG", "ASISTEN_LAPANGAN"), ctrl.detailDistribusi);
router.put("/:id", requireRole("ADMIN", "OPERATOR_SPPG", "ASISTEN_LAPANGAN"), ctrl.updateDistribusi);
router.delete("/:id", requireRole("ADMIN", "OPERATOR_SPPG", "ASISTEN_LAPANGAN"), ctrl.hapusDistribusi);
router.post(
  "/:id/upload-bukti",
  requireRole("OPERATOR_SPPG", "ASISTEN_LAPANGAN", "ADMIN"),
  uploadDistribusi.single("foto"),
  ctrl.uploadBukti
);
router.patch("/:id/konfirmasi", requireRole("PENGAWAS_GIZI", "ADMIN"), ctrl.konfirmasiDistribusi);
router.patch("/:id/validasi", requireRole("PENGAWAS_GIZI", "ADMIN"), ctrl.validasiDistribusi);

module.exports = router;

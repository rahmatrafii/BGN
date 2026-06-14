"use strict";

const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const ctrl = require("../controllers/gizi.controller");

router.use(verifyToken);

router.get("/standar-akg", ctrl.standarAKG);
router.post("/", requireRole("PENGAWAS_GIZI", "OPERATOR_SPPG", "ADMIN"), ctrl.buatPemantauan);
router.get("/penerima/:penerimaId", ctrl.riwayatPenerima);
router.get("/prevalensi", requireRole("PENGAWAS_GIZI", "ADMIN", "PEJABAT_BGN", "OPERATOR_SPPG"), ctrl.prevalensi);

module.exports = router;

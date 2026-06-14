"use strict";

const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth");
const { requireRole, requireSppgAccess } = require("../middleware/rbac");
const ctrl = require("../controllers/sppg.controller");

router.use(verifyToken);

router.get("/export-geojson", ctrl.exportGeoJSON);
router.get("/provinsi-list", ctrl.provinsiList);

router.get("/", ctrl.listSppg);
router.post("/", requireRole("ADMIN"), ctrl.buatSppg);
router.get("/:id", requireSppgAccess, ctrl.detailSppg);
router.put("/:id", requireRole("ADMIN"), ctrl.updateSppg);
router.patch("/:id/status", requireRole("ADMIN"), ctrl.toggleStatusSppg);

module.exports = router;

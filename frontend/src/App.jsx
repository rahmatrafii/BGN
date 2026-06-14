import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import ProtectedRoute from "./components/common/ProtectedRoute.jsx";
import MainLayout from "./components/layout/MainLayout.jsx";

import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import PenerimaListPage from "./pages/PenerimaListPage.jsx";
import PenerimaFormPage from "./pages/PenerimaFormPage.jsx";
import PenerimaDetailPage from "./pages/PenerimaDetailPage.jsx";
import SppgListPage from "./pages/SppgListPage.jsx";
import SppgFormPage from "./pages/SppgFormPage.jsx";
import SppgDetailPage from "./pages/SppgDetailPage.jsx";
import DistribusiListPage from "./pages/DistribusiListPage.jsx";
import DistribusiFormPage from "./pages/DistribusiFormPage.jsx";
import GiziListPage from "./pages/GiziListPage.jsx";
import GiziFormPage from "./pages/GiziFormPage.jsx";
import LaporanPage from "./pages/LaporanPage.jsx";
import PenggunaPage from "./pages/PenggunaPage.jsx";
import ProfilPage from "./pages/ProfilPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import RegisterSppgPage from "./pages/RegisterSppgPage.jsx";

export default function App() {
  return (
    <div>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register-sppg" element={<RegisterSppgPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />

        <Route path="penerima" element={<PenerimaListPage />} />
        <Route path="penerima/tambah" element={<PenerimaFormPage />} />
        <Route path="penerima/:id" element={<PenerimaDetailPage />} />
        <Route path="penerima/:id/edit" element={<PenerimaFormPage />} />

        <Route
          path="sppg"
          element={
            <ProtectedRoute roles={["ADMIN", "PEJABAT_BGN", "PENGAWAS_GIZI"]}>
              <SppgListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="sppg/tambah"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <SppgFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="sppg/:id"
          element={
            <ProtectedRoute roles={["ADMIN", "PEJABAT_BGN", "PENGAWAS_GIZI"]}>
              <SppgDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="sppg/:id/edit"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <SppgFormPage />
            </ProtectedRoute>
          }
        />

        <Route path="distribusi" element={<DistribusiListPage />} />
        <Route path="distribusi/input" element={<DistribusiFormPage />} />
        <Route path="distribusi/:id/edit" element={<DistribusiFormPage />} />

        <Route path="gizi" element={<GiziListPage />} />
        <Route
          path="gizi/input"
          element={
            <ProtectedRoute roles={["ADMIN", "PENGAWAS_GIZI", "OPERATOR_SPPG"]}>
              <GiziFormPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="laporan"
          element={
            <ProtectedRoute roles={["ADMIN", "PEJABAT_BGN", "PENGAWAS_GIZI", "OPERATOR_SPPG"]}>
              <LaporanPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="pengguna"
          element={
            <ProtectedRoute roles={["ADMIN"]}>
              <PenggunaPage />
            </ProtectedRoute>
          }
        />

          <Route path="profil" element={<ProfilPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

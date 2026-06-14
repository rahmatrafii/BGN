import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ConfigProvider, App as AntApp } from "antd";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(), // deprecated
      removeListener: jest.fn(), // deprecated
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
});

jest.mock("recharts", () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
  AreaChart: ({ children }) => <div>{children}</div>,
  Area: () => null,
  PieChart: ({ children }) => <div>{children}</div>,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  CartesianGrid: () => null,
}));

jest.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  CircleMarker: () => null,
  Popup: () => null,
}));

jest.mock("html2canvas", () => () => ({ toDataURL: () => "data:image/png;base64,abc" }));

jest.mock("../api/publicData.api", () => ({
  getRingkasanPublik: jest.fn().mockResolvedValue({ data: [] }),
  getRealtimeSummary: jest.fn().mockResolvedValue({ data: null }),
  createRealtimeStream: jest.fn().mockReturnValue({ close: jest.fn() }),
}));

jest.mock("../api/dashboard.api", () => ({
  getStatistik: jest.fn(),
  getTrenDistribusi: jest.fn(),
  getSebaranSppg: jest.fn(),
  getDistribusiKategori: jest.fn(),
  getAlert: jest.fn(),
}));

import * as dashApi from "../api/dashboard.api";
import DashboardPage from "../pages/DashboardPage";

function renderDash() {
  return render(
    <ConfigProvider>
      <AntApp>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </AntApp>
    </ConfigProvider>
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    dashApi.getStatistik.mockResolvedValue({
      data: { totalPenerima: 1000, distribusiHariIni: 800, persentaseCakupan: 80, jumlahSppgAktif: 5, perubahanDistribusi: 10, alertGiziBuruk: 3 },
    });
    dashApi.getTrenDistribusi.mockResolvedValue({ data: [] });
    dashApi.getSebaranSppg.mockResolvedValue({ data: [] });
    dashApi.getDistribusiKategori.mockResolvedValue({ data: { PESERTA_DIDIK: 500, BALITA: 300, IBU_HAMIL: 100, IBU_MENYUSUI: 100 } });
    dashApi.getAlert.mockResolvedValue({ data: { sppgBelumLapor: [], sppgRealisasiRendah: [], penerimaGiziBermasalah: [] } });
  });

  test("merender judul Dashboard", async () => {
    renderDash();
    expect(screen.getByText(/Dashboard SIPGN-BGN/i)).toBeInTheDocument();
  });

  test("memuat statistik dan menampilkan total penerima", async () => {
    renderDash();
    await waitFor(() => {
      expect(dashApi.getStatistik).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText(/Total Penerima Manfaat/i)).toBeInTheDocument();
    });
  });
});

import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  Row,
  Col,
  Card,
  Statistic,
  Spin,
  Skeleton,
  Tag,
  Button,
  Progress,
  List,
  Empty,
  Alert,
  Space,
  Grid,
  theme as antdTheme,
  Tooltip,
  message,
} from "antd";
import {
  TeamOutlined,
  ShoppingOutlined,
  BankOutlined,
  AlertOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ReloadOutlined,
  DownloadOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import dayjs from "dayjs";
import html2canvas from "html2canvas";

import PageHeader from "../components/layout/PageHeader";
import * as dashApi from "../api/dashboard.api";
import * as publicDataApi from "../api/publicData.api";
import { useAuthStore } from "../store/authStore";

const RANGE_OPTIONS = [
  { value: 7, label: "7 Hari" },
  { value: 30, label: "30 Hari" },
  { value: 90, label: "90 Hari" },
];

const KATEGORI_COLOR = {
  PESERTA_DIDIK: "#1B3A6B",
  BALITA: "#52c41a",
  IBU_HAMIL: "#fa8c16",
  IBU_MENYUSUI: "#722ed1",
};

const KATEGORI_LABEL = {
  PESERTA_DIDIK: "Peserta Didik",
  BALITA: "Balita",
  IBU_HAMIL: "Ibu Hamil",
  IBU_MENYUSUI: "Ibu Menyusui",
};

export default function DashboardPage() {
  const { hasRole } = useAuthStore();
  const { token } = antdTheme.useToken();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const trendChartHeight = isMobile ? 240 : 320;
  const pieChartHeight = isMobile ? 240 : 280;
  const mapHeight = isMobile ? 320 : 420;
  const alertHeight = isMobile ? "auto" : 420;
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stat, setStat] = useState(null);
  const [tren, setTren] = useState([]);
  const [range, setRange] = useState(30);
  const [sebaran, setSebaran] = useState([]);
  const [kategori, setKategori] = useState({});
  const [alert, setAlert] = useState({ sppgBelumLapor: [], sppgRealisasiRendah: [], penerimaGiziBermasalah: [] });
  const [indikatorPublik, setIndikatorPublik] = useState([]);
  const [realtimeSummary, setRealtimeSummary] = useState(null);
  const [streamStatus, setStreamStatus] = useState("Menghubungkan...");
  const [terakhir, setTerakhir] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncDummyLoading, setSyncDummyLoading] = useState(false);
  const [syncCronLoading, setSyncCronLoading] = useState(false);
  const [backfill30dLoading, setBackfill30dLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [lastSyncSummary, setLastSyncSummary] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, t, sb, k, a] = await Promise.all([
        dashApi.getStatistik(),
        dashApi.getTrenDistribusi(range),
        dashApi.getSebaranSppg(),
        dashApi.getDistribusiKategori(),
        dashApi.getAlert(),
      ]);
      const sppgs = sb.data || [];
      const provinsiFilter = hasRole("OPERATOR_SPPG") ? sppgs[0]?.provinsi : undefined;
      const publik = await publicDataApi.getRingkasanPublik(dayjs().year(), provinsiFilter);
      const realtime = await publicDataApi.getRealtimeSummary();
      setStat(s.data);
      setTren(t.data);
      setSebaran(sb.data);
      setKategori(k.data);
      setAlert(a.data);
      setIndikatorPublik((publik && publik.data) || []);
      setRealtimeSummary((realtime && realtime.data) || null);
      setTerakhir(new Date());
    } catch (err) {
      setError((err.response && err.response.data && err.response.data.message) || "Gagal memuat dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => {
    const es = publicDataApi.createRealtimeStream(
      (type, payloadRaw) => {
        if (type === "batch") {
          try {
            const payload = JSON.parse(payloadRaw);
            const mapped = {};
            (payload.values || []).forEach((v) => {
              mapped[v.metricKey] = (mapped[v.metricKey] || 0) + Number(v.delta || 0);
            });
            setRealtimeSummary({
              timezone: payload.timezone || "Asia/Jakarta",
              updatedAt: payload.generatedAt || new Date().toISOString(),
              values: mapped,
            });
          } catch (_) {}
        }
        setStreamStatus("Live");
      },
      () => setStreamStatus("Terputus")
    );
    return () => es && es.close();
  }, []);

  const cakupanColor = useMemo(() => {
    const v = (stat && stat.persentaseCakupan) || 0;
    if (v >= 80) return "#52c41a";
    if (v >= 60) return "#faad14";
    return "#ff4d4f";
  }, [stat]);

  const pieData = useMemo(
    () =>
      Object.entries(kategori || {}).map(([k, v]) => ({
        name: KATEGORI_LABEL[k] || k,
        value: v,
        color: KATEGORI_COLOR[k] || "#8884d8",
      })),
    [kategori]
  );
  const totalKategori = pieData.reduce((s, x) => s + (x.value || 0), 0);

  const onUnduh = async () => {
    if (!containerRef.current) return;
    const canvas = await html2canvas(containerRef.current, { scale: 2, useCORS: true });
    const a = document.createElement("a");
    a.download = "Dashboard_SIPGN_" + dayjs().format("YYYYMMDD_HHmm") + ".png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  const onSyncScrape = async () => {
    setSyncLoading(true);
    try {
      const r = await publicDataApi.syncScrapeData();
      if (r && r.data && r.data.skipped) {
        setError("Sinkron sedang berjalan, coba lagi sebentar.");
      } else {
        setError(null);
      }
      await fetchAll();
    } catch (err) {
      setError((err.response && err.response.data && err.response.data.message) || "Sinkron data gagal");
    } finally {
      setSyncLoading(false);
    }
  };

  const onSyncDummy = async () => {
    setSyncDummyLoading(true);
    setError(null);
    try {
      const r = await publicDataApi.syncDummyNutritionData();
      const data = r && r.data;
      if (data && data.skipped) {
        setError("Generator data dummy sedang berjalan, coba lagi sebentar.");
      } else if (data) {
        setLastSyncSummary({
          jenis: "dummy",
          totalPorsiGenerated: data.totalPorsiGenerated,
          totalPorsiKemarin: data.totalPorsiKemarin,
          totalPorsiBesok: data.totalPorsiBesok,
          totalPemantauanInserted: data.totalPemantauanInserted,
          totalSppgUpdated: data.totalSppgUpdated,
          daysGenerated: data.daysGenerated,
          trigger: data.trigger,
        });
      }
      await fetchAll();
    } catch (err) {
      const code = err.response && err.response.status;
      const msg = (err.response && err.response.data && err.response.data.message) || "Generate data dummy gagal";
      setError(code === 401 || code === 403 ? msg + " (perlu login ulang?)" : msg);
    } finally {
      setSyncDummyLoading(false);
    }
  };

  const onSyncCron = async () => {
    setSyncCronLoading(true);
    setError(null);
    try {
      const r = await publicDataApi.triggerDailyCron();
      const data = r && r.data;
      if (data) {
        setLastSyncSummary({
          jenis: "cron",
          ok: data.ok,
          totalMs: data.totalMs,
          steps: data.steps,
          trigger: data.trigger,
        });
      }
      await fetchAll();
    } catch (err) {
      const code = err.response && err.response.status;
      const msg = (err.response && err.response.data && err.response.data.message) || "Trigger cron gagal";
      setError(code === 401 || code === 403 ? msg + " (perlu login ulang?)" : msg);
    } finally {
      setSyncCronLoading(false);
    }
  };

  const onBackfill30d = async () => {
    setBackfill30dLoading(true);
    setError(null);
    try {
      // Run backfill in chunks of 7 days to avoid Vercel Hobby timeout (5 min limit)
      const CHUNK_DAYS = 7;
      const TOTAL_DAYS = 30;
      let allOk = true;
      let totalMs = 0;
      let allSteps = {};
      
      for (let i = 0; i < TOTAL_DAYS; i += CHUNK_DAYS) {
        const days = Math.min(CHUNK_DAYS, TOTAL_DAYS - i);
        const r = await publicDataApi.backfill30d(days);
        const data = r && r.data;
        if (data) {
          allOk = allOk && data.ok;
          totalMs += data.totalMs || 0;
          allSteps["chunk_" + i] = data.steps;
          setLastSyncSummary({
            jenis: "backfill_30d",
            ok: allOk,
            backfillDays: i + days,
            totalMs,
            steps: allSteps,
            trigger: data.trigger,
          });
        }
      }
      await fetchAll();
    } catch (err) {
      const code = err.response && err.response.status;
      const msg = (err.response && err.response.data && err.response.data.message) || "Backfill 30 hari gagal";
      setError(code === 401 || code === 403 ? msg + " (perlu login ulang?)" : msg);
    } finally {
      setBackfill30dLoading(false);
    }
  };

  const onReset = async () => {
    // Double confirm: butuh klik 2x
    if (!window.confirm("PERINGATAN: Tindakan ini akan menghapus SEMUA data dummy (distribusi, pemantauan, realtime metric). Data master (penerima, SPPG, pengguna) TIDAK dihapus. Lanjutkan?")) return;
    if (!window.confirm("Konfirmasi kedua: Anda YAKIN ingin reset? Tindakan ini tidak dapat dibatalkan.")) return;
    setResetLoading(true);
    setError(null);
    try {
      const r = await publicDataApi.resetDistribusi("all");
      const data = r && r.data;
      setLastSyncSummary({
        jenis: "reset",
        ok: data.ok,
        mode: data.mode,
        totalMs: data.totalMs,
        steps: data.steps,
        trigger: data.trigger,
      });
      // Setelah reset, langsung populate data baru (chunked 7 hari sekali)
      message.success("Reset selesai. Memulai backfill 30 hari...");
      const CHUNK_DAYS = 7;
      const TOTAL_DAYS = 30;
      let allOk = true;
      let totalMs = 0;
      for (let i = 0; i < TOTAL_DAYS; i += CHUNK_DAYS) {
        const days = Math.min(CHUNK_DAYS, TOTAL_DAYS - i);
        const r2 = await publicDataApi.backfill30d(days);
        const d2 = r2 && r2.data;
        if (d2) allOk = allOk && d2.ok;
        totalMs += d2?.totalMs || 0;
      }
      setLastSyncSummary((prev) => ({
        ...(prev || {}),
        backfill: { ok: allOk, backfillDays: TOTAL_DAYS, totalMs },
      }));
      await fetchAll();
    } catch (err) {
      const code = err.response && err.response.status;
      const msg = (err.response && err.response.data && err.response.data.message) || "Reset gagal";
      setError(code === 401 || code === 403 ? msg + " (perlu login ulang?)" : msg);
    } finally {
      setResetLoading(false);
    }
  };


  return (
    <div ref={containerRef}>
      <PageHeader
        title="Dashboard SIPGN-BGN"
        subtitle={
          terakhir
            ? "Diperbarui: " + dayjs(terakhir).format("DD MMM YYYY HH:mm")
            : "Memuat data..."
        }
        actions={
          <Space wrap>
            {hasRole("ADMIN", "PEJABAT_BGN", "PENGAWAS_GIZI") ? (
              <>
                <Button
                  icon={<SyncOutlined />}
                  onClick={onSyncScrape}
                  loading={syncLoading}
                >
                  Sinkron Data
                </Button>
                <Button
                  type="primary"
                  icon={<SyncOutlined spin={syncDummyLoading} />}
                  onClick={onSyncDummy}
                  loading={syncDummyLoading}
                >
                  Generate Data Harian
                </Button>
                <Button
                  type="dashed"
                  icon={<SyncOutlined spin={syncCronLoading} />}
                  onClick={onSyncCron}
                  loading={syncCronLoading}
                >
                  Trigger Cron (Semua)
                </Button>
                {hasRole("ADMIN") ? (
                  <>
                    <Button
                      type="primary"
                      ghost
                      icon={<SyncOutlined spin={backfill30dLoading} />}
                      onClick={onBackfill30d}
                      loading={backfill30dLoading}
                    >
                      Backfill 30 Hari
                    </Button>
                    <Button
                      danger
                      icon={<SyncOutlined spin={resetLoading} />}
                      onClick={onReset}
                      loading={resetLoading}
                    >
                      Reset Data Dummy
                    </Button>
                  </>
                ) : null}
              </>
            ) : null}
            <Button icon={<ReloadOutlined />} onClick={fetchAll} loading={loading}>
              Refresh
            </Button>
            <Button icon={<DownloadOutlined />} onClick={onUnduh}>
              Unduh Snapshot
            </Button>
          </Space>
        }
      />

      {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} /> : null}

      {lastSyncSummary ? (
        <Alert
          type={lastSyncSummary.jenis === "cron" ? (lastSyncSummary.ok ? "success" : "warning") : "success"}
          showIcon
          style={{ marginBottom: 12 }}
          message={
            lastSyncSummary.jenis === "cron"
              ? (lastSyncSummary.ok ? "Cron harian berhasil" : "Cron harian selesai sebagian")
              : "Generator data dummy berhasil"
          }
          description={
            lastSyncSummary.jenis === "cron" ? (
              <div>
                <div>Trigger: <b>{lastSyncSummary.trigger}</b> Â· Total: <b>{Math.round((lastSyncSummary.totalMs || 0) / 1000)}s</b></div>
                <ul style={{ margin: "6px 0 0 16px" }}>
                  {Object.entries(lastSyncSummary.steps || {}).map(([k, s]) => (
                    <li key={k}>
                      <b>{k}</b>: {s.ok ? "OK" : "GAGAL"} ({Math.round((s.durationMs || 0) / 1000)}s)
                      {s.summary ? (
                        <span style={{ color: "#888" }}>
                          {s.summary.totalPorsiGenerated != null ? ` Â· porsi hari ini: ${s.summary.totalPorsiGenerated}` : ""}
                          {s.summary.totalRows != null ? ` Â· rows: ${s.summary.totalRows}` : ""}
                          {s.summary.total != null ? ` Â· indikator: ${s.summary.total}` : ""}
                        </span>
                      ) : null}
                      {s.error ? <span style={{ color: "#ff4d4f" }}> Â· {s.error}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div>
                <div>Trigger: <b>{lastSyncSummary.trigger}</b> Â· SPPG diupdate: <b>{lastSyncSummary.totalSppgUpdated}</b> Â· Pemantauan: <b>{lastSyncSummary.totalPemantauanInserted}</b></div>
                <div style={{ marginTop: 4 }}>
                  Porsi kemarin: <b>{lastSyncSummary.totalPorsiKemarin}</b> Â· hari ini: <b>{lastSyncSummary.totalPorsiGenerated}</b> Â· besok: <b>{lastSyncSummary.totalPorsiBesok}</b>
                </div>
              </div>
            )
          }
          closable
          onClose={() => setLastSyncSummary(null)}
        />
      ) : null}

      {loading && !stat ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8} lg={5}>
              <Card className="bgn-stat-card">
                <Statistic
                  title="Total Penerima Manfaat"
                  value={stat ? stat.totalPenerima : 0}
                  prefix={<TeamOutlined style={{ color: "#1B3A6B" }} />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={5}>
              <Card className="bgn-stat-card">
                <Statistic
                  title="Distribusi Hari Ini"
                  value={stat ? stat.distribusiHariIni : 0}
                  prefix={<ShoppingOutlined style={{ color: "#52c41a" }} />}
                  suffix="porsi"
                />
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  {stat && stat.perubahanDistribusi >= 0 ? (
                    <span style={{ color: "#52c41a" }}>
                      <ArrowUpOutlined /> {stat.perubahanDistribusi.toFixed(1)}% vs kemarin
                    </span>
                  ) : (
                    <span style={{ color: "#ff4d4f" }}>
                      <ArrowDownOutlined /> {(stat && Math.abs(stat.perubahanDistribusi).toFixed(1)) || 0}% vs kemarin
                    </span>
                  )}
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={5}>
              <Card className="bgn-stat-card">
                <Statistic
                  title="SPPG Aktif"
                  value={stat ? stat.jumlahSppgAktif : 0}
                  prefix={<BankOutlined style={{ color: "#722ed1" }} />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={5}>
              <Card className="bgn-stat-card" title="Cakupan Target">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Progress
                    type="circle"
                    size={70}
                    percent={stat ? Math.min(100, Math.round(stat.persentaseCakupan || 0)) : 0}
                    strokeColor={cakupanColor}
                  />
                  <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                    Total realisasi vs kapasitas SPPG aktif hari ini
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8} lg={4}>
              <Card className="bgn-stat-card" style={{ borderColor: stat && stat.alertGiziBuruk > 0 ? "#ffccc7" : undefined }}>
                <Statistic
                  title="Alert Gizi Buruk/Kurang"
                  value={stat ? stat.alertGiziBuruk : 0}
                  prefix={<AlertOutlined style={{ color: "#ff4d4f" }} />}
                />
                <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4 }}>30 hari terakhir</div>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} lg={16}>
              <Card
                title="Tren Distribusi MBG"
                extra={
                  <Space>
                    {RANGE_OPTIONS.map((r) => (
                      <Button
                        key={r.value}
                        size="small"
                        type={range === r.value ? "primary" : "default"}
                        onClick={() => setRange(r.value)}
                      >
                        {r.label}
                      </Button>
                    ))}
                  </Space>
                }
              >
                <div style={{ width: "100%", height: trendChartHeight }}>
                  <ResponsiveContainer>
                    <AreaChart data={tren.map((d) => ({ ...d, label: dayjs(d.tanggal).format("DD/MM") }))}>
                      <defs>
                        <linearGradient id="colorBgn" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1B3A6B" stopOpacity={0.7} />
                          <stop offset="95%" stopColor="#1B3A6B" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={token.colorBorderSecondary} />
                      <XAxis dataKey="label" />
                      <YAxis />
                      <RTooltip
                        formatter={(value) => [value + " porsi", "Total"]}
                        labelFormatter={(_, p) => (p && p[0] ? dayjs(p[0].payload.tanggal).format("DD MMM YYYY") : "")}
                      />
                      <Area type="monotone" dataKey="totalPorsi" stroke="#1B3A6B" fill="url(#colorBgn)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card title="Distribusi Penerima per Kategori">
                <div style={{ width: "100%", height: pieChartHeight }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        labelLine={false}
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" style={{ fontWeight: 600, fill: token.colorText }}>
                        {`Total: ${totalKategori}`}
                      </text>
                      <RTooltip />
                      <Legend formatter={(value) => (String(value).length > 20 ? `${String(value).slice(0, 20)}...` : value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col span={24}>
              <Card title="Update Hari Ini Realtime MBG" extra={<Tag color={streamStatus === "Live" ? "green" : "orange"}>{streamStatus}</Tag>}>
                {realtimeSummary ? (
                  <Row gutter={[12, 12]}>
                    <Col xs={24} md={8} lg={4}><Statistic title="Penerima + " value={(realtimeSummary.values?.PENERIMA_MANFAAT || 0)} /></Col>
                    <Col xs={24} md={8} lg={4}><Statistic title="Distribusi + " value={(realtimeSummary.values?.DISTRIBUSI_MBG || 0)} /></Col>
                    <Col xs={24} md={8} lg={4}><Statistic title="Status Gizi + " value={(realtimeSummary.values?.STATUS_GIZI || 0)} /></Col>
                    <Col xs={24} md={8} lg={4}><Statistic title="Laporan + " value={(realtimeSummary.values?.LAPORAN || 0)} /></Col>
                    <Col xs={24} md={8} lg={4}><Statistic title="SPPG + " value={(realtimeSummary.values?.SPPG || 0)} /></Col>
                    <Col xs={24} md={8} lg={4}>
                      <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                        Zona waktu: {realtimeSummary.timezone || "Asia/Jakarta"}
                        <br />
                        Update: {realtimeSummary.updatedAt ? dayjs(realtimeSummary.updatedAt).format("DD MMM YYYY HH:mm:ss") : "-"}
                      </div>
                    </Col>
                  </Row>
                ) : (
                  <Empty description="Realtime summary belum tersedia" />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={14}>
              <Card title="Sebaran SPPG" bodyStyle={{ padding: 0 }}>
                <div style={{ height: mapHeight }}>
                  <MapContainer
                    center={
                      hasRole("OPERATOR_SPPG") && sebaran[0]?.latitude && sebaran[0]?.longitude
                        ? [sebaran[0].latitude, sebaran[0].longitude]
                        : [-2.5, 118]
                    }
                    zoom={hasRole("OPERATOR_SPPG") && sebaran[0]?.latitude ? 11 : 5}
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    {sebaran
                      .filter((s) => s.latitude && s.longitude)
                      .map((s) => (
                        <CircleMarker
                          key={s.id}
                          center={[s.latitude, s.longitude]}
                          radius={8}
                          pathOptions={{
                            color: !s.statusAktif ? "#ff4d4f" : s.distribusiKemarin === 0 ? "#faad14" : "#52c41a",
                            fillOpacity: 0.85,
                          }}
                        >
                          <Popup>
                            <div style={{ minWidth: 180, maxWidth: 240 }} className="text-wrap-anywhere">
                              <div style={{ fontWeight: 700 }} className="text-wrap-anywhere">{s.namaSppg}</div>
                              <div>Provinsi: {s.provinsi}</div>
                              <div>Kapasitas: {s.kapasitas} porsi/hari</div>
                              <div>Distribusi kemarin: {s.distribusiKemarin}</div>
                              <div>Penerima aktif: {s.jumlahPenerima}</div>
                            </div>
                          </Popup>
                        </CircleMarker>
                      ))}
                  </MapContainer>
                </div>
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="Alert & Notifikasi" style={{ height: alertHeight, overflow: "auto" }}>
                {(alert.sppgBelumLapor || []).length > 0 ? (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>SPPG belum lapor 2 hari berturut-turut</div>
                    <List
                      size="small"
                      dataSource={alert.sppgBelumLapor.slice(0, 5)}
                      renderItem={(s) => (
                        <List.Item style={{ background: token.colorWarningBg, borderRadius: 6, padding: 8 }}>
                          <div className="dashboard-split-row">
                            <Tooltip title={s.namaSppg}>
                              <span className="left text-clamp-1">{s.namaSppg}</span>
                            </Tooltip>
                            <Tag color="orange" className="right">{s.provinsi}</Tag>
                          </div>
                        </List.Item>
                      )}
                    />
                  </div>
                ) : null}

                {(alert.sppgRealisasiRendah || []).length > 0 ? (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>SPPG dengan realisasi rendah (&lt; 80% kapasitas)</div>
                    <List
                      size="small"
                      dataSource={alert.sppgRealisasiRendah.slice(0, 5)}
                      renderItem={(s) => (
                        <List.Item style={{ background: token.colorWarningBg, borderRadius: 6, padding: 8 }}>
                          <div className="dashboard-split-row">
                            <Tooltip title={`${s.namaSppg} - Kapasitas: ${s.kapasitasPorsiPerHari} porsi/hari`}>
                              <span className="left text-clamp-1">{s.namaSppg}</span>
                            </Tooltip>
                            <Tag color="volcano" className="right">{s.provinsi}</Tag>
                          </div>
                        </List.Item>
                      )}
                    />
                  </div>
                ) : null}

                {(alert.penerimaGiziBermasalah || []).length > 0 ? (
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Penerima dengan status gizi bermasalah</div>
                    <List
                      size="small"
                      dataSource={alert.penerimaGiziBermasalah.slice(0, 5)}
                      renderItem={(g) => (
                        <List.Item style={{ background: token.colorErrorBg, borderRadius: 6, padding: 8 }}>
                          <div className="dashboard-split-row">
                            <div className="left">
                              <Tooltip title={g.nama}>
                                <div style={{ fontWeight: 600 }} className="text-clamp-1">{g.nama}</div>
                              </Tooltip>
                              <Tooltip title={g.sppg}>
                                <div style={{ fontSize: 11, color: token.colorTextSecondary }} className="text-clamp-1">{g.sppg}</div>
                              </Tooltip>
                            </div>
                            <Tag color={g.statusGizi === "GIZI_BURUK" ? "red" : "gold"} className="right">{g.statusGizi}</Tag>
                          </div>
                        </List.Item>
                      )}
                    />
                  </div>
                ) : null}

                {(alert.sppgBelumLapor || []).length === 0 &&
                (alert.sppgRealisasiRendah || []).length === 0 &&
                (alert.penerimaGiziBermasalah || []).length === 0 ? (
                  <Empty description="Tidak ada alert" />
                ) : null}
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col span={24}>
              <Card title="Indikator Publik Pendukung MBG (Open Data)">
                {indikatorPublik.length === 0 ? (
                  <Empty description="Belum ada data publik terintegrasi" />
                ) : (
                  <List
                    size="small"
                    dataSource={indikatorPublik.slice(0, 12)}
                    renderItem={(item) => (
                      <List.Item>
                        <div className="dashboard-split-row">
                          <div className="left">
                            <Tooltip title={`${item.indikator} - ${item.namaWilayah}`}>
                              <div className="text-clamp-2">
                                <strong>{item.indikator}</strong> - {item.namaWilayah}
                              </div>
                            </Tooltip>
                            <div style={{ fontSize: 12, color: token.colorTextSecondary }} className="text-wrap-anywhere">
                              {item.kategori} | {item.levelWilayah} | {item.tahun} | sumber: {item.sumber?.nama || "-"}
                            </div>
                          </div>
                          <Tag color="blue" className="right">
                            {Number(item.nilai).toLocaleString("id-ID")} {item.satuan || ""}
                          </Tag>
                        </div>
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

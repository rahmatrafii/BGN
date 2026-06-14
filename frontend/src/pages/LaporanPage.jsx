import React, { useState, useEffect } from "react";
import {
  Card,
  Row,
  Col,
  Menu,
  Form,
  DatePicker,
  Select,
  Button,
  Table,
  Space,
  Statistic,
  App,
  Collapse,
  Input,
  List,
  Tag,
  Grid,
} from "antd";
import { DownloadOutlined, FilePdfOutlined, FileExcelOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

import PageHeader from "../components/layout/PageHeader";
import * as laporanApi from "../api/laporan.api";
import * as sppgApi from "../api/sppg.api";
import { useAuthStore } from "../store/authStore";

const JENIS = [
  { key: "distribusi", label: "Distribusi MBG" },
  { key: "status-gizi", label: "Status Gizi" },
  { key: "kinerja-sppg", label: "Kinerja SPPG" },
  { key: "penerima", label: "Penerima Manfaat" },
];

const KATEGORI_LABELS = {
  PESERTA_DIDIK: "Peserta Didik",
  BALITA: "Balita",
  IBU_HAMIL: "Ibu Hamil",
  IBU_MENYUSUI: "Ibu Menyusui",
};

const JK_LABELS = {
  LAKI_LAKI: "Laki-laki",
  PEREMPUAN: "Perempuan",
};

export default function LaporanPage() {
  const { user, hasRole } = useAuthStore();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const filterControlStyle = (desktopWidth) => ({ width: isMobile ? "100%" : desktopWidth, maxWidth: "100%" });
  const [jenis, setJenis] = useState("distribusi");
  const [filter, setFilter] = useState({
    periode: [dayjs().subtract(30, "day"), dayjs()],
    sppgId: hasRole("OPERATOR_SPPG") ? user?.sppgId : null,
    provinsi: null,
    kategori: null,
    search: null,
    page: 1,
    limit: 25,
  });
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sppgOptions, setSppgOptions] = useState([]);
  const [provList, setProvList] = useState([]);
  const [jadwal, setJadwal] = useState([]);
  const { message } = App.useApp();

  const filteredJenis = JENIS.filter((item) => {
    if (item.key === "status-gizi" || item.key === "kinerja-sppg") {
      return hasRole("ADMIN", "PEJABAT_BGN", "PENGAWAS_GIZI");
    }
    return true;
  });

  useEffect(() => {
    sppgApi.list({ limit: 200 }).then((r) => {
      const listOpts = r.data || [];
      setSppgOptions(listOpts);
      if (hasRole("OPERATOR_SPPG") && user?.sppgId) {
        if (!listOpts.some((opt) => opt.id === user.sppgId)) {
          sppgApi.detail(user.sppgId).then((det) => {
            if (det.data) {
              setSppgOptions((prev) => {
                if (prev.some((opt) => opt.id === det.data.id)) return prev;
                return [...prev, det.data];
              });
            }
          }).catch(() => {});
        }
      }
    }).catch(() => {});
    sppgApi.provinsiList().then((r) => setProvList(r.data || [])).catch(() => {});
    if (hasRole("ADMIN", "PEJABAT_BGN")) {
      laporanApi.listJadwal().then((r) => setJadwal(r.data || [])).catch(() => {});
    }
  }, [hasRole, user]);

  const buildBody = () => ({
    periodeAwal: filter.periode && filter.periode[0] ? filter.periode[0].format("YYYY-MM-DD") : null,
    periodeAkhir: filter.periode && filter.periode[1] ? filter.periode[1].format("YYYY-MM-DD") : null,
    sppgId: filter.sppgId || null,
    provinsi: filter.provinsi || null,
    kategori: filter.kategori || null,
    search: filter.search || null,
    page: filter.page || 1,
    limit: filter.limit || 25,
  });

  const onPreview = async () => {
    setLoading(true);
    setPreview(null);
    try {
      let r;
      if (jenis === "distribusi") r = await laporanApi.previewDistribusi(buildBody());
      else if (jenis === "status-gizi") r = await laporanApi.previewStatusGizi(buildBody());
      else if (jenis === "kinerja-sppg") r = await laporanApi.previewKinerjaSppg(buildBody());
      else if (jenis === "penerima") r = await laporanApi.previewPenerima(buildBody());
      else {
        message.info("Pratinjau belum tersedia untuk tipe laporan ini.");
        setLoading(false);
        return;
      }
      setPreview(r.data);
    } catch (err) {
      message.error((err.response && err.response.data && err.response.data.message) || "Gagal pratinjau");
    } finally {
      setLoading(false);
    }
  };

  const onPageChange = (page, pageSize) => {
    setFilter((f) => ({ ...f, page, limit: pageSize }));
    setLoading(true);
    setPreview(null);
    (async () => {
      try {
        let r;
        const body = { ...buildBody(), page, limit: pageSize };
        if (jenis === "distribusi") r = await laporanApi.previewDistribusi(body);
        else if (jenis === "status-gizi") r = await laporanApi.previewStatusGizi(body);
        else if (jenis === "kinerja-sppg") r = await laporanApi.previewKinerjaSppg(body);
        else if (jenis === "penerima") r = await laporanApi.previewPenerima(body);
        if (r) setPreview(r.data);
      } catch (err) {
        message.error((err.response && err.response.data && err.response.data.message) || "Gagal pratinjau");
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(() => {
    onPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jenis]);

  const onExportExcel = async () => {
    setLoading(true);
    try {
      const blob = await laporanApi.exportExcel(jenis, buildBody());
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Laporan_${jenis}_${dayjs().format("YYYYMMDD")}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      message.success("Laporan diunduh");
    } catch (err) {
      message.error("Gagal mengunduh laporan");
    } finally {
      setLoading(false);
    }
  };

  const onExportPdf = async () => {
    setLoading(true);
    try {
      const blob = await laporanApi.exportPdf(buildBody());
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Laporan_distribusi_${dayjs().format("YYYYMMDD")}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      message.success("Laporan PDF berhasil diunduh");
    } catch (err) {
      message.error("Gagal mengunduh PDF");
    } finally {
      setLoading(false);
    }
  };

  const columnsDist = [
    { title: "Tanggal", dataIndex: "tanggalDistribusi", render: (v) => dayjs(v).format("DD/MM/YYYY") },
    { title: "SPPG", render: (r) => r.sppg && r.sppg.namaSppg },
    { title: "Provinsi", render: (r) => r.sppg && r.sppg.provinsi },
    { title: "Total Porsi", dataIndex: "totalPorsi", align: "right" },
    { title: "Status", dataIndex: "status" },
  ];

  const columnsGizi = [
    { title: "Nama", dataIndex: "namaLengkap" },
    { title: "Kategori", dataIndex: "kategori", render: (v) => KATEGORI_LABELS[v] || v },
    { title: "SPPG", dataIndex: "sppgNama" },
    { title: "Tgl Ukur", dataIndex: "tanggalPengukuran", render: (v) => v ? dayjs(v).format("DD/MM/YYYY") : "-" },
    { title: "Z BB/U", dataIndex: "zscoreBbU" },
    { title: "Z BB/TB", dataIndex: "zscoreBbTb", render: (v) => v !== null && v !== undefined ? v : "-" },
    { title: "Status", dataIndex: "statusGizi" },
  ];

  const columnsKinerja = [
    { title: "Kode", dataIndex: "kodeSppg" },
    { title: "Nama SPPG", dataIndex: "namaSppg" },
    { title: "Provinsi", dataIndex: "provinsi" },
    { title: "Kapasitas/Hari", dataIndex: "kapasitas", align: "right" },
    { title: "Rata-rata Porsi", dataIndex: "rataRata", align: "right" },
    { title: "Realisasi %", dataIndex: "realisasiPersen", align: "right" },
    { title: "Menu Hari Ini", dataIndex: "totalMenuHariIni", align: "right" },
    { title: "Energi Hari Ini", dataIndex: "energiHariIni", align: "right" },
  ];

  const columnsPenerima = [
    { title: "Nama", dataIndex: "namaLengkap" },
    { title: "NIK", dataIndex: "nikMasked" },
    { title: "Kategori", dataIndex: "kategori", render: (v) => KATEGORI_LABELS[v] || v },
    { title: "JK", dataIndex: "jenisKelamin", render: (v) => JK_LABELS[v] || v },
    { title: "Tgl Lahir", dataIndex: "tanggalLahir", render: (v) => v ? dayjs(v).format("DD/MM/YYYY") : "-" },
    { title: "SPPG", dataIndex: "sppgNama" },
    { title: "Provinsi", dataIndex: "sppgProvinsi" },
  ];

  return (
    <div>
      <PageHeader title="Laporan" />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={6}>
          <Card>
            <Menu
              mode="inline"
              selectedKeys={[jenis]}
              onClick={(e) => {
                setJenis(e.key);
                setPreview(null);
                setFilter((f) => ({ ...f, search: null, page: 1 }));
              }}
              items={filteredJenis.map((j) => ({ key: j.key, label: j.label }))}
            />
          </Card>
        </Col>
        <Col xs={24} lg={18}>
          <Card title="Filter">
            <Space wrap style={{ width: "100%" }}>
              {jenis !== "penerima" && (
                <DatePicker.RangePicker
                  style={filterControlStyle(300)}
                  value={filter.periode}
                  onChange={(v) => setFilter((f) => ({ ...f, periode: v }))}
                />
              )}
              {jenis === "penerima" && (
                <Input.Search
                  placeholder="Cari Nama / NIK"
                  allowClear
                  style={filterControlStyle(240)}
                  onSearch={(v) => setFilter((f) => ({ ...f, search: v || null, page: 1 }))}
                />
              )}
              <Select
                placeholder="Provinsi"
                allowClear
                style={filterControlStyle(220)}
                value={filter.provinsi || undefined}
                onChange={(v) => setFilter((f) => ({ ...f, provinsi: v || null }))}
                options={provList.map((p) => ({ value: p.provinsi, label: p.provinsi }))}
                disabled={hasRole("OPERATOR_SPPG")}
              />
              <Select
                placeholder="SPPG"
                allowClear
                showSearch
                style={filterControlStyle(260)}
                value={filter.sppgId || undefined}
                onChange={(v) => setFilter((f) => ({ ...f, sppgId: v || null }))}
                options={sppgOptions.map((s) => ({ value: s.id, label: s.namaSppg }))}
                filterOption={(input, option) => (option.label || "").toLowerCase().includes(input.toLowerCase())}
                disabled={hasRole("OPERATOR_SPPG")}
              />
              {jenis !== "distribusi" && (
                <Select
                  placeholder="Kategori"
                  allowClear
                  style={filterControlStyle(200)}
                  value={filter.kategori || undefined}
                  onChange={(v) => setFilter((f) => ({ ...f, kategori: v || null }))}
                  options={[
                    { value: "PESERTA_DIDIK", label: "Peserta Didik" },
                    { value: "BALITA", label: "Balita" },
                    { value: "IBU_HAMIL", label: "Ibu Hamil" },
                    { value: "IBU_MENYUSUI", label: "Ibu Menyusui" },
                  ]}
                />
              )}
              <Button icon={<ReloadOutlined />} onClick={onPreview} loading={loading}>
                Pratinjau
              </Button>
              <Button type="primary" icon={<FileExcelOutlined />} onClick={onExportExcel} loading={loading}>
                Export Excel
              </Button>
              {jenis === "distribusi" ? (
                <Button icon={<FilePdfOutlined />} onClick={onExportPdf} loading={loading}>
                  Export PDF
                </Button>
              ) : null}
            </Space>
          </Card>

          <Card style={{ marginTop: 16 }} title="Pratinjau">
            {preview && preview.summary ? (
              <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
                {Object.entries(preview.summary).map(([k, v]) => (
                  <Col key={k} xs={12} md={6}>
                    <Card size="small">
                      <Statistic title={k} value={v} />
                    </Card>
                  </Col>
                ))}
              </Row>
            ) : null}
            {preview && jenis === "distribusi" ? (
              <Table rowKey="id" columns={columnsDist} dataSource={preview.rows} pagination={false} size="small" scroll={{ x: 800 }} />
            ) : null}
            {preview && jenis === "status-gizi" ? (
              <Table rowKey={(r) => r.namaLengkap + r.tanggalPengukuran} columns={columnsGizi} dataSource={preview.rows} pagination={false} size="small" scroll={{ x: 800 }} />
            ) : null}
            {preview && jenis === "kinerja-sppg" ? (
              <Table
                rowKey={(r) => r.kodeSppg}
                columns={columnsKinerja}
                dataSource={preview.rows}
                pagination={preview.pagination ? {
                  current: preview.pagination.page,
                  pageSize: preview.pagination.limit,
                  total: preview.pagination.total,
                  showSizeChanger: true,
                  showTotal: (t) => `Total ${t} SPPG`,
                  onChange: onPageChange,
                } : false}
                size="small"
                scroll={{ x: 900 }}
              />
            ) : null}
            {preview && jenis === "penerima" ? (
              <Table
                rowKey={(r) => r.id}
                columns={columnsPenerima}
                dataSource={preview.rows}
                pagination={preview.pagination ? {
                  current: preview.pagination.page,
                  pageSize: preview.pagination.limit,
                  total: preview.pagination.total,
                  showSizeChanger: true,
                  showTotal: (t) => `Total ${t} penerima`,
                  onChange: onPageChange,
                } : false}
                size="small"
                scroll={{ x: 900 }}
              />
            ) : null}
          </Card>

          {hasRole("ADMIN", "PEJABAT_BGN") ? (
            <Card style={{ marginTop: 16 }}>
              <Collapse
                items={[
                  {
                    key: "1",
                    label: "Laporan Otomatis Terjadwal",
                    children: (
                      <>
                        <Form
                          layout="vertical"
                          onFinish={async (values) => {
                            try {
                              await laporanApi.buatJadwal({
                                jenisLaporan: values.jenisLaporan,
                                frekuensi: values.frekuensi,
                                hari: values.hari || null,
                                tanggal: values.tanggal || null,
                                jam: values.jam || "06:00",
                                emailTujuan: (values.emailTujuan || "").split(",").map((s) => s.trim()).filter(Boolean),
                                filterJson: {},
                              });
                              message.success("Jadwal disimpan");
                              const r = await laporanApi.listJadwal();
                              setJadwal(r.data || []);
                            } catch (_) {
                              message.error("Gagal membuat jadwal");
                            }
                          }}
                        >
                          <Row gutter={12}>
                            <Col xs={24} md={6}>
                              <Form.Item label="Jenis Laporan" name="jenisLaporan" rules={[{ required: true }]}>
                                <Select options={JENIS.map((j) => ({ value: j.key, label: j.label }))} />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={5}>
                              <Form.Item label="Frekuensi" name="frekuensi" rules={[{ required: true }]}>
                                <Select options={[{ value: "MINGGUAN", label: "Mingguan" }, { value: "BULANAN", label: "Bulanan" }]} />
                              </Form.Item>
                            </Col>
                            <Col xs={12} md={3}>
                              <Form.Item label="Hari (0-6, Senin=1)" name="hari">
                                <Input type="number" min={0} max={6} />
                              </Form.Item>
                            </Col>
                            <Col xs={12} md={3}>
                              <Form.Item label="Tanggal (1-31)" name="tanggal">
                                <Input type="number" min={1} max={31} />
                              </Form.Item>
                            </Col>
                            <Col xs={12} md={3}>
                              <Form.Item label="Jam (HH:MM)" name="jam" initialValue="06:00">
                                <Input />
                              </Form.Item>
                            </Col>
                            <Col xs={24} md={4}>
                              <Form.Item label="Email Tujuan (koma)" name="emailTujuan" rules={[{ required: true }]}>
                                <Input placeholder="a@bgn.go.id, b@bgn.go.id" />
                              </Form.Item>
                            </Col>
                          </Row>
                          <Button type="primary" htmlType="submit" icon={<DownloadOutlined />}>
                            Tambah Jadwal
                          </Button>
                        </Form>
                        <List
                          style={{ marginTop: 16 }}
                          bordered
                          dataSource={jadwal}
                          renderItem={(j) => (
                            <List.Item
                              actions={[
                                <a
                                  key="t"
                                  onClick={async () => {
                                    await laporanApi.toggleJadwal(j.id);
                                    const r = await laporanApi.listJadwal();
                                    setJadwal(r.data || []);
                                  }}
                                >
                                  {j.aktif ? "Nonaktifkan" : "Aktifkan"}
                                </a>,
                                <a
                                  key="h"
                                  onClick={async () => {
                                    await laporanApi.hapusJadwal(j.id);
                                    const r = await laporanApi.listJadwal();
                                    setJadwal(r.data || []);
                                  }}
                                >
                                  Hapus
                                </a>,
                              ]}
                            >
                              <List.Item.Meta
                                title={
                                  <Space>
                                    <b>{j.jenisLaporan}</b>
                                    <Tag color={j.aktif ? "green" : "default"}>{j.aktif ? "Aktif" : "Nonaktif"}</Tag>
                                  </Space>
                                }
                                description={`${j.frekuensi} • ${j.jam} • ${(j.emailTujuan || []).join(", ")}`}
                              />
                            </List.Item>
                          )}
                        />
                      </>
                    ),
                  },
                ]}
              />
            </Card>
          ) : null}
        </Col>
      </Row>
    </div>
  );
}

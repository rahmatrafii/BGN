import React, { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import {
  Table,
  Tag,
  Input,
  Select,
  Button,
  Space,
  Modal,
  Upload,
  Card,
  App,
  Typography,
  Alert,
  Grid,
} from "antd";
import {
  PlusOutlined,
  UploadOutlined,
  DownloadOutlined,
  ReloadOutlined,
  EyeOutlined,
  EditOutlined,
  StopOutlined,
  InboxOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";

import PageHeader from "../components/layout/PageHeader";
import * as penerimaApi from "../api/penerima.api";
import * as sppgApi from "../api/sppg.api";
import { useAuthStore } from "../store/authStore";

const KATEGORI_COLOR = { PESERTA_DIDIK: "blue", BALITA: "green", IBU_HAMIL: "orange", IBU_MENYUSUI: "purple" };
const KATEGORI_LABEL = { PESERTA_DIDIK: "Peserta Didik", BALITA: "Balita", IBU_HAMIL: "Ibu Hamil", IBU_MENYUSUI: "Ibu Menyusui" };
const STATUS_GIZI_COLOR = { GIZI_BURUK: "red", GIZI_KURANG: "gold", GIZI_BAIK: "green", GIZI_LEBIH: "orange" };

export default function PenerimaListPage() {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const filterControlStyle = (desktopWidth) => ({ width: isMobile ? "100%" : desktopWidth, maxWidth: "100%" });
  const navigate = useNavigate();
  const { user, hasRole } = useAuthStore();
  const { message, modal } = App.useApp();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 });
  const [filter, setFilter] = useState({ search: "", kategori: "", sppgId: "", statusAktif: "" });
  const [searchTimer, setSearchTimer] = useState(null);
  const [sppgOptions, setSppgOptions] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sortInfo, setSortInfo] = useState({ field: undefined, order: undefined });
  const [searchValue, setSearchValue] = useState("");

  const showSppgFilter = hasRole("ADMIN", "PENGAWAS_GIZI", "PEJABAT_BGN");

  const fetchData = async (override = {}) => {
    setLoading(true);
    try {
      const r = await penerimaApi.list({
        page: override.page || pagination.current,
        limit: override.limit || pagination.pageSize,
        search: filter.search || undefined,
        kategori: filter.kategori || undefined,
        sppgId: filter.sppgId || undefined,
        statusAktif: filter.statusAktif || undefined,
        sortBy: override.sortBy || sortInfo.field || undefined,
        sortOrder: override.sortOrder || sortInfo.order || undefined,
      });
      setData(r.data || []);
      setPagination((p) => ({ ...p, total: (r.pagination && r.pagination.total) || 0 }));
    } catch (err) {
      message.error((err.response && err.response.data && err.response.data.message) || "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData({ page: 1 });
    setPagination((p) => ({ ...p, current: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.search, filter.kategori, filter.sppgId, filter.statusAktif]);

  useEffect(() => {
    if (showSppgFilter) {
      sppgApi.list({ limit: 200 }).then((r) => setSppgOptions(r.data || [])).catch(() => {});
    }
  }, [showSppgFilter]);

  const onSearch = (val) => {
    if (searchTimer) clearTimeout(searchTimer);
    const t = setTimeout(() => {
      setFilter((f) => ({ ...f, search: val }));
    }, 300);
    setSearchTimer(t);
  };

  const onResetFilter = () => {
    if (searchTimer) clearTimeout(searchTimer);
    setSearchValue("");
    setFilter({ search: "", kategori: "", sppgId: "", statusAktif: "" });
    setSortInfo({ field: undefined, order: undefined });
  };

  const onNonaktif = (record) => {
    modal.confirm({
      title: "Nonaktifkan penerima",
      content: `Anda yakin menonaktifkan ${record.namaLengkap}? Data tidak akan dihapus permanen.`,
      okText: "Ya, nonaktifkan",
      okButtonProps: { danger: true },
      cancelText: "Batal",
      onOk: async () => {
        try {
          await penerimaApi.nonaktifkan(record.id);
          message.success("Penerima dinonaktifkan");
          fetchData();
        } catch (err) {
          message.error((err.response && err.response.data && err.response.data.message) || "Gagal");
        }
      },
    });
  };

  const onAktifkan = (record) => {
    modal.confirm({
      title: "Aktifkan kembali penerima",
      content: `Anda yakin mengaktifkan kembali ${record.namaLengkap}?`,
      okText: "Ya, aktifkan",
      okButtonProps: { type: "primary" },
      cancelText: "Batal",
      onOk: async () => {
        try {
          await penerimaApi.aktifkan(record.id);
          message.success("Penerima diaktifkan kembali");
          fetchData();
        } catch (err) {
          message.error((err.response && err.response.data && err.response.data.message) || "Gagal mengaktifkan");
        }
      },
    });
  };

  const onDownloadTemplate = async () => {
    try {
      const blob = await penerimaApi.downloadTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Template_Penerima.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      message.error("Gagal mengunduh template");
    }
  };

  const onUpload = async (file) => {
    setUploading(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await penerimaApi.importExcel(fd);
      setImportResult(r.data);
      fetchData();
    } catch (err) {
      message.error((err.response && err.response.data && err.response.data.message) || "Gagal import");
    } finally {
      setUploading(false);
    }
    return false;
  };

  const columns = useMemo(() => {
    const cols = [
      {
        title: "No",
        render: (_, __, idx) => (pagination.current - 1) * pagination.pageSize + idx + 1,
        width: 60,
        responsive: ["md"],
      },
      {
        title: "NIK",
        dataIndex: "nikMasked",
        render: (v) => <span style={{ fontFamily: "monospace" }}>{v}</span>,
      },
      { title: "Nama Lengkap", dataIndex: "namaLengkap", key: "namaLengkap", sorter: true },
      {
        title: "Kategori",
        dataIndex: "kategori",
        responsive: ["md"],
        render: (v) => <Tag color={KATEGORI_COLOR[v]}>{KATEGORI_LABEL[v] || v}</Tag>,
      },
      { title: "Usia", dataIndex: "usiaLabel", responsive: ["lg"] },
      { title: "Satuan Pendidikan", dataIndex: "satuanPendidikan", responsive: ["lg"] },
    ];
    if (showSppgFilter) {
      cols.push({ title: "SPPG", responsive: ["lg"], render: (r) => (r.sppg ? r.sppg.namaSppg : "-") });
    }
    cols.push({
      title: "Status Gizi",
      dataIndex: "statusGiziTerakhir",
      responsive: ["md"],
      render: (v) => (v ? <Tag color={STATUS_GIZI_COLOR[v]}>{v}</Tag> : <span style={{ color: "#94a3b8" }}>—</span>),
    });
    cols.push({
      title: "Status",
      dataIndex: "statusAktif",
      render: (v) => (v ? <Tag color="green">Aktif</Tag> : <Tag>Nonaktif</Tag>),
    });
    cols.push({
      title: "Aksi",
      render: (r) => (
        <Space wrap size={6}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/penerima/${r.id}`)} title="Lihat detail">
            Lihat
          </Button>
          {hasRole("ADMIN", "OPERATOR_SPPG") && (
            <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/penerima/${r.id}/edit`)} title="Ubah data">
              Edit
            </Button>
          )}
          {hasRole("ADMIN", "OPERATOR_SPPG") && r.statusAktif ? (
            <Button size="small" danger icon={<StopOutlined />} onClick={() => onNonaktif(r)}>
              Nonaktifkan
            </Button>
          ) : null}
          {hasRole("ADMIN", "OPERATOR_SPPG") && !r.statusAktif ? (
            <Button size="small" icon={<CheckCircleOutlined />} style={{ color: "#16a34a", borderColor: "#16a34a" }} onClick={() => onAktifkan(r)}>
              Aktifkan
            </Button>
          ) : null}
        </Space>
      ),
    });
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination, showSppgFilter, isMobile, hasRole]);

  return (
    <div>
      <PageHeader
        title="Penerima Manfaat"
        subtitle="Kelola data penerima manfaat program MBG"
        actions={
          <Space
            wrap
            style={{
              width: isMobile ? "100%" : "auto",
              justifyContent: isMobile ? "flex-start" : "flex-end",
            }}
          >
            {hasRole("ADMIN", "OPERATOR_SPPG") ? (
              <>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={onDownloadTemplate}
                  style={isMobile ? { width: "100%" } : undefined}
                >
                  Template Excel
                </Button>
                <Button
                  icon={<UploadOutlined />}
                  onClick={() => setImportOpen(true)}
                  style={isMobile ? { width: "100%" } : undefined}
                >
                  Import Excel
                </Button>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => navigate("/penerima/tambah")}
                  style={isMobile ? { width: "100%" } : undefined}
                >
                  Tambah Penerima
                </Button>
              </>
            ) : null}
          </Space>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <Space wrap style={{ width: "100%" }}>
          <Input.Search
            placeholder="Cari NIK / Nama"
            allowClear
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value);
              onSearch(e.target.value);
            }}
            onSearch={(val) => {
              setSearchValue(val);
              if (searchTimer) clearTimeout(searchTimer);
              setFilter((f) => ({ ...f, search: val }));
            }}
            style={filterControlStyle(260)}
          />
          <Select
            placeholder="Kategori"
            allowClear
            style={filterControlStyle(180)}
            value={filter.kategori || undefined}
            onChange={(v) => setFilter((f) => ({ ...f, kategori: v || "" }))}
            options={Object.entries(KATEGORI_LABEL).map(([k, v]) => ({ value: k, label: v }))}
          />
          {showSppgFilter ? (
            <Select
              placeholder="SPPG"
              allowClear
              showSearch
              style={filterControlStyle(260)}
              value={filter.sppgId || undefined}
              onChange={(v) => setFilter((f) => ({ ...f, sppgId: v || "" }))}
              options={sppgOptions.map((s) => ({ value: s.id, label: s.namaSppg }))}
              filterOption={(input, option) => (option.label || "").toLowerCase().includes(input.toLowerCase())}
            />
          ) : null}
          <Select
            placeholder="Status"
            allowClear
            style={filterControlStyle(160)}
            value={filter.statusAktif || undefined}
            onChange={(v) => setFilter((f) => ({ ...f, statusAktif: v || "" }))}
            options={[
              { value: "true", label: "Aktif" },
              { value: "false", label: "Nonaktif" },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={onResetFilter}>
            Reset
          </Button>
        </Space>
      </Card>

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={data}
          columns={columns}
          pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          size: isMobile ? "small" : "default",
          showSizeChanger: !isMobile,
          simple: isMobile,
          showTotal: (t) => `Total ${t} data`,
        }}
        onChange={(pag, _filters, sorter) => {
          const newSort = {
            field: sorter.order ? sorter.field : undefined,
            order: sorter.order === "ascend" ? "asc" : sorter.order === "descend" ? "desc" : undefined,
          };
          setSortInfo(newSort);
          setPagination((p) => ({ ...p, current: pag.current, pageSize: pag.pageSize }));
          fetchData({
            page: pag.current,
            limit: pag.pageSize,
            sortBy: newSort.field,
            sortOrder: newSort.order,
          });
        }}
          size={isMobile ? "small" : "middle"}
          scroll={{ x: isMobile ? 860 : 1200 }}
          expandable={{
            expandedRowRender: (record) =>
              record.tanggalPengukuranTerakhir ? (
                <Typography.Text type="secondary">
                  Pengukuran terakhir: {dayjs(record.tanggalPengukuranTerakhir).format("DD MMM YYYY")} — Status: {record.statusGiziTerakhir}
                </Typography.Text>
              ) : (
                <Typography.Text type="secondary">Belum ada pengukuran gizi</Typography.Text>
              ),
          }}
        />
      </Card>

      <Modal title="Import Excel Penerima" open={importOpen} onCancel={() => setImportOpen(false)} footer={null} width={620}>
        <Upload.Dragger
          accept=".xlsx"
          showUploadList={false}
          beforeUpload={onUpload}
          disabled={uploading}
          multiple={false}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">Klik atau drag file .xlsx ke sini</p>
          <p className="ant-upload-hint">Maksimum 5MB. Gunakan template untuk memastikan format benar.</p>
        </Upload.Dragger>
        <div style={{ marginTop: 12 }}>
          <Button onClick={onDownloadTemplate} icon={<DownloadOutlined />}>
            Unduh Template
          </Button>
        </div>
        {importResult ? (
          <Alert
            type={importResult.gagal === 0 ? "success" : "warning"}
            style={{ marginTop: 12 }}
            message={`Berhasil: ${importResult.berhasil} | Gagal: ${importResult.gagal}`}
            description={
              importResult.errors && importResult.errors.length ? (
                <ul style={{ marginTop: 8 }}>
                  {importResult.errors.map((e, i) => (
                    <li key={i}>
                      Baris {e.baris}: {e.pesan}
                    </li>
                  ))}
                </ul>
              ) : null
            }
            showIcon
          />
        ) : null}
      </Modal>
    </div>
  );
}

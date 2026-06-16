import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Descriptions, Tag, Button, Space, Spin, Empty, Table, App } from "antd";
import { ArrowLeftOutlined, EditOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

import PageHeader from "../components/layout/PageHeader";
import * as penerimaApi from "../api/penerima.api";
import * as giziApi from "../api/gizi.api";
import GiziGrafikPertumbuhan from "../components/gizi/GiziGrafikPertumbuhan";
import { useAuthStore } from "../store/authStore";

export default function PenerimaDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuthStore();
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [riwayatGizi, setRiwayatGizi] = useState([]);

  const columnsDistribusi = [
    {
      title: "No",
      render: (_, __, index) => index + 1,
      width: 60,
    },
    {
      title: "Tanggal Distribusi",
      dataIndex: "tanggalDistribusi",
      render: (v) => dayjs(v).format("DD MMM YYYY"),
    },
    {
      title: "Total Porsi SPPG",
      dataIndex: "totalPorsi",
      render: (v) => `${v} porsi`,
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (v) => {
        const colors = { DRAFT: "orange", TERKONFIRMASI: "blue", TERVALIDASI: "green" };
        return <Tag color={colors[v] || "default"}>{v}</Tag>;
      },
    },
  ];

  const columnsGiziAnak = [
    {
      title: "No",
      render: (_, __, index) => index + 1,
      width: 60,
    },
    {
      title: "Tanggal Pengukuran",
      dataIndex: "tanggal",
      render: (v) => dayjs(v).format("DD MMM YYYY"),
    },
    {
      title: "Usia",
      dataIndex: "usiaBulan",
      render: (v) => `${v} bln`,
    },
    {
      title: "BB (kg)",
      dataIndex: "beratBadanKg",
      render: (v) => v !== null && v !== undefined ? `${Number(v)} kg` : "-",
    },
    {
      title: "TB (cm)",
      dataIndex: "tinggiBadanCm",
      render: (v) => v !== null && v !== undefined ? `${Number(v)} cm` : "-",
    },
    {
      title: "Z-Score (BB/U | TB/U | BB/TB)",
      render: (_, r) => {
        const bbu = r.zscoreBbU !== null && r.zscoreBbU !== undefined ? Number(r.zscoreBbU).toFixed(2) : "-";
        const tbu = r.zscoreTbU !== null && r.zscoreTbU !== undefined ? Number(r.zscoreTbU).toFixed(2) : "-";
        const bbtb = r.zscoreBbTb !== null && r.zscoreBbTb !== undefined ? Number(r.zscoreBbTb).toFixed(2) : "-";
        return `${bbu} | ${tbu} | ${bbtb}`;
      },
    },
    {
      title: "Status Gizi",
      dataIndex: "statusGizi",
      render: (v) => {
        const colors = { GIZI_BURUK: "red", GIZI_KURANG: "gold", GIZI_BAIK: "green", GIZI_LEBIH: "orange" };
        return <Tag color={colors[v] || "default"}>{v ? v.replace("_", " ") : "-"}</Tag>;
      },
    },
    {
      title: "Stunting",
      dataIndex: "stunting",
      render: (v) => v ? <Tag color="red">STUNTING</Tag> : <Tag color="green">TIDAK</Tag>,
    },
  ];

  const columnsGiziIbu = [
    {
      title: "No",
      render: (_, __, index) => index + 1,
      width: 60,
    },
    {
      title: "Tanggal Pengukuran",
      dataIndex: "tanggal",
      render: (v) => dayjs(v).format("DD MMM YYYY"),
    },
    {
      title: "Berat Badan",
      dataIndex: "beratBadanKg",
      render: (v) => v !== null && v !== undefined ? `${Number(v)} kg` : "-",
    },
    {
      title: "Tinggi Badan",
      dataIndex: "tinggiBadanCm",
      render: (v) => v !== null && v !== undefined ? `${Number(v)} cm` : "-",
    },
    {
      title: "LILA",
      dataIndex: "lilaCm",
      render: (v) => v !== null && v !== undefined ? `${Number(v)} cm` : "-",
    },
    {
      title: "Status Gizi / KEK",
      render: (_, r) => {
        const isKek = r.lilaCm ? Number(r.lilaCm) < 23.5 : r.statusGizi === "GIZI_KURANG";
        return (
          <Tag color={isKek ? "volcano" : "green"}>
            {isKek ? "Kekurangan Energi Kronis (KEK)" : "Normal / Gizi Baik"}
          </Tag>
        );
      },
    },
  ];

  useEffect(() => {
    setLoading(true);
    Promise.all([
      penerimaApi.detail(id),
      giziApi.riwayat(id)
    ])
      .then(([resDetail, resRiwayat]) => {
        setData(resDetail.data);
        setRiwayatGizi(resRiwayat.data.grafik || resRiwayat.data.riwayat || []);
      })
      .catch((err) => {
        message.error(
          (err.response && err.response.data && err.response.data.message) ||
            "Gagal memuat detail penerima"
        );
      })
      .finally(() => setLoading(false));
  }, [id, message]);

  if (loading) return <Spin />;
  if (!data) return <Empty description="Data tidak ditemukan" />;

  return (
    <div>
      <PageHeader
        title={data.namaLengkap}
        subtitle={`NIK: ${data.nikMasked}`}
        actions={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
              Kembali
            </Button>
            {hasRole("ADMIN", "OPERATOR_SPPG") && (
              <Button type="primary" icon={<EditOutlined />} onClick={() => navigate(`/penerima/${id}/edit`)}>
                Edit
              </Button>
            )}
          </Space>
        }
      />
      <Card title="Profil" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} bordered size="small">
          <Descriptions.Item label="Nama">{data.namaLengkap}</Descriptions.Item>
          <Descriptions.Item label="Tanggal Lahir">{dayjs(data.tanggalLahir).format("DD MMM YYYY")}</Descriptions.Item>
          <Descriptions.Item label="Usia">{data.usia.label}</Descriptions.Item>
          <Descriptions.Item label="Jenis Kelamin">{data.jenisKelamin === "LAKI_LAKI" ? "Laki-laki" : "Perempuan"}</Descriptions.Item>
          <Descriptions.Item label="Kategori"><Tag color="blue">{data.kategori}</Tag></Descriptions.Item>
          <Descriptions.Item label="Satuan Pendidikan">{data.satuanPendidikan || "-"}</Descriptions.Item>
          <Descriptions.Item label="SPPG" span={2}>{data.sppg ? data.sppg.namaSppg : "-"}</Descriptions.Item>
          <Descriptions.Item label="Status">{data.statusAktif ? <Tag color="green">Aktif</Tag> : <Tag>Nonaktif</Tag>}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Card title="Riwayat Pemantauan Gizi">
        {riwayatGizi && riwayatGizi.length ? (
          data.kategori === "IBU_HAMIL" || data.kategori === "IBU_MENYUSUI" ? (
            <Table
              rowKey="id"
              dataSource={riwayatGizi}
              columns={columnsGiziIbu}
              pagination={false}
              size="small"
              locale={{ emptyText: "Belum ada riwayat pengukuran" }}
            />
          ) : (
            <>
              <GiziGrafikPertumbuhan riwayatPengukuran={riwayatGizi} jenisKelamin={data.jenisKelamin} kategori={data.kategori} />
              <div style={{ marginTop: 24 }}>
                <h4 style={{ marginBottom: 12, fontSize: 15, fontWeight: 600, color: "#1e293b" }}>Tabel Riwayat Pengukuran</h4>
                <Table
                  rowKey="id"
                  dataSource={riwayatGizi}
                  columns={columnsGiziAnak}
                  pagination={false}
                  size="small"
                  locale={{ emptyText: "Belum ada riwayat pengukuran" }}
                />
              </div>
            </>
          )
        ) : (
          <Empty description="Belum ada pengukuran" />
        )}
      </Card>
      <Card title="Riwayat Distribusi MBG (Unit SPPG)" style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          dataSource={data.riwayatDistribusi || []}
          columns={columnsDistribusi}
          pagination={false}
          size="small"
          locale={{ emptyText: "Belum ada riwayat distribusi untuk SPPG ini" }}
        />
      </Card>
    </div>
  );
}

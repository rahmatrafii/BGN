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
          <GiziGrafikPertumbuhan riwayatPengukuran={riwayatGizi} jenisKelamin={data.jenisKelamin} kategori={data.kategori} />
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

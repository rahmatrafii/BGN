import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Row, Col, Statistic, Button, Space, Spin, App, DatePicker, Collapse, Table, Typography, Select } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

import PageHeader from "../components/layout/PageHeader";
import * as giziApi from "../api/gizi.api";
import * as sppgApi from "../api/sppg.api";
import { useAuthStore } from "../store/authStore";

export default function GiziListPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuthStore();
  const { message } = App.useApp();

  const [stat, setStat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [periodeAwal, setPeriodeAwal] = useState(dayjs().subtract(6, "month"));
  const [periodeAkhir, setPeriodeAkhir] = useState(dayjs());
  const [akg, setAkg] = useState(null);
  const [provinsi, setProvinsi] = useState(null);
  const [sppgId, setSppgId] = useState(null);
  const [provList, setProvList] = useState([]);
  const [sppgOptions, setSppgOptions] = useState([]);

  const fetchStat = async () => {
    setLoading(true);
    try {
      const r = await giziApi.prevalensi({
        periodeAwal: periodeAwal.format("YYYY-MM-DD"),
        periodeAkhir: periodeAkhir.format("YYYY-MM-DD"),
        provinsi: provinsi || undefined,
        sppgId: sppgId || undefined,
      });
      setStat(r.data);
    } catch (err) {
      message.error("Gagal memuat prevalensi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasRole("ADMIN", "PEJABAT_BGN", "PENGAWAS_GIZI", "OPERATOR_SPPG")) {
      fetchStat();
    } else {
      setLoading(false);
    }
    giziApi.standarAKG().then((r) => setAkg(r.data)).catch(() => {});
    if (hasRole("ADMIN", "PEJABAT_BGN")) {
      sppgApi.list({ limit: 200 }).then((r) => setSppgOptions(r.data || [])).catch(() => {});
      sppgApi.provinsiList().then((r) => setProvList(r.data || [])).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRole]);

  const akgColumns = [
    { title: "Kelompok", dataIndex: "label" },
    { title: "Energi (kkal)", dataIndex: "energiKkal", align: "right" },
    { title: "Protein (g)", dataIndex: "proteinG", align: "right" },
    { title: "Lemak (g)", dataIndex: "lemakG", align: "right" },
    { title: "Karbohidrat (g)", dataIndex: "karbohidratG", align: "right" },
  ];

  return (
    <div>
      <PageHeader
        title="Status Gizi"
        actions={
          hasRole("PENGAWAS_GIZI", "OPERATOR_SPPG", "ADMIN") ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/gizi/input")}>
              Input Pengukuran
            </Button>
          ) : null
        }
      />
      {hasRole("ADMIN", "PEJABAT_BGN", "PENGAWAS_GIZI", "OPERATOR_SPPG") && (
        <>
          {hasRole("ADMIN", "PEJABAT_BGN", "PENGAWAS_GIZI") && (
            <Card style={{ marginBottom: 16 }}>
              <Space wrap>
                <DatePicker.RangePicker
                  value={[periodeAwal, periodeAkhir]}
                  onChange={(v) => {
                    if (v && v[0] && v[1]) {
                      setPeriodeAwal(v[0]);
                      setPeriodeAkhir(v[1]);
                    }
                  }}
                />
                {hasRole("ADMIN", "PEJABAT_BGN") && (
                  <>
                    <Select
                      placeholder="Semua Provinsi"
                      allowClear
                      style={{ width: 180 }}
                      value={provinsi || undefined}
                      onChange={(v) => {
                        setProvinsi(v || null);
                        setSppgId(null);
                      }}
                      options={provList.map((p) => ({ value: p.provinsi, label: p.provinsi }))}
                    />
                    <Select
                      placeholder="Semua SPPG"
                      allowClear
                      style={{ width: 220 }}
                      value={sppgId || undefined}
                      onChange={(v) => setSppgId(v || null)}
                      options={sppgOptions
                        .filter((s) => !provinsi || s.provinsi === provinsi)
                        .map((s) => ({ value: s.id, label: s.namaSppg }))}
                    />
                  </>
                )}
                <Button onClick={fetchStat}>Terapkan</Button>
              </Space>
            </Card>
          )}
          {loading || !stat ? (
            <Spin />
          ) : (
            <Row gutter={[16, 16]}>
              <Col xs={24} md={6}>
                <Card>
                  <Statistic title="Total Diukur" value={stat.totalDiukur} />
                </Card>
              </Col>
              <Col xs={24} md={6}>
                <Card>
                  <Statistic title="Prevalensi Stunting" value={stat.prevalensiStunting} suffix="%" valueStyle={{ color: "#ff4d4f" }} />
                </Card>
              </Col>
              <Col xs={24} md={6}>
                <Card>
                  <Statistic title="Prevalensi Wasting" value={stat.prevalensiWasting} suffix="%" valueStyle={{ color: "#fa8c16" }} />
                </Card>
              </Col>
              <Col xs={24} md={6}>
                <Card>
                  <Statistic title="Underweight" value={stat.prevalensiUnderweight} suffix="%" valueStyle={{ color: "#faad14" }} />
                </Card>
              </Col>
              <Col xs={24} md={6}>
                <Card>
                  <Statistic title="Gizi Baik" value={stat.prevalensiGiziBaik} suffix="%" valueStyle={{ color: "#52c41a" }} />
                </Card>
              </Col>
            </Row>
          )}
        </>
      )}

      {akg && akg.tabel ? (
        <Card style={{ marginTop: 16 }} title="Referensi Standar Angka Kecukupan Gizi (AKG)">
          <Typography.Paragraph type="secondary">{akg.keterangan}</Typography.Paragraph>
          <Collapse
            defaultActiveKey={["BALITA"]}
            items={Object.entries(akg.tabel).map(([key, t]) => ({
              key,
              label: t.label,
              children: (
                <Table
                  rowKey="kunci"
                  size="small"
                  pagination={false}
                  dataSource={t.kelompok}
                  columns={akgColumns}
                />
              ),
            }))}
          />
        </Card>
      ) : null}
    </div>
  );
}

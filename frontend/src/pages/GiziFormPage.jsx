import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  Form,
  DatePicker,
  InputNumber,
  AutoComplete,
  Steps,
  Space,
  Button,
  Row,
  Col,
  Tag,
  Alert,
  Statistic,
  Descriptions,
  App,
} from "antd";
import dayjs from "dayjs";

import PageHeader from "../components/layout/PageHeader";
import * as penerimaApi from "../api/penerima.api";
import * as giziApi from "../api/gizi.api";

const STATUS_COLOR = { GIZI_BURUK: "red", GIZI_KURANG: "gold", GIZI_BAIK: "green", GIZI_LEBIH: "orange" };

const getBbuStatus = (z) => {
  const numZ = z !== null && z !== undefined ? Number(z) : NaN;
  if (isNaN(numZ)) return { label: "Tidak Dihitung", color: "default" };
  if (numZ < -3) return { label: "Gizi Buruk (Sangat Underweight)", color: "red" };
  if (numZ < -2) return { label: "Gizi Kurang (Underweight)", color: "gold" };
  if (numZ > 2) return { label: "Gizi Lebih (Overweight)", color: "orange" };
  return { label: "Gizi Baik (Normal)", color: "green" };
};

const getTbuStatus = (z) => {
  const numZ = z !== null && z !== undefined ? Number(z) : NaN;
  if (isNaN(numZ)) return { label: "Tidak Dihitung", color: "default" };
  if (numZ < -3) return { label: "Sangat Pendek (Severely Stunted)", color: "red" };
  if (numZ < -2) return { label: "Pendek (Stunted)", color: "volcano" };
  if (numZ > 3) return { label: "Tinggi", color: "blue" };
  return { label: "Tinggi Normal", color: "green" };
};

const getBbtbStatus = (z) => {
  const numZ = z !== null && z !== undefined ? Number(z) : NaN;
  if (isNaN(numZ)) return { label: "Tidak Dihitung", color: "default" };
  if (numZ < -3) return { label: "Gizi Buruk (Severely Wasted)", color: "red" };
  if (numZ < -2) return { label: "Gizi Kurang (Wasted)", color: "gold" };
  if (numZ > 3) return { label: "Obesitas", color: "red" };
  if (numZ > 2) return { label: "Gizi Lebih (Overweight)", color: "orange" };
  return { label: "Gizi Baik (Normal)", color: "green" };
};

export default function GiziFormPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [form] = Form.useForm();
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState([]);
  const [penerima, setPenerima] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasil, setHasil] = useState(null);
  const selectedRef = useRef(false);

  const onSearch = async (val) => {
    setSearch(val);
    if ((val || "").length < 2) return;
    try {
      const r = await penerimaApi.list({ search: val, limit: 10 });
      setOptions((r.data || []).map((p) => ({
        value: p.id,
        label: `${p.namaLengkap} • ${p.nikMasked} • ${p.kategori}`,
      })));
    } catch (_) {}
  };

  const onSelect = async (value, option) => {
    selectedRef.current = true;
    try {
      const r = await penerimaApi.detail(value);
      setPenerima(r.data);
      setStep(1);
    } catch (_) {
      message.error("Gagal memuat penerima");
    } finally {
      setTimeout(() => {
        selectedRef.current = false;
      }, 100);
    }
  };

  const onSubmit = async (values) => {
    try {
      setSubmitting(true);
      const payload = {
        penerimaId: penerima.id,
        tanggalPengukuran: values.tanggalPengukuran.toISOString(),
        beratBadanKg: values.beratBadanKg,
        tinggiBadanCm: values.tinggiBadanCm,
        lilaCm: values.lilaCm || null,
      };
      const r = await giziApi.create(payload);
      setHasil(r.data);
      setStep(2);
    } catch (err) {
      const resData = err.response && err.response.data;
      if (resData && resData.code === "VALIDATION_ERROR" && resData.fields) {
        form.setFields(
          Object.entries(resData.fields).map(([name, errors]) => ({
            name,
            errors: Array.isArray(errors) ? errors : [errors],
          }))
        );
      } else {
        const msg = resData && resData.message;
        if (msg) message.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      setTimeout(async () => {
        if (selectedRef.current) return;

        if (options && options.length > 0) {
          onSelect(options[0].value, options[0]);
        } else if ((search || "").trim().length >= 2) {
          try {
            const r = await penerimaApi.list({ search: search.trim(), limit: 1 });
            if (r.data && r.data.length > 0) {
              onSelect(r.data[0].id, { value: r.data[0].id, label: r.data[0].namaLengkap });
            } else {
              message.error("Penerima tidak ditemukan");
            }
          } catch (_) {
            message.error("Gagal mencari penerima");
          }
        }
      }, 50);
    }
  };

  return (
    <div>
      <PageHeader title="Input Pengukuran Gizi" breadcrumb={["Status Gizi", "Input"]} />
      <Steps current={step} items={[{ title: "Cari Penerima" }, { title: "Input Pengukuran" }, { title: "Hasil" }]} style={{ marginBottom: 16 }} />

      {step === 0 ? (
        <Card>
          <AutoComplete
            value={search}
            options={options}
            onSearch={onSearch}
            onSelect={onSelect}
            onKeyDown={handleKeyDown}
            style={{ width: "100%" }}
            placeholder="Cari NIK atau nama penerima..."
          />
        </Card>
      ) : null}

      {step === 1 && penerima ? (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Descriptions title={penerima.namaLengkap} column={{ xs: 1, sm: 2, lg: 3 }} bordered size="small">
              <Descriptions.Item label="NIK">{penerima.nikMasked}</Descriptions.Item>
              <Descriptions.Item label="Tgl Lahir">{dayjs(penerima.tanggalLahir).format("DD MMM YYYY")}</Descriptions.Item>
              <Descriptions.Item label="Usia">{penerima.usia.label}</Descriptions.Item>
              <Descriptions.Item label="Kategori"><Tag color="blue">{penerima.kategori}</Tag></Descriptions.Item>
              <Descriptions.Item label="SPPG">{penerima.sppg && penerima.sppg.namaSppg}</Descriptions.Item>
              <Descriptions.Item label="Pengukuran terakhir">
                {penerima.pemantauanGizi && penerima.pemantauanGizi[0]
                  ? dayjs(penerima.pemantauanGizi[0].tanggalPengukuran).format("DD MMM YYYY") +
                    " — " + penerima.pemantauanGizi[0].statusGizi
                  : "Belum ada"}
              </Descriptions.Item>
            </Descriptions>
          </Card>
          <Card>
            <Form form={form} layout="vertical" initialValues={{ tanggalPengukuran: dayjs() }} onFinish={onSubmit}>
              <Row gutter={16}>
                <Col xs={24} md={6}>
                  <Form.Item label="Tanggal Pengukuran" name="tanggalPengukuran" rules={[{ required: true }]}>
                    <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" disabledDate={(d) => d && d > dayjs().endOf("day")} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label="Berat Badan (kg)" name="beratBadanKg" rules={[{ required: true, type: "number", min: 0.1, max: 300 }]}>
                    <InputNumber min={0.1} max={300} step={0.1} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label="Tinggi/Panjang (cm)" name="tinggiBadanCm" rules={[{ required: true, type: "number", min: 30, max: 250 }]}>
                    <InputNumber min={30} max={250} step={0.1} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                {penerima.kategori === "IBU_HAMIL" || penerima.kategori === "IBU_MENYUSUI" ? (
                  <Col xs={24} md={6}>
                    <Form.Item label="LILA (cm)" name="lilaCm" rules={[{ type: "number", min: 5, max: 50 }]}>
                      <InputNumber min={5} max={50} step={0.1} style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                ) : null}
              </Row>
              <Space>
                <Button onClick={() => setStep(0)}>Kembali</Button>
                <Button type="primary" loading={submitting} htmlType="submit">
                  Hitung & Simpan
                </Button>
              </Space>
            </Form>
          </Card>
        </>
      ) : null}

      {step === 2 && hasil ? (() => {
        const berat = hasil.beratBadanKg;
        const tinggi = hasil.tinggiBadanCm;
        const bmi = berat && tinggi ? (Number(berat) / ((Number(tinggi) / 100) ** 2)).toFixed(1) : "-";
        
        const isIbu = penerima.kategori === "IBU_HAMIL" || penerima.kategori === "IBU_MENYUSUI";
        const isAnakSekolah = penerima.kategori === "PESERTA_DIDIK" && hasil.usiaBulan > 60;

        return (
          <Card title="Hasil Penilaian Tumbuh Kembang">
            <Alert
              message={
                <span>
                  <strong>Hasil Analisis: </strong>
                  Status Gizi: <Tag color={STATUS_COLOR[hasil.klasifikasi.statusGizi]} style={{ fontWeight: "bold", marginLeft: 4, marginRight: 8 }}>{hasil.klasifikasi.statusGizi.replace("_", " ")}</Tag>
                  {!isIbu && (
                    <>
                      Stunting: <Tag color={hasil.klasifikasi.stunting ? "red" : "green"} style={{ fontWeight: "bold" }}>{hasil.klasifikasi.stunting ? "YA (Terindikasi)" : "TIDAK"}</Tag>
                    </>
                  )}
                </span>
              }
              type={hasil.klasifikasi.stunting || hasil.klasifikasi.statusGizi === "GIZI_BURUK" || hasil.klasifikasi.statusGizi === "GIZI_KURANG" ? "warning" : "success"}
              showIcon
              style={{ marginBottom: 20 }}
            />

            <Row gutter={[16, 16]}>
              {isIbu ? (
                <Col xs={24} md={24}>
                  <Card size="small" bordered style={{ textAlign: "center", background: "#f8fafc", borderRadius: 8, padding: "16px 0" }}>
                    <div style={{ color: "#64748b", fontSize: 14, fontWeight: 500, minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      Lingkar Lengan Atas (LILA)
                    </div>
                    <div style={{ fontSize: 48, fontWeight: "bold", margin: "16px 0", color: "#1e293b" }}>
                      {hasil.lilaCm !== null && hasil.lilaCm !== undefined ? `${hasil.lilaCm} cm` : "-"}
                    </div>
                    <div style={{ minHeight: 32 }}>
                      {hasil.lilaCm !== null && hasil.lilaCm !== undefined ? (
                        <Tag color={Number(hasil.lilaCm) < 23.5 ? "volcano" : "green"} style={{ fontSize: 14, padding: "6px 16px", borderRadius: 4 }}>
                          {Number(hasil.lilaCm) < 23.5 ? "Kekurangan Energi Kronis (KEK)" : "Normal / Gizi Baik"}
                        </Tag>
                      ) : (
                        <Tag color="default" style={{ fontSize: 14, padding: "6px 16px", borderRadius: 4 }}>Tidak Diisi</Tag>
                      )}
                    </div>
                  </Card>
                </Col>
              ) : isAnakSekolah ? (
                <>
                  <Col xs={24} md={8}>
                    <Card size="small" bordered style={{ textAlign: "center", background: "#f8fafc", borderRadius: 8 }}>
                      <div style={{ color: "#64748b", fontSize: 13, fontWeight: 500, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        Berat Badan menurut Umur (BB/U)
                      </div>
                      <div style={{ fontSize: 36, fontWeight: "bold", margin: "12px 0", color: "#1e293b" }}>
                        {hasil.zscore.zscoreBbU !== null ? hasil.zscore.zscoreBbU : "-"}
                      </div>
                      <div style={{ minHeight: 32 }}>
                        <Tag color={getBbuStatus(hasil.zscore.zscoreBbU).color} style={{ fontSize: 13, padding: "4px 12px", borderRadius: 4 }}>
                          {getBbuStatus(hasil.zscore.zscoreBbU).label}
                        </Tag>
                      </div>
                    </Card>
                  </Col>
                  <Col xs={24} md={8}>
                    <Card size="small" bordered style={{ textAlign: "center", background: "#f8fafc", borderRadius: 8 }}>
                      <div style={{ color: "#64748b", fontSize: 13, fontWeight: 500, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        Tinggi Badan menurut Umur (TB/U)
                      </div>
                      <div style={{ fontSize: 36, fontWeight: "bold", margin: "12px 0", color: "#1e293b" }}>
                        {hasil.zscore.zscoreTbU !== null ? hasil.zscore.zscoreTbU : "-"}
                      </div>
                      <div style={{ minHeight: 32 }}>
                        <Tag color={getTbuStatus(hasil.zscore.zscoreTbU).color} style={{ fontSize: 13, padding: "4px 12px", borderRadius: 4 }}>
                          {getTbuStatus(hasil.zscore.zscoreTbU).label}
                        </Tag>
                      </div>
                    </Card>
                  </Col>
                  <Col xs={24} md={8}>
                    <Card size="small" bordered style={{ textAlign: "center", background: "#f8fafc", borderRadius: 8 }}>
                      <div style={{ color: "#64748b", fontSize: 13, fontWeight: 500, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        Indeks Massa Tubuh (IMT / BMI)
                      </div>
                      <div style={{ fontSize: 36, fontWeight: "bold", margin: "12px 0", color: "#1e293b" }}>
                        {bmi}
                      </div>
                      <div style={{ minHeight: 32 }}>
                        <Tag color={STATUS_COLOR[hasil.klasifikasi.statusGizi] || "default"} style={{ fontSize: 13, padding: "4px 12px", borderRadius: 4 }}>
                          {hasil.klasifikasi.statusGizi.replace("_", " ")}
                        </Tag>
                      </div>
                    </Card>
                  </Col>
                </>
              ) : (
                <>
                  <Col xs={24} md={8}>
                    <Card size="small" bordered style={{ textAlign: "center", background: "#f8fafc", borderRadius: 8 }}>
                      <div style={{ color: "#64748b", fontSize: 13, fontWeight: 500, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        Berat Badan menurut Umur (BB/U)
                      </div>
                      <div style={{ fontSize: 36, fontWeight: "bold", margin: "12px 0", color: "#1e293b" }}>
                        {hasil.zscore.zscoreBbU !== null ? hasil.zscore.zscoreBbU : "-"}
                      </div>
                      <div style={{ minHeight: 32 }}>
                        <Tag color={getBbuStatus(hasil.zscore.zscoreBbU).color} style={{ fontSize: 13, padding: "4px 12px", borderRadius: 4 }}>
                          {getBbuStatus(hasil.zscore.zscoreBbU).label}
                        </Tag>
                      </div>
                    </Card>
                  </Col>
                  <Col xs={24} md={8}>
                    <Card size="small" bordered style={{ textAlign: "center", background: "#f8fafc", borderRadius: 8 }}>
                      <div style={{ color: "#64748b", fontSize: 13, fontWeight: 500, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        Tinggi Badan menurut Umur (TB/U)
                      </div>
                      <div style={{ fontSize: 36, fontWeight: "bold", margin: "12px 0", color: "#1e293b" }}>
                        {hasil.zscore.zscoreTbU !== null ? hasil.zscore.zscoreTbU : "-"}
                      </div>
                      <div style={{ minHeight: 32 }}>
                        <Tag color={getTbuStatus(hasil.zscore.zscoreTbU).color} style={{ fontSize: 13, padding: "4px 12px", borderRadius: 4 }}>
                          {getTbuStatus(hasil.zscore.zscoreTbU).label}
                        </Tag>
                      </div>
                    </Card>
                  </Col>
                  <Col xs={24} md={8}>
                    <Card size="small" bordered style={{ textAlign: "center", background: "#f8fafc", borderRadius: 8 }}>
                      <div style={{ color: "#64748b", fontSize: 13, fontWeight: 500, minHeight: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        Berat Badan menurut Tinggi (BB/TB)
                      </div>
                      <div style={{ fontSize: 36, fontWeight: "bold", margin: "12px 0", color: "#1e293b" }}>
                        {hasil.zscore.zscoreBbTb !== null ? hasil.zscore.zscoreBbTb : "-"}
                      </div>
                      <div style={{ minHeight: 32 }}>
                        <Tag color={getBbtbStatus(hasil.zscore.zscoreBbTb).color} style={{ fontSize: 13, padding: "4px 12px", borderRadius: 4 }}>
                          {getBbtbStatus(hasil.zscore.zscoreBbTb).label}
                        </Tag>
                      </div>
                    </Card>
                  </Col>
                </>
              )}
            </Row>

            {!isIbu && (
              <Alert
                message="Panduan Membaca Indikator Pertumbuhan (WHO)"
                type="info"
                showIcon
                style={{ marginTop: 20 }}
                description={
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    <ul style={{ paddingLeft: 16, margin: 0, lineHeight: "20px" }}>
                      <li>
                        <strong>Berat Badan menurut Umur (BB/U):</strong> Mengukur berat badan anak terhadap usianya. Digunakan untuk skrining awal mendeteksi gizi kurang, gizi buruk, atau gizi lebih secara umum.
                      </li>
                      <li>
                        <strong>Tinggi Badan menurut Umur (TB/U):</strong> Mengukur panjang/tinggi badan anak terhadap usianya. Menggambarkan status gizi jangka panjang (kronis). Z-Score di bawah <strong>-2.00 SD</strong> mengindikasikan <strong>Stunting (Pendek / Sangat Pendek)</strong>.
                      </li>
                      {!isAnakSekolah && (
                        <li>
                          <strong>Berat Badan menurut Tinggi Badan (BB/TB):</strong> Mengukur keidealan berat terhadap tinggi badan anak saat ini. Digunakan untuk mendeteksi kondisi tubuh anak kurus (<em>Wasting / Gizi Buruk Akut</em>) atau gemuk/obesitas.
                        </li>
                      )}
                    </ul>
                  </div>
                }
              />
            )}

            {hasil.akg && hasil.akg.standar ? (
              <Card size="small" style={{ marginTop: 16 }} title={`Target AKG — ${hasil.akg.kategori.replace(/_/g, " ")} (${hasil.akg.standar.label})`}>
                <Descriptions column={{ xs: 1, sm: 2, lg: 4 }} size="small" bordered>
                  <Descriptions.Item label="AKG Harian">
                    {hasil.akg.standar.energiKkal} kkal • {hasil.akg.standar.proteinG} g protein
                  </Descriptions.Item>
                  <Descriptions.Item label="Target Energi/Porsi MBG">{hasil.akg.targetPorsi.energiKkal} kkal</Descriptions.Item>
                  <Descriptions.Item label="Target Protein/Porsi">{hasil.akg.targetPorsi.proteinG} g</Descriptions.Item>
                  <Descriptions.Item label="Target Karbo/Porsi">{hasil.akg.targetPorsi.karbohidratG} g</Descriptions.Item>
                </Descriptions>
              </Card>
            ) : null}

            {hasil.klasifikasi.statusGizi === "GIZI_BURUK" || hasil.klasifikasi.statusGizi === "GIZI_KURANG" || hasil.klasifikasi.stunting ? (
              <Alert
                type="error"
                showIcon
                style={{ marginTop: 16 }}
                message="Tindak lanjut diperlukan"
                description="Pengawas Gizi telah dinotifikasi. Pastikan rujukan/intervensi gizi dilakukan."
              />
            ) : null}

            <Space style={{ marginTop: 16 }}>
              <Button onClick={() => navigate("/gizi")}>Selesai</Button>
              <Button type="primary" onClick={() => navigate(`/penerima/${penerima.id}`)}>
                Lihat Riwayat
              </Button>
            </Space>
          </Card>
        );
      })() : null}
    </div>
  );
}

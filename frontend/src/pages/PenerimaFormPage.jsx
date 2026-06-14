import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Card,
  Radio,
  Row,
  Col,
  AutoComplete,
  Space,
  Tag,
  App,
} from "antd";
import dayjs from "dayjs";

import PageHeader from "../components/layout/PageHeader";
import * as penerimaApi from "../api/penerima.api";
import * as sppgApi from "../api/sppg.api";
import { useAuthStore } from "../store/authStore";

const KATEGORI = [
  { value: "PESERTA_DIDIK", label: "Peserta Didik", desc: "Usia 5+ tahun, di sekolah/madrasah" },
  { value: "BALITA", label: "Balita", desc: "Usia 0-60 bulan" },
  { value: "IBU_HAMIL", label: "Ibu Hamil", desc: "Wanita yang sedang hamil" },
  { value: "IBU_MENYUSUI", label: "Ibu Menyusui", desc: "Wanita menyusui hingga 2 tahun" },
];

const SATUAN_OPTIONS = ["SD", "SMP", "MI", "TK", "PAUD", "Posyandu", "Puskesmas"].map((v) => ({ value: v }));

export default function PenerimaFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { user, hasRole } = useAuthStore();
  const { message } = App.useApp();

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [sppgOptions, setSppgOptions] = useState([]);
  const [tanggalLahir, setTanggalLahir] = useState(null);

  const selectedSppgId = Form.useWatch("sppgId", form);
  const [satuanOptions, setSatuanOptions] = useState(SATUAN_OPTIONS);

  useEffect(() => {
    if (!selectedSppgId) {
      setSatuanOptions(SATUAN_OPTIONS);
      return;
    }
    penerimaApi
      .listSatuanPendidikan({ sppgId: selectedSppgId })
      .then((r) => {
        const dbOptions = r.data || [];
        const defaults = ["SD", "SMP", "MI", "TK", "PAUD", "Posyandu", "Puskesmas"];
        const combined = Array.from(new Set([...dbOptions, ...defaults]));
        setSatuanOptions(combined.map((v) => ({ value: v })));
      })
      .catch(() => {
        setSatuanOptions(SATUAN_OPTIONS);
      });
  }, [selectedSppgId]);

  useEffect(() => {
    if (hasRole("ADMIN", "PENGAWAS_GIZI")) {
      sppgApi.list({ limit: 200 }).then((r) => setSppgOptions(r.data || [])).catch(() => {});
    } else if (user && user.sppgId) {
      sppgApi.detail(user.sppgId).then((r) => {
        if (r.data) setSppgOptions([r.data]);
      }).catch(() => {});
    }
  }, [hasRole, user]);

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    penerimaApi
      .detail(id)
      .then((r) => {
        const d = r.data;
        form.setFieldsValue({
          nik: "",
          namaLengkap: d.namaLengkap,
          tanggalLahir: dayjs(d.tanggalLahir),
          jenisKelamin: d.jenisKelamin,
          kategori: d.kategori,
          sppgId: d.sppgId,
          satuanPendidikan: d.satuanPendidikan,
        });
        setTanggalLahir(dayjs(d.tanggalLahir));
      })
      .finally(() => setLoading(false));
  }, [id, isEdit, form]);

  const usiaPreview = useMemo(() => {
    if (!tanggalLahir) return null;
    const now = dayjs();
    const totalBulan = now.diff(tanggalLahir, "month");
    const tahun = Math.floor(totalBulan / 12);
    const bulan = totalBulan % 12;
    return `${tahun} thn ${bulan} bln (${totalBulan} bulan)`;
  }, [tanggalLahir]);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const payload = {
        nik: values.nik ? values.nik.replace(/\s+/g, "") : undefined,
        namaLengkap: values.namaLengkap,
        tanggalLahir: values.tanggalLahir.toISOString(),
        jenisKelamin: values.jenisKelamin,
        kategori: values.kategori,
        sppgId: values.sppgId,
        satuanPendidikan: values.satuanPendidikan || null,
      };
      if (isEdit) {
        if (!payload.nik) delete payload.nik;
        await penerimaApi.update(id, payload);
        message.success("Data penerima diperbarui");
      } else {
        await penerimaApi.create(payload);
        message.success("Penerima manfaat ditambahkan");
      }
      navigate("/penerima");
    } catch (err) {
      const fields = err.response && err.response.data && err.response.data.fields;
      if (fields) {
        Object.entries(fields).forEach(([k, v]) => message.error(`${k}: ${v}`));
      } else {
        message.error((err.response && err.response.data && err.response.data.message) || "Gagal menyimpan");
      }
    } finally {
      setLoading(false);
    }
  };

  const formatNik = (v) => {
    const digits = (v || "").replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(.{4})/g, "$1 ").trim();
  };

  return (
    <div>
      <PageHeader
        title={isEdit ? "Edit Penerima Manfaat" : "Tambah Penerima Manfaat"}
        breadcrumb={["Penerima Manfaat", isEdit ? "Edit" : "Tambah"]}
      />
      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            sppgId: !hasRole("ADMIN", "PENGAWAS_GIZI") ? user.sppgId : undefined,
          }}
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="NIK (16 digit)"
                name="nik"
                rules={[
                  { required: !isEdit, message: "NIK wajib diisi" },
                  {
                    validator: (_, v) => {
                      if (isEdit && !v) return Promise.resolve(); // Boleh kosong jika tidak diubah
                      const digits = (v || "").replace(/\D/g, "");
                      if (digits.length !== 16) return Promise.reject("NIK harus 16 digit");
                      return Promise.resolve();
                    },
                  },
                ]}
              >
                <Input
                  maxLength={19}
                  placeholder={isEdit ? "Kosongkan jika tidak diubah" : "1234 5678 9012 3456"}
                  onChange={(e) => form.setFieldValue("nik", formatNik(e.target.value))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Nama Lengkap" name="namaLengkap" rules={[{ required: true, min: 2 }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Tanggal Lahir" name="tanggalLahir" rules={[{ required: true }]}>
                <DatePicker
                  style={{ width: "100%" }}
                  format="DD/MM/YYYY"
                  disabledDate={(d) => d && d > dayjs().endOf("day")}
                  onChange={(d) => setTanggalLahir(d)}
                />
              </Form.Item>
              {usiaPreview ? <Tag color="blue">Usia: {usiaPreview}</Tag> : null}
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Jenis Kelamin" name="jenisKelamin" rules={[{ required: true }]}>
                <Radio.Group>
                  <Radio.Button value="LAKI_LAKI">Laki-laki</Radio.Button>
                  <Radio.Button value="PEREMPUAN">Perempuan</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                label="Kategori"
                name="kategori"
                dependencies={["jenisKelamin", "tanggalLahir"]}
                rules={[
                  { required: true, message: "Kategori wajib dipilih" },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      const jk = getFieldValue("jenisKelamin");
                      if (["IBU_HAMIL", "IBU_MENYUSUI"].includes(value) && jk === "LAKI_LAKI") {
                        return Promise.reject(new Error("Kategori ini tidak valid untuk laki-laki"));
                      }
                      const tgl = getFieldValue("tanggalLahir");
                      if (tgl && value) {
                        const now = dayjs();
                        const usiaBulan = now.diff(dayjs(tgl), "month");
                        if (value === "BALITA" && (usiaBulan < 0 || usiaBulan > 60)) {
                          return Promise.reject(new Error("Kategori BALITA hanya untuk usia 0-60 bulan"));
                        }
                        if (value === "PESERTA_DIDIK" && usiaBulan < 60) {
                          return Promise.reject(new Error("Kategori PESERTA_DIDIK hanya untuk usia minimal 5 tahun"));
                        }
                      }
                      return Promise.resolve();
                    },
                  }),
                ]}
              >
                <Select
                  options={KATEGORI.map((k) => ({
                    value: k.value,
                    label: (
                      <span>
                        <b>{k.label}</b>
                        <span style={{ fontSize: 11, color: "#64748b", marginLeft: 6 }}>{k.desc}</span>
                      </span>
                    ),
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="SPPG" name="sppgId" rules={[{ required: true }]}>
                <Select
                  showSearch
                  placeholder="Pilih SPPG"
                  options={sppgOptions.map((s) => ({ value: s.id, label: s.namaSppg }))}
                  disabled={!hasRole("ADMIN", "PENGAWAS_GIZI")}
                  filterOption={(input, option) => (option.label || "").toLowerCase().includes(input.toLowerCase())}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Satuan Pendidikan / Layanan" name="satuanPendidikan">
                <AutoComplete
                  options={satuanOptions}
                  placeholder="Contoh: SDN 1 Bandung, Posyandu Mawar"
                  filterOption={(inputValue, option) =>
                    (option.value || "").toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading}>
              Simpan
            </Button>
            <Button onClick={() => navigate("/penerima")}>Batal</Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}

import React, { useState, useMemo } from "react";
import { Tabs, Empty } from "antd";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import wfaBoys from "../../data/who_reference/wfa_boys.json";
import wfaGirls from "../../data/who_reference/wfa_girls.json";
import lhfaBoys from "../../data/who_reference/lhfa_boys.json";
import lhfaGirls from "../../data/who_reference/lhfa_girls.json";

function pickRef(metric, jenisKelamin) {
  if (metric === "bb") return jenisKelamin === "PEREMPUAN" ? wfaGirls : wfaBoys;
  return jenisKelamin === "PEREMPUAN" ? lhfaGirls : lhfaBoys;
}

export default function GiziGrafikPertumbuhan({ riwayatPengukuran = [], jenisKelamin = "LAKI_LAKI", kategori = "BALITA" }) {
  const [metric, setMetric] = useState("bb");

  const isBalita = !kategori || kategori === "BALITA";

  const ref = useMemo(() => pickRef(metric, jenisKelamin), [metric, jenisKelamin]);

  const maxAge = useMemo(() => {
    if (riwayatPengukuran.length === 0) return 60;
    const ages = riwayatPengukuran.map((p) => p.usiaBulan).filter((a) => a != null);
    return ages.length > 0 ? Math.max(60, ...ages) : 60;
  }, [riwayatPengukuran]);

  const data = useMemo(() => {
    const refRows = isBalita
      ? ref.rows.map((r) => ({
          age: r.age,
          minus3: r.minus3,
          minus2: r.minus2,
          median: r.median,
          plus2: r.plus2,
          plus3: r.plus3,
        }))
      : [];
    const points = (riwayatPengukuran || [])
      .filter((p) => p.usiaBulan != null && (metric === "bb" ? p.beratBadanKg != null : p.tinggiBadanCm != null))
      .map((p) => ({
        age: p.usiaBulan,
        anak: metric === "bb" ? Number(p.beratBadanKg) : Number(p.tinggiBadanCm),
      }));
    return { refRows, points };
  }, [ref, riwayatPengukuran, metric, isBalita]);

  if (!riwayatPengukuran || riwayatPengukuran.length === 0) {
    return <Empty description="Belum ada riwayat pengukuran" />;
  }

  const chartData = isBalita
    ? data.refRows.map((r) => ({ ...r, anak: undefined }))
    : data.points;

  return (
    <div>
      <Tabs
        activeKey={metric}
        onChange={setMetric}
        items={[
          { key: "bb", label: "Berat Badan vs Usia" },
          { key: "tb", label: "Tinggi Badan vs Usia" },
        ]}
      />
      <div style={{ width: "100%", height: 360 }}>
        <ResponsiveContainer>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="age" type="number" domain={[0, isBalita ? 60 : maxAge]} label={{ value: "Usia (bulan)", position: "insideBottom", offset: -5 }} />
            <YAxis label={{ value: metric === "bb" ? "Berat (kg)" : "Tinggi (cm)", angle: -90, position: "insideLeft" }} />
            <Tooltip />
            <Legend />
            {isBalita && (
              <>
                <Line type="monotone" dataKey="minus3" data={data.refRows} stroke="#ff4d4f" name="-3 SD" dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="minus2" data={data.refRows} stroke="#faad14" name="-2 SD" dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="median" data={data.refRows} stroke="#52c41a" name="Median" dot={false} />
                <Line type="monotone" dataKey="plus2" data={data.refRows} stroke="#1890ff" name="+2 SD" dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="plus3" data={data.refRows} stroke="#722ed1" name="+3 SD" dot={false} strokeDasharray="4 2" />
              </>
            )}
            <Scatter data={data.points} dataKey="anak" fill="#1B3A6B" name="Pengukuran" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

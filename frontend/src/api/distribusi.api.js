import api from "./axios";

export const list = (params) => api.get("/distribusi", { params }).then((r) => r.data);
export const create = (payload) => api.post("/distribusi", payload).then((r) => r.data);
export const uploadBukti = (id, formData) =>
  api.post(`/distribusi/${id}/upload-bukti`, formData, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data);
export const konfirmasi = (id) => api.patch(`/distribusi/${id}/konfirmasi`).then((r) => r.data);
export const validasi = (id) => api.patch(`/distribusi/${id}/validasi`).then((r) => r.data);
export const kalkulasiAnggaran = (params) => api.get("/distribusi/kalkulasi-anggaran", { params }).then((r) => r.data);
export const alertBelumLapor = () => api.get("/distribusi/alert-belum-lapor").then((r) => r.data);
export const detail = (id) => api.get(`/distribusi/${id}`).then((r) => r.data);
export const update = (id, payload) => api.put(`/distribusi/${id}`, payload).then((r) => r.data);
export const remove = (id) => api.delete(`/distribusi/${id}`).then((r) => r.data);

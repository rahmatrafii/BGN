import api from "./axios";

export const list = (params) => api.get("/penerima", { params }).then((r) => r.data);
export const listSatuanPendidikan = (params) => api.get("/penerima/satuan-pendidikan", { params }).then((r) => r.data);
export const detail = (id) => api.get(`/penerima/${id}`).then((r) => r.data);
export const create = (payload) => api.post("/penerima", payload).then((r) => r.data);
export const update = (id, payload) => api.put(`/penerima/${id}`, payload).then((r) => r.data);
export const nonaktifkan = (id) => api.delete(`/penerima/${id}`, { data: { konfirmasi: true } }).then((r) => r.data);
export const aktifkan = (id) => api.patch(`/penerima/${id}/aktifkan`).then((r) => r.data);
export const importExcel = (formData) =>
  api.post("/penerima/import", formData, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data);

export function downloadTemplate() {
  return api.get("/penerima/template-excel", { responseType: "blob" }).then((r) => r.data);
}

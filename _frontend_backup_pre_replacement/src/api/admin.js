import client from "./client";

/**
 * Admin API client methods connecting to the Express backend /admin endpoints.
 */

export const getDashboardStats = () => {
  return client.get("/admin/dashboard-stats").then((res) => res.data.data);
};

export const getWorkers = (params = {}) => {
  return client.get("/admin/workers", { params }).then((res) => res.data.data);
};

export const getWorkerById = (id) => {
  return client.get(`/admin/workers/${id}`).then((res) => res.data.data);
};

export const updateWorkerStatus = (id, payload) => {
  return client.patch(`/admin/workers/${id}/status`, payload).then((res) => res.data.data);
};

export const getEmployers = (params = {}) => {
  return client.get("/admin/employers", { params }).then((res) => res.data.data);
};

export const getEmployerById = (id) => {
  return client.get(`/admin/employers/${id}`).then((res) => res.data.data);
};

export const verifyEmployer = (id, payload) => {
  return client.patch(`/admin/employers/${id}/verify`, payload).then((res) => res.data.data);
};

export const updateEmployerStatus = (id, payload) => {
  return client.patch(`/admin/employers/${id}/status`, payload).then((res) => res.data.data);
};

export const getJobs = (params = {}) => {
  return client.get("/admin/jobs", { params }).then((res) => res.data.data);
};

export const getJobById = (id) => {
  return client.get(`/admin/jobs/${id}`).then((res) => res.data.data);
};

export const moderateJob = (id, payload) => {
  return client.patch(`/admin/jobs/${id}/moderate`, payload).then((res) => res.data.data);
};

export const getApplications = (params = {}) => {
  return client.get("/admin/applications", { params }).then((res) => res.data.data);
};

export const getApplicationById = (id) => {
  return client.get(`/admin/applications/${id}`).then((res) => res.data.data);
};

export const getDisputes = (params = {}) => {
  return client.get("/admin/disputes", { params }).then((res) => res.data.data);
};

export const getDisputeById = (id) => {
  return client.get(`/admin/disputes/${id}`).then((res) => res.data.data);
};

export const updateDisputeStatus = (id, payload) => {
  return client.patch(`/admin/disputes/${id}/status`, payload).then((res) => res.data.data);
};

export const getRatings = (params = {}) => {
  return client.get("/admin/ratings", { params }).then((res) => res.data.data);
};

export const moderateRating = (id, payload) => {
  return client.patch(`/admin/ratings/${id}/moderate`, payload).then((res) => res.data.data);
};

export const getNotificationStats = () => {
  return client.get("/admin/notifications/stats").then((res) => res.data.data);
};

export const sendAnnouncement = (payload) => {
  return client.post("/admin/announcements", payload).then((res) => res.data.data);
};

export const getAiServiceStatus = () => {
  return client.get("/admin/ai-service/status").then((res) => res.data.data);
};

export const getAuditLogs = (params = {}) => {
  return client.get("/admin/audit-logs", { params }).then((res) => res.data.data);
};

import client from "./client";

/**
 * @param {{phone:string, password:string, roles:string[], fullName?:string, businessName?:string, businessType?:string, preferredLanguage?:string}} payload
 */
export function register(payload) {
  return client.post("/auth/register", payload).then((res) => res.data.data);
}

export function login({ phone, password }) {
  return client.post("/auth/login", { phone, password }).then((res) => res.data.data);
}

export function logout() {
  return client.post("/auth/logout").then((res) => res.data.data);
}

export function changePassword({ oldPassword, newPassword }) {
  return client.post("/auth/change-password", { oldPassword, newPassword }).then((res) => res.data.data);
}

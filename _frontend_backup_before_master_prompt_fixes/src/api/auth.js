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

/**
 * Adds the worker or employer role to the SIGNED-IN account - this is how a
 * worker becomes an employer without creating a second account. The server
 * also creates the matching profile, so the capability is usable immediately.
 *
 * No new token is needed: the server re-reads the user from the database on
 * every request, so the role applies to the token the client already holds.
 * Callers must still call AuthContext.refreshBootstrap() so the UI's own copy
 * of `user.roles` catches up.
 * @param {{role:"worker"|"employer", fullName?:string, businessName?:string, businessType?:string}} payload
 * @returns {Promise<{roles:string[], workerProfile:object|null, employerProfile:object|null}>}
 */
export function addRole(payload) {
  return client.post("/auth/add-role", payload).then((res) => res.data.data);
}

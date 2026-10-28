import client from "./client";

/** @returns {Promise<{user:object, workerProfile:object|null, employerProfile:object|null}>} */
export function getMe() {
  return client.get("/users/me").then((res) => res.data.data);
}

export function updateLanguage(preferredLanguage) {
  return client.patch("/users/language", { preferredLanguage }).then((res) => res.data.data);
}

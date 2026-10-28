import client from "./client";

/** Returns null (not a rejection) when the worker hasn't created a profile yet - a real, expected state, not an error. */
export function getMine() {
  return client
    .get("/worker-profile/me")
    .then((res) => res.data.data)
    .catch((error) => {
      if (error.status === 404) return null;
      throw error;
    });
}

export function upsert(payload) {
  return client.post("/worker-profile", payload).then((res) => res.data.data);
}

export function updateAvailability(availability) {
  return client.patch("/worker-profile/availability", { availability }).then((res) => res.data.data);
}

export function updateLocation(coordinates) {
  return client.patch("/worker-profile/location", { coordinates }).then((res) => res.data.data);
}

export function updateRadius(preferredWorkRadiusKm) {
  return client.patch("/worker-profile/radius", { preferredWorkRadiusKm }).then((res) => res.data.data);
}

export function updateCategories(preferredJobCategories) {
  return client.patch("/worker-profile/categories", { preferredJobCategories }).then((res) => res.data.data);
}

export function uploadPhoto(file) {
  const formData = new FormData();
  formData.append("photo", file);
  return client
    .post("/worker-profile/photo", formData, { headers: { "Content-Type": "multipart/form-data" } })
    .then((res) => res.data.data);
}

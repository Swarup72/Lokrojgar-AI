import client from "./client";

/** Returns null (not a rejection) when the employer hasn't created a profile yet. */
export function getMine() {
  return client
    .get("/employer-profile/me")
    .then((res) => res.data.data)
    .catch((error) => {
      if (error.status === 404) return null;
      throw error;
    });
}

export function upsert(payload) {
  return client.post("/employer-profile", payload).then((res) => res.data.data);
}

export function updateBusiness({ businessName, businessType, bio }) {
  return client.patch("/employer-profile/business", { businessName, businessType, bio }).then((res) => res.data.data);
}

export function uploadPhoto(file) {
  const formData = new FormData();
  formData.append("photo", file);
  return client
    .post("/employer-profile/photo", formData, { headers: { "Content-Type": "multipart/form-data" } })
    .then((res) => res.data.data);
}

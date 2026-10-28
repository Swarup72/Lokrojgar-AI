import client from "./client";

export function getMine() {
  return client.get("/worker-skills/mine").then((res) => res.data.data);
}

/** @param {{skillId:string, proficiency:"beginner"|"intermediate"|"expert"}} payload */
export function add(payload) {
  return client.post("/worker-skills", payload).then((res) => res.data.data);
}

export function update(id, payload) {
  return client.patch(`/worker-skills/${id}`, payload).then((res) => res.data.data);
}

export function remove(id) {
  return client.delete(`/worker-skills/${id}`).then((res) => res.data.data);
}

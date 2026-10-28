import client from "./client";

/**
 * Any authenticated role. Requires the job to be status "completed" (400
 * otherwise) and rejects a duplicate (jobId,fromUserId,toUserId) with 409.
 * Note the body field is `score`, not `rating`.
 * @param {{jobId:string, toUserId:string, score:number, review?:string}} payload
 */
export function submit(payload) {
  return client.post("/ratings", payload).then((res) => res.data.data);
}

/** All ratings where `toUserId` matches; `fromUserId` populated with phone/avatar. Unpaginated. */
export function getForUser(userId) {
  return client.get(`/ratings/user/${userId}`).then((res) => res.data.data);
}

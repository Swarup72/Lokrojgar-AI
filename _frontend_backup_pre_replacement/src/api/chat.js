import client from "./client";

/**
 * Worker <-> employer chat, scoped to one job.
 *
 * Chat only exists once a job request or application has been ACCEPTED: every
 * endpoint re-checks that relationship server-side, so a conversation id alone
 * grants nothing. A non-participant gets 404, and a conversation whose
 * application is no longer accepted gets 403.
 *
 * Transport is plain HTTP; the UI polls with `after` while a thread is open.
 */

/**
 * Opens (or returns) the conversation for a hiring relationship. An employer
 * passes `workerId` to say which hired worker; a worker passes only `jobId`.
 * @param {{jobId:string, workerId?:string}} payload
 */
export function getOrCreateConversation(payload) {
  return client.post("/chat/conversations", payload).then((res) => res.data.data);
}

/**
 * Every conversation the signed-in user participates in, newest activity first.
 * Each row carries `counterpartName` and `unreadCount`.
 */
export function listConversations() {
  return client.get("/chat/conversations").then((res) => res.data.data);
}

/**
 * Messages in ascending time order, capped at 200 per call.
 * @param {string} conversationId
 * @param {string} [after] - ISO timestamp; only newer messages are returned.
 */
export function listMessages(conversationId, after) {
  return client
    .get(`/chat/conversations/${conversationId}/messages`, { params: after ? { after } : {} })
    .then((res) => res.data.data);
}

/** Text only. Empty/whitespace-only is rejected with 400; max 2000 characters. */
export function sendMessage(conversationId, text) {
  return client
    .post(`/chat/conversations/${conversationId}/messages`, { text })
    .then((res) => res.data.data);
}

export function markRead(conversationId) {
  return client.patch(`/chat/conversations/${conversationId}/read`).then((res) => res.data.data);
}

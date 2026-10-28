import client from "./client";

/** Public - no auth required. */
export function getCategories() {
  return client.get("/catalog/categories").then((res) => res.data.data);
}

/**
 * Public - no auth required. Returns trades AND their sub-skills in one list;
 * each entry carries `parentSkillId` (null for a trade, the trade's id for a
 * sub-skill), which is how the UI groups them. A trade and its sub-skills share
 * a category, so filtering by category keeps them together.
 * @param {string} [categoryId]
 */
export function getSkills(categoryId) {
  return client.get("/catalog/skills", { params: categoryId ? { categoryId } : {} }).then((res) => res.data.data);
}

/**
 * Catalog skills mentioned in a job's title/description. Employer-only.
 *
 * Deterministic and read-only on the server - it creates nothing and can
 * only return real catalog entries, so a suggestion can never introduce an
 * invented or duplicate skill. The employer confirms or removes each one
 * before the job is published.
 */
export function suggestSkills({ title, description, categoryId }) {
  return client
    .post("/catalog/suggest-skills", { title, description, categoryId })
    .then((res) => res.data.data.suggestions);
}

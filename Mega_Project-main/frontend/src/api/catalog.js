import client from "./client";

/** Public - no auth required. */
export function getCategories() {
  return client.get("/catalog/categories").then((res) => res.data.data);
}

/** Public - no auth required. @param {string} [categoryId] */
export function getSkills(categoryId) {
  return client.get("/catalog/skills", { params: categoryId ? { categoryId } : {} }).then((res) => res.data.data);
}

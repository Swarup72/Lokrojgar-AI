import { Router } from "express";
import {
  getCategories,
  getSkills,
  createCategory,
  updateCategory,
  deleteCategory,
  createSkill,
  updateSkill,
  deleteSkill,
  suggestSkills,
} from "../controllers/categorySkill.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { languageMiddleware } from "../middlewares/language.middleware.js";

const router = Router();

// Public language-aware routes
router.get("/categories", languageMiddleware, getCategories);
router.get("/skills", languageMiddleware, getSkills);

// Suggestions for the Add Job form. Authenticated employers only: it reads
// the catalog, but it is driven by text the employer is typing into a job
// they have not published, so it is not a public endpoint.
router.post("/suggest-skills", verifyJWT, authorizeRoles("employer", "admin"), suggestSkills);

// Admin-only CRUD routes
router.post("/categories", verifyJWT, authorizeRoles("admin"), createCategory);
router.patch("/categories/:categoryId", verifyJWT, authorizeRoles("admin"), updateCategory);
router.delete("/categories/:categoryId", verifyJWT, authorizeRoles("admin"), deleteCategory);

router.post("/skills", verifyJWT, authorizeRoles("admin"), createSkill);
router.patch("/skills/:skillId", verifyJWT, authorizeRoles("admin"), updateSkill);
router.delete("/skills/:skillId", verifyJWT, authorizeRoles("admin"), deleteSkill);

export default router;

import { Router } from "express";
import { saveJob, unsaveJob, listSavedJobs } from "../controllers/savedJob.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";

const router = Router();

router.use(verifyJWT);
router.use(authorizeRoles("worker", "admin"));

router.post("/", saveJob);
router.delete("/:jobId", unsaveJob);
router.get("/mine", listSavedJobs);

export default router;

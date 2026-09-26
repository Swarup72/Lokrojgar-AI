import { Router } from "express";
import {
  scheduleShift,
  checkInShift,
  checkOutShift,
  getMissedShifts,
} from "../controllers/shift.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";

const router = Router();

router.use(verifyJWT);

router.post("/schedule", authorizeRoles("employer", "admin"), scheduleShift);
router.post("/:shiftId/check-in", authorizeRoles("worker"), checkInShift);
router.post("/:shiftId/check-out", authorizeRoles("worker"), checkOutShift);
router.get("/missed", authorizeRoles("admin"), getMissedShifts);

export default router;

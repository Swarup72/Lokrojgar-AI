import { Router } from "express";
import { submitRating, getUserRatings } from "../controllers/rating.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);

router.post("/", submitRating);
router.get("/user/:userId", getUserRatings);

export default router;

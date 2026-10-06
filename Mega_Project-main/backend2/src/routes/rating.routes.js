import { Router } from "express";
import { submitRating, getUserRatings } from "../controllers/rating.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { submitRatingValidator, userRatingsParamValidator } from "../validators/rating.validator.js";

const router = Router();

router.use(verifyJWT);

router.post("/", validate(submitRatingValidator), submitRating);
router.get("/user/:userId", validate(userRatingsParamValidator), getUserRatings);

export default router;

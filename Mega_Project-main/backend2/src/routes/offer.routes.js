import { Router } from "express";
import {
  searchTalent,
  sendOffer,
  acceptOrRejectOffer,
  getMyOffers,
} from "../controllers/offer.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";

const router = Router();

router.use(verifyJWT);

router.get("/search-talent", authorizeRoles("employer", "admin"), searchTalent);
router.post("/send", authorizeRoles("employer", "admin"), sendOffer);
router.patch("/:offerId/status", authorizeRoles("worker"), acceptOrRejectOffer);
router.get("/mine", getMyOffers);

export default router;

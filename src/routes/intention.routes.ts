import { Router } from "express";
import { createPurchaseIntention } from "../controllers/intention.controller";

const router = Router();

router.post("/intentions", createPurchaseIntention);

export default router;
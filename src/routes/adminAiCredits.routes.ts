import { Router, type IRouter } from "express";
import { verifyToken } from "../middleware/auth";
import asyncHandler from "../middleware/asyncHandler";
import {
  getAdminAiCreditsSummary,
  getAdminAiCreditTransactions,
  searchAdminAiCreditsSellers,
  grantAdminAiCredits,
} from "../controllers/adminAiCredits.controller";
import {
  adminListAiCreditPurchaseRequests,
  adminApproveAiCreditRequest,
  adminRejectAiCreditRequest,
} from "../controllers/sellerAiCredits.controller";

const router: IRouter = Router();

router.use(verifyToken(["admin"]));

router.get("/summary", asyncHandler(getAdminAiCreditsSummary));
router.get("/transactions", asyncHandler(getAdminAiCreditTransactions));
router.get("/sellers", asyncHandler(searchAdminAiCreditsSellers));
router.post("/grants", asyncHandler(grantAdminAiCredits));

router.get(
  "/purchase-requests",
  asyncHandler(adminListAiCreditPurchaseRequests),
);
router.post(
  "/purchase-requests/:requestId/approve",
  asyncHandler(adminApproveAiCreditRequest),
);
router.post(
  "/purchase-requests/:requestId/reject",
  asyncHandler(adminRejectAiCreditRequest),
);

export default router;

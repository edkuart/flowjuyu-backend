import { Router, Request, Response } from "express";
import asyncHandler from "../middleware/asyncHandler";
import { verifyToken, requireRole } from "../middleware/auth";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

// Controllers
import * as AdminController from "../controllers/admin.controller";
import { searchAdminProducts } from "../controllers/admin.controller";
import * as AdminTicketController from "../controllers/admin.ticket.controller";
import {
  markInProgress,
  markWaitingUser,
  generateReplySuggestion,
} from "../controllers/admin.ticket.controller";
import * as AdminTicketStatsController from "../controllers/admin.ticket.stats.controller";

import {
  getAllSellers,
  getSellerDetail,
  approveSeller,
  rejectSeller,
  suspendSeller,
  reactivateSeller,
  reviewSellerKYC,
  requestKycDocuments,
  flagSellerManually,
  getSellerTickets,
  getSellerKycUrls,
} from "../controllers/admin.seller.governance.controller";

import { getSellerLeads } from "../controllers/admin.leads.controller";

const router: ReturnType<typeof Router> = Router();

/* ===============================
   🔐 MIDDLEWARE ADMIN GLOBAL
=============================== */

router.use(
  verifyToken(["admin"]),
  requireRole("admin")
);

/* ===============================
   🤖 AI STATUS
=============================== */

router.get("/ai/status", (req: Request, res: Response) => {
  res.json({
    ai: "running",
    scheduler: "active",
    agents: [
      "analytics",
      "supervisor",
      "dev",
      "growth",
      "memory",
      "code-analysis",
      "claude-bridge",
    ],
    timestamp: new Date(),
  });
});

/* ===============================
   🤖 RUN AI AGENT
=============================== */

router.post(
  "/ai/run",
  asyncHandler(async (req: Request, res: Response) => {
    const { agent } = req.body;

    if (!agent) {
      return res.status(400).json({
        message: "Agent name required",
      });
    }

    const allowedAgents: Record<string, string> = {
      analytics: "run-analytics-agent.js",
      supervisor: "run-supervisor.js",
      dev: "run-dev-agent.js",
      growth: "run-growth-agent.js",
      memory: "run-memory-agent.js",
      code: "run-code-analysis-agent.js",
      claude: "run-claude-bridge.js",
      cycle: "run-daily-cycle.js",
    };

    const file = allowedAgents[agent];

    if (!file) {
      return res.status(400).json({
        message: "Unknown agent",
      });
    }

    const command = `node flow-ai/runners/${file}`;

    exec(command, (err, stdout, stderr) => {
      if (err) {
        return res.status(500).json({
          message: "Agent execution failed",
          error: stderr,
        });
      }

      res.json({
        message: "Agent executed successfully",
        agent,
        output: stdout,
      });
    });
  })
);

/* ===============================
   🤖 AI REPORTS
=============================== */

router.get(
  "/ai/reports",
  asyncHandler(async (req: Request, res: Response) => {
    const reportsDir = path.join(process.cwd(), "flow-ai/reports/daily");

    if (!fs.existsSync(reportsDir)) {
      return res.json({
        reports: [],
      });
    }

    const files = fs.readdirSync(reportsDir);

    res.json({
      reports: files,
    });
  })
);

/* ===============================
   🤖 AI TASKS
=============================== */

router.get(
  "/ai/tasks",
  asyncHandler(async (req: Request, res: Response) => {
    const inbox = path.join(process.cwd(), "flow-ai/tasks/inbox");

    if (!fs.existsSync(inbox)) {
      return res.json({
        tasks: [],
      });
    }

    const files = fs.readdirSync(inbox);

    res.json({
      tasks: files,
    });
  })
);

/* ===============================
   📊 DASHBOARD
=============================== */

router.get(
  "/dashboard",
  asyncHandler(AdminController.getAdminDashboard)
);

/* ===============================
   ⭐ LEADS (CRM VENDEDORES)
=============================== */

router.get(
  "/leads",
  asyncHandler(getSellerLeads)
);

/* ===============================
   🎫 TICKETS (ADMIN)
=============================== */

// stats primero
router.get(
  "/tickets/stats",
  asyncHandler(AdminTicketStatsController.getTicketStats)
);

// listar todos
router.get(
  "/tickets",
  asyncHandler(AdminTicketController.getAllTickets)
);

// detalle
router.get(
  "/tickets/:id",
  asyncHandler(AdminTicketController.getTicketDetailAdmin)
);

// asignar
router.patch(
  "/tickets/:id/assign",
  asyncHandler(AdminTicketController.assignTicket)
);

// cambiar estado
router.patch(
  "/tickets/:id/status",
  asyncHandler(AdminTicketController.changeTicketStatus)
);

// responder
router.post(
  "/tickets/:id/reply",
  asyncHandler(AdminTicketController.replyToTicketAdmin)
);

// cerrar
router.patch(
  "/tickets/:id/close",
  asyncHandler(AdminTicketController.closeTicket)
);

// marcar en proceso
router.patch(
  "/tickets/:id/in-progress",
  asyncHandler(markInProgress)
);

// marcar esperando usuario
router.patch(
  "/tickets/:id/waiting",
  asyncHandler(markWaitingUser)
);

// sugerencia de respuesta IA
router.post(
  "/tickets/:id/suggest-reply",
  asyncHandler(generateReplySuggestion)
);

/* ===============================
   🏪 SELLER GOVERNANCE
=============================== */

// listar todos
router.get(
  "/sellers",
  asyncHandler(getAllSellers)
);

// detalle
router.get(
  "/sellers/:id",
  asyncHandler(getSellerDetail)
);

// aprobar
router.patch(
  "/sellers/:id/approve",
  asyncHandler(approveSeller)
);

// rechazar
router.patch(
  "/sellers/:id/reject",
  asyncHandler(rejectSeller)
);

// suspender
router.patch(
  "/sellers/:id/suspend",
  asyncHandler(suspendSeller)
);

// reactivar
router.patch(
  "/sellers/:id/reactivate",
  asyncHandler(reactivateSeller)
);

// 🔥 KYC REVIEW
router.patch(
  "/sellers/:id/kyc-review",
  asyncHandler(reviewSellerKYC)
);

// 📄 REQUEST MORE DOCUMENTS
router.patch(
  "/sellers/:id/request-documents",
  asyncHandler(requestKycDocuments)
);

// 🚩 FLAG SELLER MANUALLY
router.patch(
  "/sellers/:id/flag",
  asyncHandler(flagSellerManually)
);

// 🎫 SELLER TICKETS
router.get(
  "/sellers/:id/tickets",
  asyncHandler(getSellerTickets)
);

// 🔑 KYC SIGNED URLS — time-limited, admin-only
router.get(
  "/sellers/:id/kyc-urls",
  asyncHandler(getSellerKycUrls)
);

/* ===============================
   📦 PRODUCTS (ADMIN)
=============================== */

router.get(
  "/products",
  asyncHandler(AdminController.getAllAdminProducts)
);

// ⚠️ /products/search MUST be before /products/:id
router.get(
  "/products/search",
  asyncHandler(searchAdminProducts)
);

router.get(
  "/products/:id",
  asyncHandler(AdminController.getAdminProductDetail)
);

router.patch(
  "/products/:id/toggle",
  asyncHandler(AdminController.toggleAdminProduct)
);

export default router;
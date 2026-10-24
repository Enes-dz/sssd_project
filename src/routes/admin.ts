import { Router } from "express";
import { accessJWTMiddleware } from "../middleware/access_jwt";
import { requireAdmin } from "../middleware/admin_auth";
import { adminService } from "../services/admin_service";

export const adminRouter = Router();

function getLogInfo(req: any) {
    return {
        user_agent: Array.isArray(req.headers["user-agent"])
            ? req.headers["user-agent"][0]
            : req.headers["user-agent"] ?? "Unknown",
        ip_address: req.ip || req.socket.remoteAddress || "Unknown",
    };
}

function getActor(req: any) {
    const jwtData = (req as any).jwt_data;
    return { id: jwtData.sub, role: jwtData.role };
}

// All admin routes require a valid access token AND an admin role (re-checked in DB).
adminRouter.use("/admin", accessJWTMiddleware, requireAdmin);

// ─── Users preview + blocking ──────────────────────────────────────────────────
adminRouter.get("/admin/users", async (req, res) => {
    try {
        const data = await adminService.listUsers(req.query);
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

adminRouter.post("/admin/users/:id/block", async (req, res) => {
    try {
        const data = await adminService.setUserBlocked(getActor(req), parseInt(req.params.id, 10), true, getLogInfo(req));
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

adminRouter.post("/admin/users/:id/unblock", async (req, res) => {
    try {
        const data = await adminService.setUserBlocked(getActor(req), parseInt(req.params.id, 10), false, getLogInfo(req));
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

// ─── Audit logs preview (filtering + pagination) ────────────────────────────────
adminRouter.get("/admin/logs", async (req, res) => {
    try {
        const data = await adminService.listLogs(req.query);
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

// ─── Reserved usernames CRUD ────────────────────────────────────────────────────
adminRouter.get("/admin/reserved-usernames", async (req, res) => {
    try {
        const data = await adminService.listReserved(req.query);
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

adminRouter.post("/admin/reserved-usernames", async (req, res) => {
    try {
        const data = await adminService.createReserved(getActor(req), req.body.username, getLogInfo(req));
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

adminRouter.put("/admin/reserved-usernames/:username", async (req, res) => {
    try {
        const data = await adminService.updateReserved(getActor(req), req.params.username, req.body.username, getLogInfo(req));
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

adminRouter.delete("/admin/reserved-usernames/:username", async (req, res) => {
    try {
        const data = await adminService.deleteReserved(getActor(req), req.params.username, getLogInfo(req));
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

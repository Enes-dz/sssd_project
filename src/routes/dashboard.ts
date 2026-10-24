import { Router } from "express";
import { accessJWTMiddleware } from "../middleware/access_jwt";
import { userInfoService } from "../services/user_info";
import { dashboardService } from "../services/dashboard_service";

export const dashboardRouter = Router();

function getLogInfo(req: any) {
    return {
        user_agent: Array.isArray(req.headers["user-agent"])
            ? req.headers["user-agent"][0]
            : req.headers["user-agent"] ?? "Unknown",
        ip_address: req.ip || req.socket.remoteAddress || "Unknown",
    };
}

// Current authenticated user — drives the personalized greeting + security panel.
dashboardRouter.get("/me", accessJWTMiddleware, async (req, res) => {
    try {
        const data = await userInfoService.getUserInfo((req as any).jwt_data);
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

// ─── Change password ─────────────────────────────────────────────────────────
dashboardRouter.post("/dashboard/password/change", accessJWTMiddleware, async (req, res) => {
    try {
        const userId = (req as any).jwt_data.sub;
        const { current_password, new_password } = req.body;
        const data = await dashboardService.changePassword(userId, current_password, new_password, getLogInfo(req));
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

// ─── 2FA management ────────────────────────────────────────────────────────────
dashboardRouter.post("/dashboard/2fa/email/init", accessJWTMiddleware, async (req, res) => {
    try {
        const data = await dashboardService.initEmail2FA((req as any).jwt_data.sub);
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

dashboardRouter.post("/dashboard/2fa/email/confirm", accessJWTMiddleware, async (req, res) => {
    try {
        const userId = (req as any).jwt_data.sub;
        const { setup_token, code } = req.body;
        const data = await dashboardService.confirmCodeMethod(userId, "email", setup_token, code, getLogInfo(req));
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

dashboardRouter.post("/dashboard/2fa/sms/init", accessJWTMiddleware, async (req, res) => {
    try {
        const data = await dashboardService.initSMS2FA((req as any).jwt_data.sub);
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

dashboardRouter.post("/dashboard/2fa/sms/confirm", accessJWTMiddleware, async (req, res) => {
    try {
        const userId = (req as any).jwt_data.sub;
        const { setup_token, code } = req.body;
        const data = await dashboardService.confirmCodeMethod(userId, "sms", setup_token, code, getLogInfo(req));
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

dashboardRouter.post("/dashboard/2fa/totp/init", accessJWTMiddleware, async (req, res) => {
    try {
        const data = await dashboardService.initTOTP2FA((req as any).jwt_data.sub);
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

dashboardRouter.post("/dashboard/2fa/totp/confirm", accessJWTMiddleware, async (req, res) => {
    try {
        const userId = (req as any).jwt_data.sub;
        const { code } = req.body;
        const data = await dashboardService.confirmTOTP2FA(userId, code, getLogInfo(req));
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

dashboardRouter.post("/dashboard/2fa/disable", accessJWTMiddleware, async (req, res) => {
    try {
        const userId = (req as any).jwt_data.sub;
        const { method } = req.body;
        const data = await dashboardService.disable2FA(userId, method, getLogInfo(req));
        res.status(data.status).json(data.data);
    } catch {
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

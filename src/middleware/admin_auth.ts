import { Request, Response, NextFunction } from 'express';
import { userDAO } from '../dao/users';

/**
 * Admin guard. MUST run after accessJWTMiddleware so that (req as any).jwt_data
 * is populated. The role is re-checked against the database (not just the token)
 * so that a demoted or blocked admin loses access immediately, even while still
 * holding a previously issued access token.
 */
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const jwtData = (req as any).jwt_data;
        if (!jwtData || !jwtData.sub) {
            return res.status(401).json({ status: "error", message: "Not authenticated" });
        }
        const user = await userDAO.findUserById(jwtData.sub);
        if (!user) {
            return res.status(401).json({ status: "error", message: "User not found" });
        }
        if (user.is_blocked) {
            return res.status(403).json({ status: "error", message: "Account is blocked" });
        }
        if (user.role !== "admin") {
            return res.status(403).json({ status: "error", message: "Administrator access required" });
        }
        next();
    } catch (error) {
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
}

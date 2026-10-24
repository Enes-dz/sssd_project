import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

/**
 * Verifies the short-lived access token sent in the "auth" header.
 * The access token is signed with jwt_access_secret and carries:
 *   { sub, username, email, role }
 * On success the decoded payload is attached to (req as any).jwt_data.
 */
export const accessJWTMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['auth'];
    if (!authHeader) {
        return res.status(401).json({ status: "error", message: "Authorization header missing" });
    }
    const token = authHeader as string;
    if (!config.jwt_access_secret) {
        console.error("JWT access secret is not defined in the configuration");
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
    try {
        const decoded = jwt.verify(token, config.jwt_access_secret) as any;
        if (!decoded || typeof decoded !== "object" || !decoded.sub) {
            return res.status(403).json({ status: "error", message: "Wrong token type" });
        }
        (req as any).jwt_data = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ status: "error", message: "Invalid or expired token" });
    }
}

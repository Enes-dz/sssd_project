import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export const JWT2FAMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['auth'];
    if (!authHeader) {
        return res.status(401).json({ status: "error", message: "Authorization header missing" });
    }
    const token = authHeader as string;
    if (!config.jwt_2fa_secret) {
        console.error("JWT 2FA secret is not defined in the configuration");
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
    try {
        const decoded = jwt.verify(token, config.jwt_2fa_secret) as { userId: number, method: string, access: string, code: string };
        if (decoded.access !== "2fa"){
            return res.status(403).json({ status: "error", message: "Wrong token type" });
        }
        (req as any).jwt_data = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ status: "error", message: "Invalid or expired token" });
    }
}
        
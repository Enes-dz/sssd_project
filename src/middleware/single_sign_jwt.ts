import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { CustomJWTPayloads } from '../types/express';

export const singleSignOnJWTMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['auth'];
    if (!authHeader) {
        return res.status(401).json({ status: "error", message: "Authorization header missing" });
    }
    const token = authHeader as string;
    if (!config.jwt_single_sign_on_secret) {
        console.error("JWT single sign-on secret is not defined in the configuration");
        return res.status(500).json({ status: "error", message: "Internal server error" });
    }
    try {
        const decoded = jwt.verify(token, config.jwt_single_sign_on_secret) as CustomJWTPayloads;
        if (decoded.type !== "third_party_login") {
            return res.status(403).json({ status: "error", message: "Invalid token type" });
        }
        req.jwt_data = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ status: "error", message: "Invalid or expired token" });
    }
}
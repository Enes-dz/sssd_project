import jwt from "jsonwebtoken";
import { config } from "../config";
import { randomUUID } from "crypto";

export async function signAccessToken(user:any){
    if (!config.jwt_access_secret) {
        throw new Error("JWT access secret is not defined in the configuration");
    }

    const payload = { sub: user.id, username: user.username, email: user.email, role: user.role};
    return jwt.sign(
        payload,
        config.jwt_access_secret,
        { expiresIn: config.jwtAccessTtl as any}
    );
}

export async function signRefreshToken(userId:number){
    if (!config.jwt_refresh_secret) {
        throw new Error("JWT refresh secret is not defined in the configuration");
    }
    const jti = randomUUID();
    const token = jwt.sign(
        { sub: userId },
        config.jwt_refresh_secret,
        { expiresIn : config.jwtRefreshTtl as any, jwtid: jti}
    )
    const decoded = jwt.decode(token);
    if (decoded && typeof decoded !== 'string'){
        const { exp } = decoded as { exp: number };
        return { token, jti, expiresAt: new Date(exp * 1000 )};
    }else{
        throw new Error("Failed to decode refresh token");
    }
}



export async function cookieOpts(expires:any){
    // In production the API and frontend may be on different sites, so the
    // refresh cookie needs SameSite=None (which requires Secure). Locally
    // (HTTP, same origin) browsers drop Secure/None cookies, so fall back to
    // Lax without Secure — matching the trusted-device cookie convention.
    const isProd = config.nodeEnv === "production";
    return {
        httpOnly: true,
        secure: isProd,
        sameSite: (isProd ? "none" : "lax") as "none" | "lax",
        path: "/api",
        expires,
    }
}
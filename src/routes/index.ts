import { Router } from "express";
import { authService } from "../services/auth_service";
import { verificationService } from "../services/verification_service";
import { twoFactorAuthService } from "../services/2fa_auth";
import { config } from "../config";
import { google } from "googleapis";
import { singleSignOnJWTMiddleware } from "../middleware/single_sign_jwt";
import { SingleSignOnJWTPayload } from "../types/express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { trustedDeviceService } from "../services/trusted_device";
import { cookieOpts } from "../utils/jwt_tokens";
import { refreshService } from "../services/refresh_service";
import { dashboardRouter } from "./dashboard";
import { adminRouter } from "./admin";

let issuedStates: Set<string> = new Set();


export const router = Router();

// Post-login dashboards (user security settings + admin management).
router.use(dashboardRouter);
router.use(adminRouter);



router.get("/health", (_req, res) => {
 res.status(200).json({ data: "OK" });
});

router.post("/register", async(_req, res) => {
    try{
        const logInfo = {
            user_agent: Array.isArray(_req.headers["user-agent"])
                ? _req.headers["user-agent"][0]
                : _req.headers["user-agent"] ?? "Unknown",
            ip_address: _req.ip || _req.socket.remoteAddress || "Unknown"
        };
        const data = await authService.validateRegisterData(_req.body, logInfo);
        res.status(data.status).json(data.data);
    }catch(_){
        res.status(500).json({status: "error", message: "Something went wrong" });
    }
 
});

router.post("/login", async(_req, res) => {
 try{
    const logInfo = {
        user_agent: Array.isArray(_req.headers["user-agent"])
            ? _req.headers["user-agent"][0]
            : _req.headers["user-agent"] ?? "Unknown",
        ip_address: _req.ip || _req.socket.remoteAddress || "Unknown"
    }
    
    let trusted_device_token = null;
    if(_req.body.hasOwnProperty("trusted_device_token")){
        trusted_device_token = _req.cookies["trusted_device_token"] || null;
    }

    
    const data = await authService.loginUser(_req.body, trusted_device_token, logInfo);

    if(data.hasOwnProperty("refresh_token") && data.hasOwnProperty("refresh_expires_at")){
        res.cookie("refresh_token", data.refresh_token, await cookieOpts(data.refresh_expires_at));
    }
    res.status(data.status).json(data.data);
 }catch(err){
    res.status(500).json({ status: "error", message: "Something went wrong "});
 }
});



router.get("/verify_email", async (_req, res) => {
    try{
        const logInfo = {
            user_agent: Array.isArray(_req.headers["user-agent"])
                ? _req.headers["user-agent"][0]
                : _req.headers["user-agent"] ?? "Unknown",
            ip_address: _req.ip || _req.socket.remoteAddress || "Unknown"
        };
        const token = _req.query.token as string;
        const data = await verificationService.emailVerification(token, logInfo);
        res.status(data.status).json(data.data);
    }catch(error){
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
})

router.get("/2fa/email", async (_req, res) => {
    try{
        const logInfo = {
            user_agent: Array.isArray(_req.headers["user-agent"])
                ? _req.headers["user-agent"][0]
                : _req.headers["user-agent"] ?? "Unknown",
            ip_address: _req.ip || _req.socket.remoteAddress || "Unknown"
        };
        const token = _req.query.token as string;
        const data = await twoFactorAuthService.initiateEmail2FA(token, logInfo);
        res.status(data.status).json(data.data);
    }catch(error){
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

router.post("/2fa/email/verify", async (_req, res) => {
    try{
        const logInfo = {
            user_agent: Array.isArray(_req.headers["user-agent"])
                ? _req.headers["user-agent"][0]
                : _req.headers["user-agent"] ?? "Unknown",
            ip_address: _req.ip || _req.socket.remoteAddress || "Unknown"
        };
        const jwtToken = _req.headers["auth"] as string;
        const code = _req.body.code as string;
        const data = await twoFactorAuthService.verifyEmail2FA(jwtToken, code, logInfo);
        if(data.hasOwnProperty("refresh_token") && data.hasOwnProperty("refresh_expires_at")){
            res.cookie("refresh_token", data.refresh_token, await cookieOpts(data.refresh_expires_at));
        }
        res.status(data.status).json(data.data);
    }catch(error){
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

router.get("/2fa/sms", async (_req, res) => {
    try{
        const token = _req.query.token as string;
        const data = await twoFactorAuthService.initiateSMS2FA(token);
        res.status(data.status).json(data.data);
    }catch(error){
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

router.post("/2fa/sms/enable", async (_req, res) => {
    try{
        const logInfo = {
            user_agent: Array.isArray(_req.headers["user-agent"])
                ? _req.headers["user-agent"][0]
                : _req.headers["user-agent"] ?? "Unknown",
            ip_address: _req.ip || _req.socket.remoteAddress || "Unknown"
        };
        // Get jwt token from "auth" header and code from body
        const jwtToken = _req.headers["auth"] as string;
        const code = _req.body.code as string;
        const data = await twoFactorAuthService.enableSMS2FA(jwtToken, code, logInfo);
        res.status(data.status).json(data.data);
    }catch(error){
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

router.post("/2fa/sms/verify", async (_req, res) => {
    try{
        const jwtToken = _req.headers["auth"] as string;
        const logInfo = {
            user_agent: Array.isArray(_req.headers["user-agent"])
                ? _req.headers["user-agent"][0]
                : _req.headers["user-agent"] ?? "Unknown",
            ip_address: _req.ip || _req.socket.remoteAddress || "Unknown"
        };
        const code = _req.body.code as string;
        const data = await twoFactorAuthService.verifySMS2FA(jwtToken, code, logInfo);
        if(data.hasOwnProperty("refresh_token") && data.hasOwnProperty("refresh_expires_at")){
            res.cookie("refresh_token", data.refresh_token, await cookieOpts(data.refresh_expires_at));
        }
        res.status(data.status).json(data.data);
    }catch(error){
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

router.get("/2fa/totp", async (_req, res) => {
    try{
        const logInfo = {
            user_agent: Array.isArray(_req.headers["user-agent"])
                ? _req.headers["user-agent"][0]
                : _req.headers["user-agent"] ?? "Unknown",
            ip_address: _req.ip || _req.socket.remoteAddress || "Unknown"
        };
        const token = _req.query.token as string;
        const data = await twoFactorAuthService.initiateTOTP2FA(token, logInfo);
        res.status(data.status).json(data.data);
    }catch(error){
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

router.post("/2fa/totp/verify", async (_req, res) => {
    try{
        const logInfo = {
            user_agent: Array.isArray(_req.headers["user-agent"])
                ? _req.headers["user-agent"][0]
                : _req.headers["user-agent"] ?? "Unknown",
            ip_address: _req.ip || _req.socket.remoteAddress || "Unknown"
        };
        const jwtToken = _req.headers["auth"] as string;
        const code = _req.body.code as string;
        const data = await twoFactorAuthService.verifyTOTP2FA(jwtToken, code, logInfo);
        if(data.hasOwnProperty("refresh_token") && data.hasOwnProperty("refresh_expires_at")){
            res.cookie("refresh_token", data.refresh_token, await cookieOpts(data.refresh_expires_at));
        }
        res.status(data.status).json(data.data);
    }catch(error){
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

router.post("/2fa/reset", async (_req, res) => {
    try{
        const email = _req.body.email as string;
        const recoveryCode = _req.body.recoveryCode as string;
        const data = await twoFactorAuthService.recoveryCodeReset(recoveryCode, email);
        res.status(data.status).json(data.data);
    }catch(error){
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

router.get("/google-login", (_req, res) => {
    const client = new google.auth.OAuth2(
        config.googleClientId,
        config.googleClientSecret,
        config.googleRedirectUri,
    );
    const authUrl = client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: ["openid", "email", "profile"],
    });
    console.log("Generated Google auth URL:", authUrl);
    res.json({ authUrl });
});

router.get("/v1/google-callback", async (req, res) => {
    const code = req.query.code as string | undefined;

    if (!code) {
        console.error("Google callback error: Missing code parameter");

        res.status(400).json({ status: "error", message: "Missing code parameter" });
        return;
    }

    try {
        const client = new google.auth.OAuth2(
            config.googleClientId,
            config.googleClientSecret,
            config.googleRedirectUri,
        );
        const { tokens } = await client.getToken(code);
        console.log("Google tokens:", tokens);
        client.setCredentials(tokens);

        const oauth2 = google.oauth2({ version: "v2", auth: client });
        const { data: userInfo } = await oauth2.userinfo.get();
        console.log("Google userinfo:", userInfo);

        const email = userInfo.email ?? "";
        const fname = userInfo.given_name ?? "";
        const lname = userInfo.family_name ?? "";

        const loginData = await authService.loginWithOauth(email, fname, lname);
        res.status(loginData.status).json(loginData.data);
    } catch (err: any) {
        console.error("Google callback error:", err?.response?.data ?? err);
        res.status(500).json({ status: "error", message: "Google authentication failed" });
    }
});

router.post("/verify-google-register", singleSignOnJWTMiddleware, async (req, res) => {
    try{
        const logInfo = {
            user_agent: Array.isArray(req.headers["user-agent"])
                ? req.headers["user-agent"][0]
                : req.headers["user-agent"] ?? "Unknown",
            ip_address: req.ip || req.socket.remoteAddress || "Unknown"
        };
        const username = req.body.username ?? "";
        const password = req.body.password ?? "";
        const phone_number = req.body.phone_number ?? "";
        const jwtData = req.jwt_data as SingleSignOnJWTPayload;
        const registrationData = await authService.registerOauthUser(username, password, phone_number, jwtData, logInfo);
        res.status(registrationData.status).json(registrationData.data);
    }catch(error){
        res.status(500).json({ status: "error", message: "Internal server error during Google user registration" });
    }
});

router.get("/github-login", (_req, res) => {
    try{
        const state = crypto.randomBytes(16).toString("hex");
        issuedStates.add(state);

        const params = new URLSearchParams({
            client_id: config.githubClientId ?? "",
            redirect_uri: config.githubRedirectUri ?? "",
            scope: "read:user user:email",
            state,
            allow_signup: "false",
        });

        const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
        console.log("Generated GitHub auth URL:", authUrl);
        res.status(200).json({ authUrl });
    
    }catch(error){
        res.status(500).json({ status: "error", message: "Internal server error during GitHub login" });
    }
});

router.get("/v1/github-callback", async (req, res) => {
    try{
        const code = req.query.code as string | undefined;
        if (!code){
            res.status(400).json({ status: "error", message: "Missing code parameter" });
            return;
        }
        const state = req.query.state as string | undefined;
        if (!state || !issuedStates.has(state)) {
            res.status(400).json({ status: "error", message: "Invalid or missing state parameter" });
            return;
        }

        issuedStates.delete(state);

        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: config.githubClientId ?? "",
                client_secret: config.githubClientSecret ?? "",
                code,
                redirect_uri: config.githubRedirectUri ?? "",
            }),
        });

        const { access_token } = (await tokenRes.json()) as { access_token?: string };
        if (!access_token) throw new Error("no_token");

        const userRes = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${access_token}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "SSD_Project",
            },
        });
        const user = (await userRes.json()) as { login: string; name: string | null; email: string | null };
        const email = user.email || "";
        const [fname = "", ...rest] = (user.name || user.login || "").split(" ");
        const lname = rest.join(" ");

        const loginData = await authService.loginWithOauth(email, fname, lname);
        res.status(loginData.status).json(loginData.data);
    }catch(error){
        res.status(500).json({ status: "error", message: "Internal server error during GitHub login" });
    }
});

router.post("/verify-github-register", singleSignOnJWTMiddleware, async (req, res) => {
    try{
        const logInfo = {
            user_agent: Array.isArray(req.headers["user-agent"])
                ? req.headers["user-agent"][0]
                : req.headers["user-agent"] ?? "Unknown",
            ip_address: req.ip || req.socket.remoteAddress || "Unknown"
        };
        const username = req.body.username ?? "";
        const password = req.body.password ?? "";
        const phone_number = req.body.phone_number ?? "";
        const jwtData = req.jwt_data as SingleSignOnJWTPayload;
        const registrationData = await authService.registerOauthUser(username, password, phone_number, jwtData, logInfo);
        res.status(registrationData.status).json(registrationData.data);
    }catch(error){
        res.status(500).json({ status: "error", message: "Internal server error during GitHub user registration" });
    }
});

router.post("/captcha/verify", async(req, res)=>{
    try{
        if (!config.jwt_captcha_secret) {
            throw new Error("JWT captcha secret is not defined in the configuration");
        }

        const jwt_token = req.body.jwt_captcha as string;
        if(!jwt_token){
            res.status(400).json({ status: "error", message: "Missing jwt_captcha parameter" });
            return;
        }
        let decoded;
        try{
            decoded = jwt.verify(jwt_token, config.jwt_captcha_secret) as { email: string, type: string, access: string, success: boolean };
            if(decoded.type !== "captcha"){
                res.status(403).json({ status: "error", message: "Invalid captcha token" });
                return;
            }
        }catch(error){
            res.status(403).json({ status: "error", message: "Invalid captcha token" });
            return;
        }
        const data = new URLSearchParams({
            secret: config.captchaSecretKey ?? "",
            response: req.body["h-captcha-response"],
        });
        const verifyRes = await fetch("https://hcaptcha.com/siteverify", {
            method: "POST",
            body: data,
        });
        const responseData : any = await verifyRes.json();

        if (responseData.success) {
            const jwt_payload = { email: decoded.email, type: "captcha", "access": decoded.access, success: true};
            const newJwtToken = jwt.sign(jwt_payload, config.jwt_captcha_secret, { expiresIn: '10m' });
            res.status(200).json({ status: "success", message: "Captcha passed", jwt_token: newJwtToken });
        } else {
            const jwt_payload = { email: decoded.email, type: "captcha", "access": decoded.access, success: false};
            const newJwtToken = jwt.sign(jwt_payload, config.jwt_captcha_secret, { expiresIn: '10m' });
            res.status(403).json({ status: "error", message: "Captcha failed", jwt_token: newJwtToken });
        }

    }catch(error){
        res.status(500).json({ status: "error", message: "Internal server error during captcha verification" });
    }
});

router.post("/password-reset", async(req, res)=>{
    try{
        const logInfo = {
            user_agent: Array.isArray(req.headers["user-agent"])
                ? req.headers["user-agent"][0]
                : req.headers["user-agent"] ?? "Unknown",
            ip_address: req.ip || req.socket.remoteAddress || "Unknown"
        };
        const email = req.body.email as string;
        const data = await authService.passwordReset(email, logInfo);
        res.status(data.status).json(data.data);
    }catch(error){
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

router.post("/password-reset/verify", async(req, res)=>{
    try{
        const logInfo = {
            user_agent: Array.isArray(req.headers["user-agent"])
                ? req.headers["user-agent"][0]
                : req.headers["user-agent"] ?? "Unknown",
            ip_address: req.ip || req.socket.remoteAddress || "Unknown"
        };
        const token = req.body.token as string;
        const data = await authService.passwordResetVerify(token, req.body.new_password, req.body.email, logInfo);
        res.status(data.status).json(data.data);
    }catch(error){
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

router.post("/trusted-device", async(req, res)=>{
    try{
        const ip_address = req.ip || req.socket.remoteAddress || "Unknown";
        const user_agent = Array.isArray(req.headers["user-agent"])
                ? req.headers["user-agent"][0]
                : req.headers["user-agent"] ?? "Unknown"
        const data = await trustedDeviceService.writeTrustedDevice(req.body.email, user_agent, ip_address);
        if(data.hasOwnProperty("device_token")){
            res.cookie('trusted_device_token', data.device_token, {
                maxAge: data.expires_at, // 30 days in milliseconds
                httpOnly: true,                    // Prevents frontend JS from reading it (Protects against XSS)
                secure: process.env.NODE_ENV === 'production', // true means only sent over HTTPS
                sameSite: 'strict'                // Protects against CSRF attacks
            });
        }
        res.status(data.status).json(data.data);
    }catch(error){
        res.status(500).json({ status: "error", message: "Something went wrong" });
    }
});

router.post("/refresh", async(req, res)=>{
    try{
        const logInfo = {
            user_agent: Array.isArray(req.headers["user-agent"])
                ? req.headers["user-agent"][0]
                : req.headers["user-agent"] ?? "Unknown",
            ip_address: req.ip || req.socket.remoteAddress || "Unknown"
        };
        if (!config.jwt_refresh_secret) {
            throw new Error("JWT refresh secret is not defined in the configuration");
        }
        const rt = req.cookies?.refresh_token;
        if (!rt) {
            return res.status(401).json({ error: "invalid_refresh" });
        }
        let payload;
        try {
            payload = jwt.verify(rt, config.jwt_refresh_secret);
        } catch {
            res.clearCookie('refresh_token', { path: "/api" });
            return res.status(401).json({ error: "invalid_refresh" });
        }
        const data = await refreshService.refreshToken(payload, logInfo);
        if(data.status !== 200){
            res.clearCookie('refresh_token', { path: "/api" });
            return res.status(data.status).json(data.data);
        }
        res.cookie("refresh_token", data.refresh_token, await cookieOpts(data.refresh_expires_at));
        res.status(data.status).json(data.data);


    }catch(error){
        res.clearCookie('refresh_token', { path: "/api" });
        return res.status(500).json({ error: "internal_server_error" });
    }
});

router.post("/logout", async(req, res)=>{
    try{
        const rt = req.cookies?.refresh_token;
        if (!rt) {
            res.clearCookie('refresh_token', { path: "/api" });
            return res.status(401).json({ error: "not_logged_in" });
        }
    
        const logInfo = {
            user_agent: Array.isArray(req.headers["user-agent"])
                ? req.headers["user-agent"][0]
                : req.headers["user-agent"] ?? "Unknown",
            ip_address: req.ip || req.socket.remoteAddress || "Unknown"
        };
        if (!config.jwt_refresh_secret) {
            throw new Error("JWT refresh secret is not defined in the configuration");
        }
        let payload;
        try {                                                                                                                                                                                                                 
            payload = jwt.verify(rt, config.jwt_refresh_secret);
        } catch {
            return res.status(401).json({ error: "invalid_refresh" });                                                                                                                                                          
        }
        const data = await refreshService.logout(payload, logInfo);
        res.clearCookie('refresh_token', { path: "/api" });
        res.status(data.status).json(data.data);

    }catch(error){
        return res.status(500).json({ error: "internal_server_error" });
    }
});


    






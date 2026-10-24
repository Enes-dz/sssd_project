import crypto from "crypto";
import jwt from "jsonwebtoken";
import qrcode from "qrcode";
import { config } from "../config";
import { userDAO } from "../dao/users";
import { allLogsDAO } from "../dao/all_logs";
import { refreshTokensDAO } from "../dao/refresh_tokens";
import { comparePasswords, hashPassword } from "../utils/hashing";
import { validatePassword } from "../utils/data_validation";
import { haveIBeenPwnedCheck } from "../utils/HIBP";
import { send_email_login_code } from "../utils/send_email";
import { sendSMS } from "../utils/send_sms";
import { generateTOTPSecret, verifyTOTPToken } from "../utils/totp_secret";
import { generateRecoveryCode } from "../utils/recovery_code";

type LogInfo = { user_agent: string, ip_address: string };

// Dashboard 2FA setup tokens are signed with the 2FA secret but carry a distinct
// access marker so they cannot be confused with login-time 2FA tokens.
const SETUP_ACCESS = "2fa_dashboard_setup";

function sha256(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function countEnabled(user: any): number {
    return (user.sms_enabled ? 1 : 0) + (user.email_enabled ? 1 : 0) + (user.totp_enabled ? 1 : 0);
}

class DashboardService {

    // ─── Change password ─────────────────────────────────────────────────────
    async changePassword(userId: number, currentPassword: string, newPassword: string, logInfo: LogInfo) {
        try {
            if (!currentPassword || !newPassword) {
                return { status: 400, data: { status: "error", message: "Current and new password are required." } };
            }
            const user = await userDAO.findUserById(userId);
            if (!user) {
                return { status: 404, data: { status: "error", message: "User not found." } };
            }

            const matches = await comparePasswords(currentPassword, user.password);
            if (!matches) {
                await allLogsDAO.logEvent({
                    user_agent: logInfo.user_agent, user_id: userId, user_role: user.role,
                    ip_address: logInfo.ip_address, action: "change_password",
                    status: "failed(wrong_current_password)", event_type: "password_change",
                });
                return { status: 401, data: { status: "error", message: "Current password is incorrect." } };
            }

            if (currentPassword === newPassword) {
                return { status: 400, data: { status: "error", message: "New password must be different from the current one." } };
            }

            const validation = await validatePassword(newPassword);
            if (!validation.valid) {
                return { status: 400, data: { status: "error", message: validation.message || "Invalid password." } };
            }
            if (await haveIBeenPwnedCheck(newPassword)) {
                return { status: 400, data: { status: "error", message: "This password has been exposed in a data breach. Please choose a different one." } };
            }

            const hashed = await hashPassword(newPassword);
            await userDAO.updatePasswordById(userId, hashed);
            // Invalidate every existing session so other devices must re-authenticate.
            await refreshTokensDAO.revokeAllForUser(userId);

            await allLogsDAO.logEvent({
                user_agent: logInfo.user_agent, user_id: userId, user_role: user.role,
                ip_address: logInfo.ip_address, action: "change_password", status: "success",
                event_type: "password_change", object_changed: "password",
                original_object: user.password, new_object: hashed,
            });

            return { status: 200, data: { status: "success", message: "Password changed successfully. Please sign in again." } };
        } catch (error) {
            return { status: 500, data: { status: "error", message: "Internal server error during password change." } };
        }
    }

    // ─── Enable e-mail 2FA ─────────────────────────────────────────────────────
    async initEmail2FA(userId: number) {
        try {
            if (!config.jwt_2fa_secret) throw new Error("JWT 2FA secret not configured");
            const user = await userDAO.findUserById(userId);
            if (!user) return { status: 404, data: { status: "error", message: "User not found." } };
            if (user.email_enabled) return { status: 400, data: { status: "error", message: "Email 2FA is already enabled." } };

            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const token = jwt.sign(
                { userId, method: "email", access: SETUP_ACCESS, code: sha256(code) },
                config.jwt_2fa_secret,
                { expiresIn: "10m" }
            );
            await send_email_login_code(user.email, code);
            return { status: 200, data: { status: "success", message: "A verification code was sent to your email.", setup_token: token } };
        } catch (error) {
            return { status: 500, data: { status: "error", message: "Failed to start email 2FA setup." } };
        }
    }

    async initSMS2FA(userId: number) {
        try {
            if (!config.jwt_2fa_secret) throw new Error("JWT 2FA secret not configured");
            const user = await userDAO.findUserById(userId);
            if (!user) return { status: 404, data: { status: "error", message: "User not found." } };
            if (user.sms_enabled) return { status: 400, data: { status: "error", message: "SMS 2FA is already enabled." } };

            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const token = jwt.sign(
                { userId, method: "sms", access: SETUP_ACCESS, code: sha256(code) },
                config.jwt_2fa_secret,
                { expiresIn: "10m" }
            );
            await sendSMS(user.phone_number, code);
            return { status: 200, data: { status: "success", message: "A verification code was sent to your phone.", setup_token: token } };
        } catch (error) {
            return { status: 500, data: { status: "error", message: "Failed to start SMS 2FA setup." } };
        }
    }

    // Shared confirm for the code-based methods (email / sms).
    async confirmCodeMethod(userId: number, method: "email" | "sms", setupToken: string, code: string, logInfo: LogInfo) {
        try {
            if (!config.jwt_2fa_secret) throw new Error("JWT 2FA secret not configured");
            if (!setupToken || !code) {
                return { status: 400, data: { status: "error", message: "Missing setup token or code." } };
            }
            let decoded: any;
            try {
                decoded = jwt.verify(setupToken, config.jwt_2fa_secret);
            } catch {
                return { status: 400, data: { status: "error", message: "Setup session expired. Please try again." } };
            }
            if (decoded.access !== SETUP_ACCESS || decoded.method !== method || decoded.userId !== userId) {
                return { status: 400, data: { status: "error", message: "Invalid setup token." } };
            }
            if (decoded.code !== sha256(code)) {
                return { status: 400, data: { status: "error", message: "Incorrect verification code." } };
            }

            await userDAO.updateUser2FAStatus(userId, method);
            const recovery = await this.ensureRecoveryCode(userId);

            await allLogsDAO.logEvent({
                user_agent: logInfo.user_agent, user_id: userId, user_role: "user",
                ip_address: logInfo.ip_address, action: `enable_${method}_2fa`,
                status: "success", event_type: "2fa_settings",
            });

            return { status: 200, data: { status: "success", message: `${method.toUpperCase()} 2FA enabled.`, recovery_code: recovery } };
        } catch (error) {
            return { status: 500, data: { status: "error", message: "Failed to enable 2FA method." } };
        }
    }

    // ─── Enable TOTP 2FA ───────────────────────────────────────────────────────
    async initTOTP2FA(userId: number) {
        try {
            const user = await userDAO.findUserById(userId);
            if (!user) return { status: 404, data: { status: "error", message: "User not found." } };
            if (user.totp_enabled) return { status: 400, data: { status: "error", message: "TOTP 2FA is already enabled." } };

            const totp = generateTOTPSecret(user.username);
            await userDAO.setPendingTOTPSecret(userId, totp.secret);
            const qrCode = await qrcode.toDataURL(totp.otpAuthUri);
            return {
                status: 200,
                data: {
                    status: "success",
                    message: "Scan the QR code in your authenticator app, then enter a code to confirm.",
                    otpauth_uri: totp.otpAuthUri,
                    qr_code: qrCode,
                }
            };
        } catch (error) {
            return { status: 500, data: { status: "error", message: "Failed to start TOTP 2FA setup." } };
        }
    }

    async confirmTOTP2FA(userId: number, code: string, logInfo: LogInfo) {
        try {
            if (!code) return { status: 400, data: { status: "error", message: "Verification code is required." } };
            const user = await userDAO.findUserById(userId);
            if (!user || !user.totp_secret) {
                return { status: 400, data: { status: "error", message: "Start TOTP setup first." } };
            }
            const valid = await verifyTOTPToken(user.totp_secret, code);
            if (!valid) {
                return { status: 400, data: { status: "error", message: "Incorrect authenticator code." } };
            }
            await userDAO.enableTOTP(userId);
            const recovery = await this.ensureRecoveryCode(userId);

            await allLogsDAO.logEvent({
                user_agent: logInfo.user_agent, user_id: userId, user_role: user.role,
                ip_address: logInfo.ip_address, action: "enable_totp_2fa",
                status: "success", event_type: "2fa_settings",
            });

            return { status: 200, data: { status: "success", message: "TOTP 2FA enabled.", recovery_code: recovery } };
        } catch (error) {
            return { status: 500, data: { status: "error", message: "Failed to enable TOTP 2FA." } };
        }
    }

    // ─── Disable a 2FA method (at least one must remain) ───────────────────────
    async disable2FA(userId: number, method: "sms" | "email" | "totp", logInfo: LogInfo) {
        try {
            if (!["sms", "email", "totp"].includes(method)) {
                return { status: 400, data: { status: "error", message: "Invalid 2FA method." } };
            }
            const user = await userDAO.findUserById(userId);
            if (!user) return { status: 404, data: { status: "error", message: "User not found." } };

            const isEnabled = method === "sms" ? user.sms_enabled : method === "email" ? user.email_enabled : user.totp_enabled;
            if (!isEnabled) {
                return { status: 400, data: { status: "error", message: `${method.toUpperCase()} 2FA is not enabled.` } };
            }
            if (countEnabled(user) <= 1) {
                return { status: 400, data: { status: "error", message: "At least one 2FA method must remain enabled." } };
            }

            await userDAO.disable2FAMethod(userId, method);
            await allLogsDAO.logEvent({
                user_agent: logInfo.user_agent, user_id: userId, user_role: user.role,
                ip_address: logInfo.ip_address, action: `disable_${method}_2fa`,
                status: "success", event_type: "2fa_settings",
            });

            return { status: 200, data: { status: "success", message: `${method.toUpperCase()} 2FA disabled.` } };
        } catch (error) {
            return { status: 500, data: { status: "error", message: "Failed to disable 2FA method." } };
        }
    }

    // Generate and persist a recovery code if the user does not have one yet.
    // Returns the plaintext code only when newly created (so it can be shown once).
    private async ensureRecoveryCode(userId: number): Promise<string | null> {
        const exists = await userDAO.recoveryCodeExists(userId);
        if (exists) return null;
        const recovery = await generateRecoveryCode();
        await userDAO.saveRecoveryCode(userId, recovery.hashedCode);
        return recovery.plainCode;
    }
}

export const dashboardService = new DashboardService();

import { userDAO } from "../dao/users";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { sendSMS } from "../utils/send_sms";
import crypto from "crypto";
import { generateTOTPSecret, verifyTOTPToken } from "../utils/totp_secret";
import qrcode from "qrcode";
import { generateRecoveryCode, verifyRecoveryCode } from "../utils/recovery_code";
import { refreshTokensDAO } from "../dao/refresh_tokens";
import { signAccessToken, signRefreshToken } from "../utils/jwt_tokens";
import { allLogsDAO } from "../dao/all_logs";


class TwoFactorAuthService {
    private jwtSecret = config.jwt_secret;

    async initiateEmail2FA(token:string, logInfo: {user_agent:string, ip_address: string}){
        try{
            if (!token) {
                return { status: 400, data: { errors: ["Missing 2FA setup token."] } };
            }
            //Check if token exists and is valid
            const userData = await userDAO.get2FASetupToken(token);
            if (!userData) {
                return { status: 400, data: { errors: ["Invalid 2FA setup token."] } };
            }

            //Check if user has already enabled email 2FA
            if(userData.email_enabled){
                return { status: 400, data: { errors: ["Email 2FA is already enabled for this user."] } };
            }

            //Check if token is expired
            if(userData && userData["2fa_setup_token_expires_at"] < Date.now()){
                return { status: 400, data: { errors: ["2FA setup token has expired. Please request a new one."] } };
            }

            //Update database for email_enabled = true and clear setup token
            await userDAO.updateUser2FAStatus(userData.id, "email");

            // Check if user has recovery code, if not generate and save one
            const hasRecoveryCode = await userDAO.recoveryCodeExists(userData.id);
            // Log 2FA event
            await allLogsDAO.log2FAEvent(
                logInfo.user_agent,
                userData.id,
                "user",
                logInfo.ip_address,
                "enable_email_2fa",
                "success",
                "2fa_setup"
            );

            if (!hasRecoveryCode) {
                const recoveryCode = await generateRecoveryCode();
                // Saverecovery code in database

                await userDAO.saveRecoveryCode(userData.id, recoveryCode.hashedCode);

                return { status: 200, data: { message: "Email 2FA setup successful. Use the following recovery code if you lose access to your email: " + recoveryCode.plainCode } };
            }


            return { status: 200, data: { message: "Email 2FA setup successful. Log in to your account." } };


        }catch(error){            
            console.error("2FA Setup Failed", error);
            return { status: 500, data: { errors: ["Failed to initiate 2FA setup."] } };
        }
    }

    async initiateSMS2FA(token:string){
        try{
            if (!token) {
                return { status: 400, data: { errors: ["Missing 2FA setup token."] } };
            }
            if (!this.jwtSecret) {
                throw new Error("JWT secret is not defined in configuration");
            }   

            //Check if token exists and is valid
            const userData = await userDAO.get2FASetupToken(token);
            if (!userData) {
                return { status: 400, data: { errors: ["Invalid 2FA setup token."] } };
            }

            //Check if user has already enabled SMS 2FA
            if(userData.sms_enabled){
                return { status: 400, data: { errors: ["SMS 2FA is already enabled for this user."] } };
            }

            //Check if token is expired
            if(userData && userData["2fa_setup_token_expires_at"] < Date.now()){
                return { status: 400, data: { errors: ["2FA setup token has expired. Please request a new one."] } };
            }

            //Generate 6 code and send SMS and encrypt code with JWT
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const hashedCode = crypto.createHash('sha256').update(code).digest('hex');

            const payload = {
                userId: userData.id,
                code: hashedCode
            }
            const encryptedCode = jwt.sign(payload, this.jwtSecret, { expiresIn: '10m' });
            await sendSMS(userData.mobile_number, code);
            return { status: 200, data: { message: "Please enter the code sent to your phone.", sms_code: encryptedCode } };
        }catch(error){
            console.error("2FA Setup Failed", error);
            return { status: 500, data: { errors: ["Failed to initiate 2FA setup."] } };
        }
    }

    async enableSMS2FA(jwtToken:string, code:string, logInfo: {user_agent:string, ip_address: string}){
        try{
            if (!this.jwtSecret) {
                throw new Error("JWT secret is not defined in configuration");
            }

            if (!jwtToken) {
                return { status: 400, data: { errors: ["Missing authentication token."] } };
            }

            if (!code) {
                return { status: 400, data: { errors: ["Missing SMS code."] } };
            }
            //Verify JWT token and extract userId and hashed code
            const decoded = jwt.verify(jwtToken, this.jwtSecret) as { userId: number, code: string };
            const userId = decoded.userId;
            const hashedCode = decoded.code;

            //Hash the code provided by user and compare with hashed code in JWT
            const hashedProvidedCode = crypto.createHash('sha256').update(code).digest('hex');

            if (hashedProvidedCode !== hashedCode) {
                return { status: 400, data: { errors: ["Invalid code."] } };
            }

            //Update database for sms_enabled = true and clear setup token
            await userDAO.updateUser2FAStatus(userId, "sms");

            // Check if user has recovery code, if not generate and save one
            const hasRecoveryCode = await userDAO.recoveryCodeExists(userId);

            // Log 2FA event
            await allLogsDAO.log2FAEvent(
                logInfo.user_agent,
                userId,
                "user",
                logInfo.ip_address,
                "enable_sms_2fa",
                "success",
                "2fa_setup"
            );

            if (!hasRecoveryCode) {
                const recoveryCode = await generateRecoveryCode();
                await userDAO.saveRecoveryCode(userId, recoveryCode.hashedCode);

                return { status: 200, data: { message: "SMS 2FA setup successful. Use the following recovery code if you lose access to your phone: " + recoveryCode.plainCode } };
            }

            return { status: 200, data: { message: "SMS 2FA setup successful. Log in to your account." } };
        }catch(error){
            console.error("Enabling SMS 2FA Failed", error);
            return { status: 500, data: { errors: ["Failed to enable SMS 2FA."] } };
        }
    }



    async initiateTOTP2FA(token:string, logInfo: {user_agent:string, ip_address: string}){
        try{
            if (!token) {
                return { status: 400, data: { errors: ["Missing 2FA setup token."] } };
            }
            
            //Check if token exists and is valid
            const userData = await userDAO.get2FASetupToken(token);

            if (!userData) {
                return { status: 400, data: { errors: ["Invalid 2FA setup token."] } };
            }

            //Check if user has already enabled TOTP 2FA
            if(userData.totp_enabled){
                return { status: 400, data: { errors: ["TOTP 2FA is already enabled for this user."] } };
            }

            //Check if token is expired
            if(userData && userData["2fa_setup_token_expires_at"] < Date.now()){
                return { status: 400, data: { errors: ["2FA setup token has expired. Please request a new one."] } };
            }

            //Generate TOTP secret 
            const totpSecret = generateTOTPSecret(userData.username);

            //Save TOTP secret in database

            await userDAO.updateUserTOTPSecret(userData.id, totpSecret.secret);

            // Check if user has recovery code, if not generate and save one
            const hasRecoveryCode = await userDAO.recoveryCodeExists(userData.id);
            // Log 2FA event
            await allLogsDAO.log2FAEvent(
                logInfo.user_agent,
                userData.id,
                "user",
                logInfo.ip_address,
                "enable_totp_2fa",
                "success",
                "2fa_setup"
            );

            if (!hasRecoveryCode) {
                const recoveryCode = await generateRecoveryCode();
                await userDAO.saveRecoveryCode(userData.id, recoveryCode.hashedCode);
                return { 
                    status: 200, 
                    data: { 
                        message: "TOTP 2FA setup successful. Use the following secret in your authenticator app. Save recovery code in a safe place in case you lose access to your authenticator app: " + recoveryCode.plainCode, 
                        totp_secret: totpSecret.otpAuthUri, 
                        qrCode: await qrcode.toDataURL(totpSecret.otpAuthUri) 
                    } 
                };
            }

            return { 
                status: 200, 
                data: { 
                    message: "TOTP 2FA setup successful. Use the following secret in your authenticator app.", 
                    totp_secret: totpSecret.otpAuthUri, 
                    qrCode: await qrcode.toDataURL(totpSecret.otpAuthUri) 
                } 
            };
        }catch(error){
            console.error("2FA Setup Failed", error);
            return { status: 500, data: { errors: ["Failed to initiate TOTP 2FA setup."] } };
        }
    }

    async recoveryCodeReset(recoveryCode: string, email: string){
        try{
            if (!recoveryCode) {
                return { status: 400, data: { errors: ["Missing recovery code."] } };
            }
            if (!email) {
                return { status: 400, data: { errors: ["Missing email."] } };
            }

            //Get user by email
            const user = await userDAO.findUserByEmail(email);

            if (!user) {
                return { status: 400, data: { errors: ["Invalid email."] } };
            }

            //Verify recovery code
            const isValidCode = await verifyRecoveryCode(recoveryCode, user.recovery_code);
            if (!isValidCode) {
                return { status: 400, data: { errors: ["Invalid recovery code."] } };
            }

            //Reset all 2FA methods for user
            await userDAO.reset2FA(email);

            //Delete recovery code
            await userDAO.deleteRecoveryCode(email);

            return { status: 200, data: { message: "2FA reset successful. You can now log in and set up 2FA again." } };
        }catch(error){
            console.error("2FA Reset Failed", error);
            return { status: 500, data: { errors: ["Failed to reset 2FA."] } };
        }
    }

    async verifyTOTP2FA(jwtToken:string, code:string, logInfo: {user_agent:string, ip_address: string}){
        try{
            if (!config.jwt_2fa_secret) {
                throw new Error("JWT secret is not defined in configuration");
            }
            if (!jwtToken) {
                return { status: 400, data: { errors: ["Missing authentication token."] } };
            }
            if (!code) {
                return { status: 400, data: { errors: ["Missing TOTP code."] } };
            }

            //Verify JWT token and extract userId
            try {
                const decoded = jwt.verify(jwtToken, config.jwt_2fa_secret) as { userId: number, method: string, access: string, code: string };
                const userId = decoded.userId;
                const method = decoded.method;
                const access = decoded.access;
                if (access !== "2fa" || method !== "totp") {
                    return { status: 400, data: { errors: ["Invalid authentication token."] } };
                }
                const user = await userDAO.findUserById(userId);
                if (!user) {
                    return { status: 400, data: { errors: ["User not found."] } };
                }
                //Verify TOTP code
                const isValidCode = await verifyTOTPToken(user.totp_secret, code);
                if (!isValidCode) {
                    return { status: 400, data: { errors: ["Invalid TOTP code."] } };
                }
                //Generate new JWT token for authenticated session
                if (!config.jwt_access_secret) {
                    throw new Error("JWT access secret is not defined in configuration");
                }
                const accessToken = await signAccessToken(user);
                const { token: refresh, jti, expiresAt } = await signRefreshToken(user.id);
                await refreshTokensDAO.insertRefreshToken(jti, user.id, expiresAt, logInfo.user_agent, logInfo.ip_address);

                // Log 2FA event
                await allLogsDAO.log2FAEvent(
                    logInfo.user_agent,
                    user.id,
                    "user",
                    logInfo.ip_address,
                    "verify_totp_2fa",
                    "success",
                    "login"
                );


                return { status: 200, data: { message: "TOTP 2FA verification successful.", access_token: accessToken },
                    refresh_token: refresh,
                    refresh_expires_at: expiresAt
                };

            }catch(error){
                return { status: 400, data: { errors: ["Invalid or expired authentication token."] } };
            }
        }catch(error){
            console.error("TOTP 2FA Verification Failed", error);
            return { status: 500, data: { errors: ["Failed to verify TOTP code."] } };
        }
    }

    async verifySMS2FA(jwtToken:string, code:string, logInfo: {user_agent:string, ip_address: string}){
        try{
            if (!config.jwt_2fa_secret) {
                throw new Error("JWT secret is not defined in configuration");
            }
            if (!jwtToken) {
                return { status: 400, data: { errors: ["Missing authentication token."] } };
            }
            if (!code) {
                return { status: 400, data: { errors: ["Missing SMS code."] } };
            }
            //Verify JWT token and extract userId and hashed code
            try {
                const decoded = jwt.verify(jwtToken, config.jwt_2fa_secret) as { userId: number, method: string, access: string, code: string };
                const userId = decoded.userId;
                const method = decoded.method;
                const access = decoded.access;
                const decoded_code = decoded.code;
                if (access !== "2fa" || method !== "sms") {
                    return { status: 400, data: { errors: ["Invalid authentication token."] } };
                }
                const user = await userDAO.findUserById(userId);
                if (!user) {
                    return { status: 400, data: { errors: ["User not found."] } };
                }
                if (decoded_code !== code){
                    return { status: 400, data: { errors: ["Invalid SMS code."] } };
                }
                //Generate new JWT token for authenticated session
                if (!config.jwt_access_secret) {
                    throw new Error("JWT access secret is not defined in configuration");
                }

                const accessToken = await signAccessToken(user);
                const { token: refresh, jti, expiresAt } = await signRefreshToken(user.id);
                await refreshTokensDAO.insertRefreshToken(jti, user.id, expiresAt, logInfo.user_agent, logInfo.ip_address);
                // Log 2FA event
                await allLogsDAO.log2FAEvent(
                    logInfo.user_agent,
                    user.id,
                    "user",
                    logInfo.ip_address,
                    "verify_sms_2fa",
                    "success",
                    "login"
                );
                return { status: 200, data: { message: "SMS 2FA verification successful.", access_token: accessToken },
                    refresh_token: refresh,
                    refresh_expires_at: expiresAt
                };
            }catch(error){
                return { status: 400, data: { errors: ["Invalid or expired authentication token."] } };
            }
        }catch(error){
            console.error("SMS 2FA Verification Failed", error);
            return { status: 500, data: { errors: ["Failed to verify SMS code."] } };
        }
    }

    async verifyEmail2FA(jwtToken:string, code:string, logInfo: {user_agent:string, ip_address: string}){
        try{
            if (!config.jwt_2fa_secret) {
                throw new Error("JWT secret is not defined in configuration");
            }
            if (!jwtToken) {
                return { status: 400, data: { errors: ["Missing authentication token."] } };
            }
            if (!code) {
                return { status: 400, data: { errors: ["Missing email code."] } };
            }
            //Verify JWT token and extract userId and hashed code
            try {
                const decoded = jwt.verify(jwtToken, config.jwt_2fa_secret) as { userId: number, method: string, access: string, code: string };
                const userId = decoded.userId;
                const method = decoded.method;
                const access = decoded.access;
                const decoded_code = decoded.code;
                if (access !== "2fa" || method !== "email") {
                    return { status: 400, data: { errors: ["Invalid authentication token."] } };
                }
                const user = await userDAO.findUserById(userId);
                if (!user) {
                    return { status: 400, data: { errors: ["User not found."] } };
                }
                if (decoded_code !== code){
                    return { status: 400, data: { errors: ["Invalid email code."] } };
                }
                //Generate new JWT token for authenticated session
                if (!config.jwt_access_secret) {
                    throw new Error("JWT access secret is not defined in configuration");
                }
                const accessToken = await signAccessToken(user);
                const { token: refresh, jti, expiresAt } = await signRefreshToken(user.id);
                await refreshTokensDAO.insertRefreshToken(jti, user.id, expiresAt, logInfo.user_agent, logInfo.ip_address);
                // Log 2FA event
                await allLogsDAO.log2FAEvent(
                    logInfo.user_agent,
                    user.id,
                    "user",
                    logInfo.ip_address,
                    "verify_email_2fa",
                    "success",
                    "login"
                );
                return { status: 200, data: { message: "Email 2FA verification successful.", access_token: accessToken },
                    refresh_token: refresh,
                    refresh_expires_at: expiresAt
                };
            }catch(error){
                return { status: 400, data: { errors: ["Invalid or expired authentication token."] } };
            }
        }catch(error){
            console.error("Email 2FA Verification Failed", error);
            return { status: 500, data: { errors: ["Failed to verify email code."] } };
        }
    }

}

export const twoFactorAuthService = new TwoFactorAuthService();
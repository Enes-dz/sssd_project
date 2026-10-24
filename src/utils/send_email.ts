import nodeemailer from "nodemailer";
import { config } from "../config";

export async function send_verification_email(email: string, token: string) {
    const transporter = nodeemailer.createTransport({
        host: config.smtp_host,
        port: Number(config.smtp_port),
        secure: true,
        auth: {
            user: config.smtp_user,
            pass: config.smtp_pass
        }
    });

    try{
        const verificationLink = `${config.baseUrl}/api/verify_email?token=` + token;
        const info = await transporter.sendMail({
            from: `${config.smtp_user}`,
            to: email,
            subject: "Email Verification",
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
                    <h1>Welcome!</h1>
                    <p>Please click the link below to verify your email address:</p>
                    <a href="${verificationLink}" 
                    style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    Verify My Account
                    </a>
                    <p style="margin-top: 20px; font-size: 0.8em; color: #666;">
                    This link will expire in 15 minutes.
                    </p>
                </div>
                `
        });
    }catch(error){
        console.error("Failed to send verification email:", error);
        throw new Error("Failed to send verification email");
    }
}

export async function send_email_login_code(email: string, code: string) {
    const transporter = nodeemailer.createTransport({
        host: config.smtp_host,
        port: Number(config.smtp_port),
        secure: true,
        auth: {
            user: config.smtp_user,
            pass: config.smtp_pass
        }
    });

    try{
        const info = await transporter.sendMail({
            from: `${config.smtp_user}`,
            to: email,
            subject: "Your Login Code",
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
                    <h1>Your Login Code</h1>
                    <p>Your one-time login code is:</p>
                    <h2>${code}</h2>
                    <p style="margin-top: 20px; font-size: 0.8em; color: #666;">
                    This code will expire in 5 minutes.
                    </p>
                </div>
                `
        });
    }catch(error){
        console.error("Failed to send login code email:", error);
        throw new Error("Failed to send login code email");
    }
}

export async function send_2fa_code_email(email: string, code: string) {
    const transporter = nodeemailer.createTransport({
        host: config.smtp_host,
        port: Number(config.smtp_port),
        secure: true,
        auth: {
            user: config.smtp_user,
            pass: config.smtp_pass
        }
    });
    const email_verification_link = `${config.baseUrl}/api/2fa/email?token=` + code;
    const sms_verification_link = `${config.baseUrl}/api/2fa/sms?token=` + code;
    const totp_verification_link = `${config.baseUrl}/front/totp-setup.html?token=` + code;
    try{
        const info = await transporter.sendMail({
            from: `${config.smtp_user}`,
            to: email,
            subject: "Enable 2FA for Your Account",
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
                    <h1>Choose Your 2FA Method</h1>
                    <p>Please click one of the links below to set up your preferred 2FA method:</p>
                    <a href="${email_verification_link}" 
                    style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">
                    Set Up Email 2FA
                    </a>
                    <a href="${sms_verification_link}"
                    style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">
                    Set Up SMS 2FA
                    </a>
                    <a href="${totp_verification_link}"
                    style="background: #17a2b8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    Set Up TOTP 2FA
                    </a>
                    <p style="margin-top: 20px; font-size: 0.8em; color: #666;">
                    These links will expire in 10 minutes.
                    </p>
                </div>
                `
        });
    }catch(error){
        console.error("Failed to send 2FA setup email:", error);
        throw new Error("Failed to send 2FA setup email");
    }
}

export async function send_password_reset_email(email: string, resetToken: string) {
    const transporter = nodeemailer.createTransport({
        host: config.smtp_host,
        port: Number(config.smtp_port),
        secure: true,
        auth: {
            user: config.smtp_user,
            pass: config.smtp_pass
        }
    });

    try{
        const resetLink = `${config.baseUrl}/api/password-reset?email=` + email + "&token=" + resetToken;
        const message = {
            from: config.infobipBaseUrl,
            to: email,
            subject: "Password Reset",
            text: "Please click the following link to reset your password: " + resetLink
        };
        await transporter.sendMail(message);
    }catch(error){
        console.error("Failed to send password reset email:", error);
        throw new Error("Failed to send password reset email");
    }
}
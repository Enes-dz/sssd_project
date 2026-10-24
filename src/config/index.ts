import { info } from "console";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const config = {
 port: process.env.PORT || 3000,
 nodeEnv: process.env.NODE_ENV,
 // Public base URL of this app, used to build links in emails and API docs.
 // Override via BASE_URL in production; defaults to local dev.
 baseUrl: `http://localhost:${process.env.PORT || 3000}`,
 infobipBaseUrl: process.env.TEXT_MESSAGE_BASE_URL,
 infobipApiKey: process.env.TEXT_MESSAGE_API_KEY,
 db_host: process.env.DB_HOST,
 db_port: process.env.DB_PORT,
 db_name: process.env.DB_NAME,
 db_user: process.env.DB_USER,
 db_password: process.env.DB_PASSWORD,
    smtp_host: process.env.SMTP_HOST,
    smtp_port: process.env.SMTP_PORT,
    smtp_user: process.env.SMTP_USER,
    smtp_pass: process.env.SMTP_PASS,
    jwt_secret: process.env.JWT_ACCESS_SECRET,
    jwt_2fa_secret: process.env.JWT_ACCESS_SECRET,
    jwt_access_secret: process.env.JWT_ACCESS_SECRET,
    jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
    jwt_single_sign_on_secret: process.env.JWT_ACCESS_SECRET,
    jwt_captcha_secret: process.env.JWT_ACCESS_SECRET,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
    githubClientId: process.env.GITHUB_CLIENT_ID,
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
    githubRedirectUri: process.env.GITHUB_REDIRECT_URI,
    captchaSiteKey: process.env.HCAPTCHA_SITE_KEY,
    captchaSecretKey: process.env.HCAPTCHA_SERVER_SECRET,
    jwtAccessTtl: process.env.JWT_ACCESS_TTL || '300s',
    jwtRefreshTtl: process.env.JWT_REFRESH_TTL || '7d',
};
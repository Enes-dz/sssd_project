import { userDAO } from "../dao/users";
import { reservedUserDAO } from "../dao/reserved_users";
import { haveIBeenPwnedCheck } from "../utils/HIBP";
import { hashPassword, comparePasswords } from "../utils/hashing";
import { emailFormatIsValid, isValidTLD, isDomainValid } from "../utils/email_validation";
import { send_verification_email,  send_2fa_code_email} from "../utils/send_email";
import { sendSMS } from "../utils/send_sms";
import crypto from "crypto";
import { loginEventDAO } from "../dao/login_events";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { validateUsername, validatePassword, validatePhoneNumber } from "../utils/data_validation";
import { send_password_reset_email } from "../utils/send_email";
import { allLogsDAO } from "../dao/all_logs";
import { trustedDeviceDAO } from "../dao/trusted_device";
import { signAccessToken, signRefreshToken } from "../utils/jwt_tokens";
import { refreshTokensDAO } from "../dao/refresh_tokens";




export class AuthService {



  async validateRegisterData(data: any, logInfo: {user_agent:string, ip_address: string}): Promise<{ status: number, data: any }> {
    try{
      if (!data || typeof data !== 'object') {
        return { status: 400, data: { errors: ["Invalid input data"] } };
      }

      if (!data.hasOwnProperty("full_name") || !data.hasOwnProperty("username") || !data.hasOwnProperty("password") || !data.hasOwnProperty("email") || !data.hasOwnProperty("phone_number")) {
        return { status: 400, data: { errors: ["Missing required fields"] } };
      }
      const { full_name, username, password, email, phone_number } = data;

      const errors: string[] = [];

      // 1. Full Name Validation
      if (!full_name || full_name.length < 3 || full_name.length > 100) {
        errors.push("Full name must be between 3 and 100 characters.");
      }
      if (/<script|<html>|<\//i.test(full_name)) {
        errors.push("Full name contains invalid HTML or Script tags.");
      }

      // 2. Username Validation
      const usernameValidationResult = await validateUsername(username);
      if (!usernameValidationResult.valid) {
        errors.push(usernameValidationResult.message || "Invalid username.");
      }
      
      const existingUserByEmail = await userDAO.findUserByEmail(email);
      if (existingUserByEmail) {
        errors.push("Email is already registered.");
      }


      // 3. Password Validation
      // Logic: 8+ chars, 1 upper, 1 lower, 1 number, 1 special
      const passwordValidationResult = await validatePassword(password);
      if (!passwordValidationResult.valid) {
        errors.push(passwordValidationResult.message || "Invalid password.");
      }

      // 4. Email Validation
      if (!emailFormatIsValid(email)) {
        errors.push("Invalid email format.");
      }
      if (!await isValidTLD(email)) {
        errors.push("Email domain has an invalid top-level domain (TLD).");
      }
      if (!await isDomainValid(email)) {
        errors.push("Email domain does not exist or cannot receive emails.");
      }

      // 5. Phone Number Validation via library
      const phoneValidationResult = await validatePhoneNumber(phone_number);
      if (!phoneValidationResult.valid) {
        errors.push(phoneValidationResult.message || "Invalid phone number.");
      }

      // Have I've been pawned check

      if (await haveIBeenPwnedCheck(password)) {
        errors.push("This password has been exposed in a data breach. Please choose a different one.");
      }

      
      if (errors.length > 0) {
        return { status: 400, data: { errors } };
      }

      // All data is valid now registration logic can proceed

      // Password hasing and salting
      const hashedPassword = await hashPassword(password);

      //Create first token for email verification
      const verificationToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = Date.now() + 15*60*1000; // 15 minutes from now

      const registrationResult = await userDAO.registerUser({
        full_name,
        username,
        email,
        phone_number,
        password: hashedPassword,
        verificationToken,
        expiresAt
      });
      await send_verification_email(email, verificationToken);

      if (!registrationResult) {
        return { status: 500, data: { errors: ["Failed to register user. Please try again later."] } };
      }
      const user = await userDAO.findUserByEmail(email);
      if(!user){
        return { status: 500, data: { errors: ["Failed to register user. Please try again later."] } };
      }
      await allLogsDAO.logRegistrationEvent(
        logInfo.user_agent,
        user.id,
        "user",
        logInfo.ip_address,
        "register",
        "success",
        "registration"
      );

      return { status: 200, data: { message: "Registration successful" } };
  }catch(error){
    return { status: 500, data: { errors: ["Internal server error during validation"] } };
  }
}

  async loginUser(credentials: any, trusted_device_token: string | null, logInfo: {user_agent:string, ip_address: string}) {
    try{
      if (!config.jwt_captcha_secret) {
        throw new Error("JWT captcha secret is not defined in the configuration");
      }

      if (!credentials || typeof credentials !== 'object') {
        return { 
          status: 400, 
          data: { status: "error", message: "Invalid input data" } 
        };
      }

      if (!credentials.hasOwnProperty("identity") || !credentials.hasOwnProperty("password")) {
        return { 
          status: 400,
          data: { status: "error", message: "Missing identity or password" } 
        };
      }
      const { identity, password } = credentials;

      // 1. Basic validation (Bad Request)
      if (!identity || !password) {
        return { 
          status: 400, 
          data: { status: "error", message: "Missing identity or password" } 
        };
      }

      // 2. Search for the user
      const user = await userDAO.findUserByEmailorUsername(identity);
      if (!user) {
        return { 
          status: 404, // 404 is the standard code for "Not Found"
          data: { status: "error", message: "User doesn't exist" } 
        };
      }

      // Check if user tried to login in more than 3 times in last 10 minutes - Force captcha
      const loginAttempts = await loginEventDAO.getLoginAttempts10Minutes(user.id);
      if(loginAttempts >= 3){
        // If credentials dont have jwt_data, with captcha info, send another request to verify captcha
        if(!("jwt_token" in credentials)){
          const jwt_payload = { email: user.email, type: "captcha", "access": "login", success: false};
          const jwt_token = jwt.sign(jwt_payload, config.jwt_captcha_secret, { expiresIn: '10m' });
          return {
            status: 403, // 403 is the standard code for "Forbidden"
            data: { status: "captcha_required", message: "Please complete captcha to continue", jwt_captcha: jwt_token }
          }
        }
        else{
          // If credentials have jwt_data, check if captcha is valid
          try{
            let decoded;
            decoded = jwt.verify(credentials.jwt_token, config.jwt_captcha_secret) as { email: string, type: string, access: string, success: boolean };
            if(decoded.type !== "captcha"){
              return {
                status: 403, // 403 is the standard code for "Forbidden"
                data: { status: "error", message: "Invalid captcha token" }
              }
            } 
            if(decoded.access !== "login"){
              return {
                status: 403, // 403 is the standard code for "Forbidden"
                data: { status: "error", message: "Invalid access type" }
              }
            }
            // Check if credentials email matches user email
            if(decoded.email !== user.email){
              return {
                status: 403, // 403 is the standard code for "Forbidden"
                data: { status: "error", message: "Captcha email doesn't match user email" }
              }
            }

            if(!decoded.success){
              await loginEventDAO.logEvent(user.id, "failed", "Captcha failed");
              const jwt_payload = { email: user.email, type: "captcha", "access": "login", success: false};
              const jwt_token = jwt.sign(jwt_payload, config.jwt_captcha_secret, { expiresIn: '10m' });
              return {
                status: 403, // 403 is the standard code for "Forbidden"
                data: { status: "captcha_required", message: "Please complete captcha to continue", jwt_captcha: jwt_token }
              }
            }
          }catch(error){
            return {
              status: 403, // 403 is the standard code for "Forbidden"
              data: { status: "error", message: "Invalid captcha token" }
            }
          }
        }
       
      }


      // 4. Check password
      const passwordMatch = await comparePasswords(password, user.password);
      if (!passwordMatch) {
        // Log failed login attempt
        await loginEventDAO.logEvent(user.id, "failed", "Incorrect password");
        return { 
          status: 401, // 401 is the standard code for "Unauthorized"
          data: { status: "error", message: "Incorrect password" } 
        };
      }

      // Check if user is blocked for some reason
      if(user.is_blocked){
        await loginEventDAO.logEvent(user.id, "failed", "User is blocked");
        return {
          status: 403, // 403 is the standard code for "Forbidden"
          data: { status: "error", message: "Your account is blocked. Please contact support." }
        };
      }

      // Check if email is verified
      if(!user.email_verified){
        await loginEventDAO.logEvent(user.id, "failed", "Email not verified");
        // Check if link is expired so I can resend verification email
        if(user.expires_at < Date.now()){
          const newToken = crypto.randomBytes(32).toString("hex");
          const newExpiresAt = Date.now() + 15*60*1000; // 15 minutes from now
          await userDAO.updateEmailVerificationToken(user.email, newToken, newExpiresAt);
          await send_verification_email(user.email, newToken);
        }
        await allLogsDAO.logFailedLoginAttempt(
          logInfo.user_agent,
          user.id,
          "user",
          logInfo.ip_address,
          "email_verification_required",
          "failed",
          "login"
        );
        return {
          status: 403, // 403 is the standard code for "Forbidden"
          data: { status: "error", message: "Email not verified. Please check your inbox." }
        };
      }
      // Check if user has a trusted device token and if it's valid skip 2FA
      if(trusted_device_token){
        const trustedDevice = await trustedDeviceDAO.getTrustedDevice(user.email);
        if((trustedDevice && trustedDevice.device_token === trusted_device_token) && (trustedDevice.expires_at > Date.now()) && (trustedDevice.user_agent === logInfo.user_agent)){

          // Create access and refresh tokens

          const accessToken = await signAccessToken(user);
          const { token: refresh, jti, expiresAt } = await signRefreshToken(user.id);
          await refreshTokensDAO.insertRefreshToken(jti, user.id, expiresAt, logInfo.user_agent, logInfo.ip_address);
          // Log login event
          await allLogsDAO.logLoginEvent(
            logInfo.user_agent,
            user.id,
            "user",
            logInfo.ip_address,
            "loginTrustedDevice",
            "success",
            "login"
          );
          return {
            status: 200,
            data: { status: "success", message: "Successfully logged in", access_token: accessToken},
            refresh_token: refresh,
            refresh_expires_at: expiresAt
          };
        }
      }

      
      // If user doesn't have any 2FA method enabled, force them to set up 2FA
      if (!user.sms_enabled && !user.email_enabled && !user.totp_enabled) {
        await loginEventDAO.logEvent(user.id, "failed", "2FA setup required");

        await allLogsDAO.logFailedLoginAttempt(
          logInfo.user_agent,
          user.id,
          "user",
          logInfo.ip_address,
          "2fa_setup",
          "failed",
          "login"
        );

        // Send email with 2FA setup for user to choose between SMS, Email or TOTP
        const setupToken = crypto.randomBytes(32).toString("hex");
        const setupExpiresAt = Date.now() + 10*60*1000; // 10 minutes from now
        await userDAO.update2FASetupToken(user.email, setupToken, setupExpiresAt);

        await send_2fa_code_email(user.email, setupToken);

        return {
          status: 403, // 403 is the standard code for "Forbidden"
          data: { status: "error", message: "2FA setup required. Please check your email." }
        };
      }
      if (!config.jwt_2fa_secret) {
        throw new Error("JWT 2FA secret is not defined in the configuration");
      }

      if(user.totp_enabled){
        const jwt_payload = { userId: user.id, method: "totp", access: "2fa", code:"empty"};
        return {
          status : 200,
          data : {
            status: "2fa_required",
            user: user.username,
            method: "totp",
            jwt_2fa: jwt.sign(jwt_payload, config.jwt_2fa_secret, { expiresIn: '5m' })
          }
        }
      }
      if(user.sms_enabled){
        const smscode = Math.floor(100000 + Math.random() * 900000).toString(); // Generate a random 6-digit code
        const jwt_payload = { userId: user.id, method: "sms", access: "2fa", code: smscode};
        await sendSMS(user.phone_number, smscode);
        return {
          status : 200,
          data : {
            status: "2fa_required",
            user: user.username,
            method: "sms",
            jwt_2fa: jwt.sign(jwt_payload, config.jwt_2fa_secret, { expiresIn: '5m' })
          }
        }
      }
      
    // Default to email 2FA if available
    const emailcode = Math.floor(100000 + Math.random() * 900000).toString(); // Generate a random 6-digit code
    const jwt_payload = { userId: user.id, method: "email", access: "2fa", code: emailcode};
    await send_verification_email(user.email, emailcode);
    return {
      status : 200,
      data : {
        status: "2fa_required",
        user: user.username,
        method: "email",
        jwt_2fa: jwt.sign(jwt_payload, config.jwt_2fa_secret, { expiresIn: '5m' })
      }
    }
      

    }catch(error){
      return { 
        status: 500, 
        data: { status: "error", message: "Internal server error during login" } 
      };
    }
  }

  async loginWithOauth(email: string, fname: string, lname: string){ {
    try{
      if (!config.jwt_single_sign_on_secret){
        throw new Error("JWT Google secret is not defined in the configuration");
      }

      // Check if user is already registered
      let user = await userDAO.findUserByEmail(email);
      if(!user){
        // If not registered, create a new user with ask user for username, password and phone number info, and enforce user to enable 1 2FA option verify with jwt token
        const jwt_payload = { email: email, name: `${fname} ${lname}`, type: "third_party_login"};
        return {
          status : 200,
          data : {
            email: email,
            method: "login",
            jwt: jwt.sign(jwt_payload, config.jwt_single_sign_on_secret, { expiresIn: '10m' })
          }
        }
      }
      // Check if user is blocked for some reason
      if(user.is_blocked){
        return {
          status: 403, // 403 is the standard code for "Forbidden"
          data: { status: "error", message: "Your account is blocked. Please contact support." }
        };
      }

      // Check if user doesn't have any 2FA method enabled, force them to set up 2FA
      if (!user.sms_enabled && !user.email_enabled && !user.totp_enabled) {
        // Send email with 2FA setup for user to choose between SMS, Email or TOTP
        const setupToken = crypto.randomBytes(32).toString("hex");
        const setupExpiresAt = Date.now() + 10*60*1000; // 10 minutes from now
        await userDAO.update2FASetupToken(user.email, setupToken, setupExpiresAt);
        await send_2fa_code_email(user.email, setupToken);
        return {
          status: 403, // 403 is the standard code for "Forbidden"
          data: { status: "error", message: "2FA setup required. Please check your email." }
        };
      }

      if (!config.jwt_2fa_secret) {
        throw new Error("JWT 2FA secret is not defined in the configuration");
      }

      // If user has 2FA enabled, proceed with normal 2FA flow
      const jwt_payload = { userId: user.id, method: "google", access: "2fa", code:"empty"};
      return {
        status : 200,
        data : {
          status: "2fa_required",
          user: user.username,
          method: "google",
          jwt_2fa: jwt.sign(jwt_payload, config.jwt_2fa_secret, { expiresIn: '5m' })
        }
      }
      
      

    }catch(error){
      return {
        status: 500,
        data: { status: "error", message: "Internal server error during Google login" }
      };
    }
  }
  }

  async registerOauthUser(username: string, password: string, phone_number: string, jwtData: any, logInfo: {user_agent:string, ip_address: string}){
    try{
      if (!config.jwt_single_sign_on_secret) {
        throw new Error("JWT Google secret is not defined in the configuration");
      }
      // Resign JWT data
      const decoded = jwtData;
      
      //Additional check to ensure the token is for Google login
      if (decoded.type !== "third_party_login") {
        return { status: 400, data: { status: "error", message: "Invalid JWT token type" } };
      }

      const email = decoded.email;
      const name = decoded.name;

      // Check if username, password and phone number are valid
      const errors: string[] = [];
      const usernameValidationResult = await validateUsername(username);
      if (!usernameValidationResult.valid) {
        errors.push(usernameValidationResult.message || "Invalid username.");
      }
      const passwordValidationResult = await validatePassword(password);
      if (!passwordValidationResult.valid) {
        errors.push(passwordValidationResult.message || "Invalid password.");
      }
      if (await haveIBeenPwnedCheck(password)) {
        errors.push("This password has been exposed in a data breach. Please choose a different one.");
      }

      const phoneValidationResult = await validatePhoneNumber(phone_number);
      if (!phoneValidationResult.valid) {
        errors.push(phoneValidationResult.message || "Invalid phone number.");
      }

      if (errors.length > 0) {
        return { status: 400, data: { status: "error", message: errors.join(" ") } };
      }

      // Hash password
      const hashedPassword = await hashPassword(password);
      // Create user
      const registrationResult = await userDAO.registerUser({
        full_name: name,
        username,
        email,
        phone_number,
        password: hashedPassword,
        email_verified: true // Since email is verified by Google, we can mark it as verified
      });
      if (!registrationResult) {
        return { status: 500, data: { status: "error", message: "Failed to register user. Please try again later." } };
      }
      // Retrieve user id
      const user = await userDAO.findUserByEmail(email);
      if (!user) {
        throw new Error("Failed to retrieve user id after registration");
      }
      

      // Log registration event
      await allLogsDAO.logRegistrationEvent(
        logInfo.user_agent,
        user.id,
        "user",
        logInfo.ip_address,
        "register_oauth",
        "success",
        "registration"
      );
      return { status: 200, data: { status: "success", message: "User registered successfully, please login now." } };
    }catch(error){
      return { status: 500, data: { status: "error", message: "Internal server error during Google user registration" } };
    }
  }

  async passwordReset(data : any, logInfo: {user_agent:string, ip_address: string}){
    try{
      if (!config.jwt_captcha_secret) {
        throw new Error("JWT captcha secret is not defined in the configuration");
      }
      if (!data.hasOwnProperty("email")){
        return { status: 400, data: { status: "error", message: "Invalid email" } };
      }
      if (!data.email){
        return { status: 400, data: { status: "error", message: "Invalid email" } };
      }
      const user = await userDAO.findUserByEmail(data.email);
      if (!user){
        return { status: 404, data: { status: "error", message: "User not found" } };
      }
      // Rule if user made 2 or more password reset in the last 60 minutes force captcha
      const resetCount = await allLogsDAO.getPasswordResetsCount60Minutes(user.id);
      if(resetCount >= 2){
        if(!("jwt_captcha_token" in data)){
          const jwt_payload = { email: user.email, type: "captcha", "access": "password_reset", success: false};
          const jwt_token = jwt.sign(jwt_payload, config.jwt_captcha_secret, { expiresIn: '10m' });
          return {
            status: 403, // 403 is the standard code for "Forbidden"
            data: { status: "captcha_required", message: "Please complete captcha to continue", jwt_captcha: jwt_token }
          }
        }
        else{
          let decoded;
          try{
            decoded = jwt.verify(data.jwt_captcha_token, config.jwt_captcha_secret) as { email: string, type: string, access: string, success: boolean };
            if(decoded.type !== "captcha"){
              return {
                status: 403, // 403 is the standard code for "Forbidden"
                data: { status: "error", message: "Invalid captcha token" }
              }
            } 
            if(decoded.access !== "password_reset"){
              return {
                status: 403, // 403 is the standard code for "Forbidden"
                data: { status: "error", message: "Invalid access type" }
              }
            }
            // Check if credentials email matches user email
            if(decoded.email !== user.email){
              return {
                status: 403, // 403 is the standard code for "Forbidden"
                data: { status: "error", message: "Captcha email doesn't match user email" }
              }
            }
            if(!decoded.success){
              await allLogsDAO.logPasswordReset("start_reset",
                logInfo.user_agent,
                user.id,
                user.role,
                logInfo.ip_address,
                null,
                null,
                "failed"
              )
              const jwt_payload = { email: user.email, type: "captcha", "access": "password_reset", success: false};
              const jwt_token = jwt.sign(jwt_payload, config.jwt_captcha_secret, { expiresIn: '10m' });
              return {
                status: 403, // 403 is the standard code for "Forbidden"
                data: { status: "captcha_required", message: "Please complete captcha to continue", jwt_captcha: jwt_token }
              }
            }

          }catch(error){
            return {
              status: 403, // 403 is the standard code for "Forbidden"
              data: { status: "error", message: "Invalid captcha token" }
            }
          }
        }
      }
      

      await allLogsDAO.logPasswordReset("start_reset",
        logInfo.user_agent,
        user.id,
        user.role,
        logInfo.ip_address,
        null,
        null,
        "success"
      )
      const resetToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = Date.now() + 5*60*1000; // 5 minutes from now
      await userDAO.updatePasswordResetToken(user.id, resetToken, expiresAt);
      await send_password_reset_email(data.email, resetToken);
      return { status: 200, data: { status: "success", message: "Password reset email sent" } };
      
    }catch(error){
      return { status: 500, data: { status: "error", message: "Internal server error during password reset" } };
    }
  }

  async passwordResetVerify(token: string, newPassword: string, email: string, logInfo: {user_agent:string, ip_address: string}){
    try{
      if (!token){
        return { status: 400, data: { status: "error", message: "Invalid token" } };
      }
      if (!email){
        return { status: 400, data: { status: "error", message: "Invalid email" } };
      }
      const user = await userDAO.findUserByPasswordResetToken(token);
      if (!user){
        return { status: 404, data: { status: "error", message: "Invalid token" } };
      }
      if (user.password_reset_expires_at < Date.now()){
        await allLogsDAO.logPasswordReset("reset",
          logInfo.user_agent,
          user.id,
          user.role,
          logInfo.ip_address,
          user.password,
          null,
          "failed(Expired token)"
        )
        return { status: 400, data: { status: "error", message: "Token expired. Start password reset process again." } };
      }
      if (user.email !== email){
        await allLogsDAO.logPasswordReset("reset",
          logInfo.user_agent,
          user.id,
          user.role,
          logInfo.ip_address,
          user.password,
          null,
          "failed(Email mismatch)"
        )
        return { status: 400, data: { status: "error", message: "Token email doesn't match user email" } };
      }
      // Check if password fulfills requirements
      const passwordValidationResult = await validatePassword(newPassword);
      if (!passwordValidationResult.valid) {
        await allLogsDAO.logPasswordReset("reset",
          logInfo.user_agent,
          user.id,
          user.role,
          logInfo.ip_address,
          user.password,
          null,
          "failed(Password validation failed)"
        )
        return { status: 400, data: { status: "error", message: passwordValidationResult.message || "Bad Password." } };
      }

      // haveIBeenPwnedCheck
      if (await haveIBeenPwnedCheck(newPassword)) {
        await allLogsDAO.logPasswordReset("reset",
          logInfo.user_agent,
          user.id,
          user.role,
          logInfo.ip_address,
          user.password,
          null,
          "failed(Password has been pwned)"
        )
        return { status: 400, data: { status: "error", message: "This password has been pwned. Please choose a different one." } };
      }

      const hashedPassword = await hashPassword(newPassword);
      await userDAO.updatePassword(user.email, hashedPassword);
      await userDAO.deletePasswordResetToken(user.id);
      await allLogsDAO.logPasswordReset("reset",
        logInfo.user_agent,
        user.id,
        user.role,
        logInfo.ip_address,
        user.password,
        hashedPassword,
        "success"
      )
      return { status: 200, data: { status: "success", message: "Password reset successful" } };
    }catch(error){
      return { status: 500, data: { status: "error", message: "Internal server error during password reset" } };
    }

      
  }
}



export const authService = new AuthService();
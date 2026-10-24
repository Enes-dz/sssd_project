import { reservedUserDAO } from "../dao/reserved_users";
import { userDAO } from "../dao/users";
import { parsePhoneNumberFromString, ParseError } from "libphonenumber-js/max";

async function validateNumber(phone_number: string): Promise<boolean> {
    try {
        const phoneNumber = parsePhoneNumberFromString(phone_number, 'BA');
        if(phoneNumber && phoneNumber.getType() === 'MOBILE'){
            return true;
        }
        return false; // Not a valid mobile phone number
    } catch (error) {
        if (error instanceof ParseError) {
            return false; // Invalid phone number format
        }
        throw error; // Re-throw unexpected errors
    }
}

export async function validateUsername(username: string): Promise<{ valid: boolean; message?: string }> {
    const alphanumericRegex = /^[a-zA-Z0-9]+$/;
    const errors: string[] = [];
    if (!username || username.length <= 3) {
        errors.push("Username must be longer than 3 characters.");
        } else if (!alphanumericRegex.test(username)) {
        errors.push("Username must be alphanumeric (no spaces or special characters).");
        } else if (await reservedUserDAO.isReserved(username.toLowerCase())) {
        errors.push("This username is reserved and cannot be used.");
        }

    const existingUserByUsername = await userDAO.findUserByUsername(username);
    if (existingUserByUsername) {
        errors.push("Username is already taken.");
    }

    if (errors.length > 0) {
        return { valid: false, message: errors.join(" ") };
    }
    return { valid: true };
}

export async function validatePassword(password: string): Promise<{ valid: boolean; message?: string }> {
    const errors: string[] = [];
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      if (!password || !passwordRegex.test(password)) {
        errors.push("Password must be 8+ chars with 1 uppercase, 1 lowercase, 1 number, and 1 special char.");
      }

    if (errors.length > 0) {
        return { valid: false, message: errors.join(" ") };
    }
    return { valid: true };
}

export async function validatePhoneNumber(phone_number: string): Promise<{ valid: boolean; message?: string }> {
    const errors: string[] = [];

    if (!await validateNumber(phone_number)) {
        errors.push("Invalid phone number format or not a mobile number.");
    }
    
    // Check if phone number is already registered
    const existingUserByPhone = await userDAO.findUserByPhoneNumber(phone_number);
    if (existingUserByPhone) {
    errors.push("Phone number is already registered.");
    }
    if (errors.length > 0) {
        return { valid: false, message: errors.join(" ") };
    }
    return { valid: true };
}
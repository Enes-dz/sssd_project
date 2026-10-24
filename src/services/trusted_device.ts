import { trustedDeviceDAO } from "../dao/trusted_device";
import { allLogsDAO } from "../dao/all_logs";
import { userDAO } from "../dao/users";
import crypto from "crypto";

export class TrustedDeviceService {
    async writeTrustedDevice(user_email: string, user_agent: string, ip_address: string) {
        try{
            if (!user_email  || !user_agent) {
                return { status: 400, data: { status: "error", message: "Missing required fields" } };
            }
            const user = await userDAO.findUserByEmail(user_email);
            if(!user){
                return { status: 404, data: { status: "error", message: "User not found" } };
            }
            // Check if user has a trusted device already
            const existingTrustedDevice = await trustedDeviceDAO.getTrustedDevice(user_email);
            if (existingTrustedDevice) {
                // If user has a trusted device, update it delete it and write a new one
                await trustedDeviceDAO.deleteTrustedDevice(user_email);
                await allLogsDAO.logDeleteTrustedDevice(
                    user_agent,
                    user.id,
                    "user",
                    ip_address,
                    "trusted_device",
                    JSON.stringify(existingTrustedDevice)
                )
            }

            // Write new trusted device
            const device_token = crypto.randomBytes(32).toString("hex"); // Generate a random device token
            const expires_at = Date.now() + 10 * 24 * 60 * 60 * 1000; // Set expiration to 10 days from now
            await trustedDeviceDAO.writeTrustedDevice(user_email, device_token, user_agent, ip_address, expires_at);
            const trustedDevice = await trustedDeviceDAO.getTrustedDevice(user_email);
            if(!trustedDevice){
                return { status: 500, data: { status: "error", message: "Internal server error during trusted device write" } };
            }
            await allLogsDAO.logAddTrustedDevice(
                user_agent,
                user.id,
                "user",
                ip_address,
                "trusted_device",
                JSON.stringify(trustedDevice)
            );
            return { status: 200, data: { status: "success", message: "Trusted device written successfully" }, device_token: device_token, expires_at: expires_at };
        }catch(error){
            console.error("Error writing trusted device:", error);
            return { status: 500, data: { status: "error", message: "Internal server error during trusted device write" } };
        }
    }
}
export const trustedDeviceService = new TrustedDeviceService();
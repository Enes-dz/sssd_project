import db from "./db";
import { ResultSetHeader, RowDataPacket } from "mysql2";

class TrustedDeviceDAO {
    async writeTrustedDevice(user_email: string, device_token: string, user_agent: string, ip_address: string, expires_at: number) {
        try{
            const query = 'INSERT INTO trusted_device (user_email, device_token, user_agent, ip_address, expires_at) VALUES (?, ?, ?, ?, ?)';
            await db.execute(query, [user_email, device_token, user_agent, ip_address, expires_at]);
        }catch(error){
            console.error("Failed to write trusted device:", error);
            throw new Error("Database error during trusted device write");
        }
    }
    async getTrustedDevice(email: string) {
        try{
            const query = 'SELECT * FROM trusted_device WHERE user_email = ?';
            const [rows] = await db.execute<RowDataPacket[]>(query, [email]);
            if (rows.length > 0) {
                return rows[0];
            } else {
                return null;
            }
        }catch(error){
            console.error("Failed to get trusted device:", error);
            throw new Error("Database error during trusted device retrieval");
        }
    }
    async deleteTrustedDevice(email: string) {
        try{
            const query = 'DELETE FROM trusted_device WHERE user_email = ?';
            await db.execute(query, [email]);
        }catch(error){
            console.error("Failed to delete trusted device:", error);
            throw new Error("Database error during trusted device deletion");
        }
    }
}
    
export const trustedDeviceDAO = new TrustedDeviceDAO();

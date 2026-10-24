import pool from './db';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

class LoginEventDAO {
    async logEvent(user_id: number,status: string, reason: string | null) {
        try{
            const query = 'INSERT INTO login_events (user_id, status, failure_reason) VALUES (?, ?, ?)';
            await pool.execute(query, [user_id, status, reason]);
        }
        catch(error){
            console.error("Failed to log login event:", error);
            throw new Error("Database error during login event logging");
        }
    }

    async isFirstLoginTry(user_id: number): Promise<boolean> {
        try{
            const query = 'SELECT COUNT(*) as count FROM login_events WHERE user_id = ? AND status = "success"';
            const [rows] = await pool.execute<RowDataPacket[]>(query, [user_id]);
            return rows[0].count === 0; // True if this is the first successful login
        }catch(error){
            console.error("Failed to check first successful login:", error);
            throw new Error("Database error during first login check");
        }
    }

    async getLoginAttempts10Minutes(user_id: number): Promise<number> {
        try{
            const query = 'SELECT COUNT(*) as count FROM login_events WHERE user_id = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)';
            const [rows] = await pool.execute<RowDataPacket[]>(query, [user_id]);
            return rows[0].count;
        }catch(error){
            console.error("Failed to get login attempts in last 10 minutes:", error);
            throw new Error("Database error during login attempts in last 10 minutes check");
        }
    }
}

export const loginEventDAO = new LoginEventDAO();
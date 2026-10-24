import pool from './db';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

class AllLogsDAO {
    async logPasswordReset(action: string, user_agent:string, user_id: number, user_role: string, ip_address: string, old_password: string | null, new_password: string | null, status: string) {
        try{
            if(action === "start_reset"){
                const query = 'INSERT INTO all_logs (user_agent, user_id, user_role, ip_address, time, object_id, action, status, event_type) VALUES (?, ?, ?, ?, NOW(), ?, ?, "success", "password_reset")';
                await pool.execute(query, [user_agent, user_id, user_role, ip_address, user_id, action]);
            }
            else if(action === "reset"){
                const query = 'INSERT INTO all_logs (user_agent, user_id, user_role, ip_address, time, object_id, action, status, event_type, object_changed, original_object, new_object) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, "password_reset", "password", ?, ?)';
                await pool.execute(query, [user_agent, user_id, user_role, ip_address, user_id, action, status, old_password, new_password]);
            }
        } catch (error) {
            console.error('Error logging password reset:', error);
        }
    }

    async getPasswordResetsCount60Minutes(user_id: number): Promise<number> {
        try{
            const query = 'SELECT COUNT(*) as count FROM all_logs WHERE user_id = ? AND event_type = "password_reset" AND action = "start_reset" AND time > DATE_SUB(NOW(), INTERVAL 60 MINUTE)';
            const [rows] = await pool.execute<RowDataPacket[]>(query, [user_id]);
            return rows[0].count;
        }catch(error){
            console.error("Failed to get password resets in last 60 minutes:", error);
            throw new Error("Database error during password resets in last 60 minutes check");
        }
    }
    async logDeleteTrustedDevice(user_agent: string, user_id: number, user_role: string, ip_address: string, object_changed: string, original_object : string) {
        try{
            const query = 'INSERT INTO all_logs (user_agent, user_id, user_role, ip_address, time, action, status, event_type, object_changed, original_object) VALUES (?, ?, ?, ?, NOW(), "delete", "success", "delete_trusted_device", ?, ?)';
            await pool.execute(query, [user_agent, user_id, user_role, ip_address, object_changed, original_object]);
        }catch(error){
            console.error("Failed to log delete trusted device:", error);
            throw new Error("Database error during delete trusted device logging");
        }
    }

    async logAddTrustedDevice(user_agent: string, user_id: number, user_role: string, ip_address: string, object_changed: string, new_object : string) {
        try{
            const query = 'INSERT INTO all_logs (user_agent, user_id, user_role, ip_address, time, action, status, event_type, object_changed, new_object) VALUES (?, ?, ?, ?, NOW(), "add", "success", "add_trusted_device", ?, ?)';
            await pool.execute(query, [user_agent, user_id, user_role, ip_address, object_changed, new_object]);
        }catch(error){
            console.error("Failed to log add trusted device:", error);
            throw new Error("Database error during add trusted device logging");
        }
    }
    async logLogout(user_agent: string, user_id: number, user_role: string, ip_address: string, object_changed: string, original_object : string, new_object: string, action: string, status: string, event_type: string) {
        try{
            const query = 'INSERT INTO all_logs (user_agent, user_id, user_role, ip_address, time, action, status, event_type, object_changed, original_object, new_object) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)';
            await pool.execute(query, [user_agent, user_id, user_role, ip_address, action, status, event_type, object_changed, original_object, new_object]);
        }catch(error){
            console.error("Failed to log logout:", error);
            throw new Error("Database error during logout logging");
        }
    }
    async logFailedRefreshToken(user_agent: string, user_id: number, user_role: string, ip_address: string, action: string, status: string, event_type: string) {
        try{
            const query = 'INSERT INTO all_logs (user_agent, user_id, user_role, ip_address, time, action, status, event_type) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?)';
            await pool.execute(query, [user_agent, user_id, user_role, ip_address, action, status, event_type]);
        }catch(error){
            console.error("Failed to log failed refresh token:", error);
            throw new Error("Database error during failed refresh token logging");
        }
    }
    async logSuccessfulRefreshToken(user_agent: string, user_id: number, user_role: string, ip_address: string,  original_object: string, new_object: string, ) {
        try{
            const query = 'INSERT INTO all_logs (user_agent, user_id, user_role, ip_address, time, action, status, event_type, object_changed, original_object, new_object) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)';
            await pool.execute(query, [user_agent, user_id, user_role, ip_address, "revoke_old_make_new_refresh_token", "success", "create_access_token", "refresh_token_info", original_object, new_object]);
        }catch(error){
            console.error("Failed to log successful refresh token:", error);
            throw new Error("Database error during successful refresh token logging");
        }
    }
    async logemailVerification(user_agent: string, user_id: number, user_role: string, ip_address: string, action: string, status: string, event_type: string) {
        try{
            const query = 'INSERT INTO all_logs (user_agent, user_id, user_role, ip_address, time, action, status, event_type) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?)';
            await pool.execute(query, [user_agent, user_id, user_role, ip_address, action, status, event_type]);
        }catch(error){
            console.error("Failed to log email verification:", error);
            throw new Error("Database error during email verification logging");
        }
    }
    async log2FAEvent(user_agent: string, user_id: number, user_role: string, ip_address: string, action: string, status: string, event_type: string) {
        try{
            const query = 'INSERT INTO all_logs (user_agent, user_id, user_role, ip_address, time, action, status, event_type) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?)';
            await pool.execute(query, [user_agent, user_id, user_role, ip_address, action, status, event_type]);
        }catch(error){
            console.error("Failed to log 2FA event:", error);
            throw new Error("Database error during 2FA event logging");
        }
    }
    async logLoginEvent(user_agent: string, user_id: number, user_role: string, ip_address: string, action: string, status: string, event_type: string) {
        try{
            const query = 'INSERT INTO all_logs (user_agent, user_id, user_role, ip_address, time, action, status, event_type) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?)';
            await pool.execute(query, [user_agent, user_id, user_role, ip_address, action, status, event_type]);
        }catch(error){
            console.error("Failed to log login event:", error);
            throw new Error("Database error during login event logging");
        }
    }
    async logRegistrationEvent(user_agent: string, user_id: number | null, user_role: string, ip_address: string, action: string, status: string, event_type: string) {
        try{
            const query = 'INSERT INTO all_logs (user_agent, user_id, user_role, ip_address, time, action, status, event_type) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?)';
            await pool.execute(query, [user_agent, user_id, user_role, ip_address, action, status, event_type]);
        }catch(error){
            console.error("Failed to log registration event:", error);
            throw new Error("Database error during registration event logging");
        }
    }
    async logFailedLoginAttempt(user_agent: string, user_id: number | null, user_role: string, ip_address: string, action: string, status: string, event_type: string) {
        try{
            const query = 'INSERT INTO all_logs (user_agent, user_id, user_role, ip_address, time, action, status, event_type) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?)';
            await pool.execute(query, [user_agent, user_id, user_role, ip_address, action, status, event_type]);
        }catch(error){
            console.error("Failed to log failed login attempt:", error);
            throw new Error("Database error during failed login attempt logging");
        }
    }

    // Generic audit event used by dashboard / admin actions. Optional fields
    // (object_changed / original_object / new_object) default to null.
    async logEvent(params: {
        user_agent: string,
        user_id: number | null,
        user_role: string,
        ip_address: string,
        action: string,
        status: string,
        event_type: string,
        object_changed?: string | null,
        object_id?: number | null,
        original_object?: string | null,
        new_object?: string | null,
    }) {
        try{
            const query = 'INSERT INTO all_logs (user_agent, user_id, user_role, ip_address, time, object_changed, object_id, original_object, new_object, action, status, event_type) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)';
            await pool.execute(query, [
                params.user_agent,
                params.user_id,
                params.user_role,
                params.ip_address,
                params.object_changed ?? null,
                params.object_id ?? null,
                params.original_object ?? null,
                params.new_object ?? null,
                params.action,
                params.status,
                params.event_type,
            ]);
        }catch(error){
            console.error("Failed to log event:", error);
            // Logging must never break the calling action.
        }
    }

    // ─── Admin: audit log preview (filtering + pagination) ───────────────────
    // `time` is stored as a numeric YYYYMMDDHHMMSS bigint, so date filters are
    // translated to numeric bounds by the service layer.
    private buildLogFilter(filters: {
        user_id?: number,
        event_type?: string,
        action?: string,
        status?: string,
        user_role?: string,
        ip_address?: string,
        time_from?: number,
        time_to?: number,
    }): { where: string, params: any[] } {
        const clauses: string[] = [];
        const params: any[] = [];
        if (filters.user_id != null)      { clauses.push('user_id = ?');        params.push(filters.user_id); }
        if (filters.event_type)           { clauses.push('event_type = ?');     params.push(filters.event_type); }
        if (filters.action)               { clauses.push('action = ?');         params.push(filters.action); }
        if (filters.status)               { clauses.push('status LIKE ?');      params.push(`%${filters.status}%`); }
        if (filters.user_role)            { clauses.push('user_role = ?');      params.push(filters.user_role); }
        if (filters.ip_address)           { clauses.push('ip_address LIKE ?');  params.push(`%${filters.ip_address}%`); }
        if (filters.time_from != null)    { clauses.push('time >= ?');          params.push(filters.time_from); }
        if (filters.time_to != null)      { clauses.push('time <= ?');          params.push(filters.time_to); }
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        return { where, params };
    }

    async getLogs(filters: any, limit: number, offset: number): Promise<RowDataPacket[]> {
        try{
            const { where, params } = this.buildLogFilter(filters);
            const query = `SELECT id, user_agent, user_id, user_role, ip_address, time, object_changed,
                                  object_id, original_object, new_object, action, status, event_type
                           FROM all_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`;
            const [rows] = await pool.query<RowDataPacket[]>(query, [...params, limit, offset]);
            return rows;
        }catch(error){
            console.error("Failed to fetch logs:", error);
            throw new Error("Database error during log retrieval");
        }
    }

    async countLogs(filters: any): Promise<number> {
        try{
            const { where, params } = this.buildLogFilter(filters);
            const query = `SELECT COUNT(*) as count FROM all_logs ${where}`;
            const [rows] = await pool.query<RowDataPacket[]>(query, params);
            return rows[0].count;
        }catch(error){
            console.error("Failed to count logs:", error);
            throw new Error("Database error during log count");
        }
    }

    // Distinct values to populate audit-log filter dropdowns.
    async getDistinct(column: "event_type" | "action" | "status" | "user_role"): Promise<string[]> {
        try{
            const allowed = ["event_type", "action", "status", "user_role"];
            if (!allowed.includes(column)) return [];
            const query = `SELECT DISTINCT ${column} as v FROM all_logs WHERE ${column} IS NOT NULL ORDER BY ${column} ASC`;
            const [rows] = await pool.query<RowDataPacket[]>(query);
            return rows.map(r => r.v);
        }catch(error){
            console.error("Failed to fetch distinct values:", error);
            return [];
        }
    }
}

export const allLogsDAO = new AllLogsDAO();
import pool from './db';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

class RefreshTokensDAO {
    async insertRefreshToken(jti: string, user_id: number, expires_at: Date, user_agent: string | null, ip: string | null) {
        try{
            const query = 'INSERT INTO refresh_tokens (jti, user_id, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?)';
            await pool.execute(query, [jti, user_id, expires_at, user_agent, ip]);
        }catch(error){
            console.error("Failed to insert refresh token:", error);
            throw new Error("Database error during refresh token insert");
        }
    }
    async getRefreshInfo(jti: string) {
        try{
            const query = 'SELECT user_id, revoked_at, expires_at FROM refresh_tokens WHERE jti = ? LIMIT 1'
            const [rows] = await pool.execute<RowDataPacket[]>(query, [jti]);
            if (rows.length > 0) {
                return rows[0];
            } else {
                return null;
            }
        }catch(error){
            console.error("Failed to get refresh token info:", error);
            throw new Error("Database error during refresh token info retrieval");
        }
    }
    async updateRevokedRefreshToken(oldJti: string, newJti: string) {
        try{
            const query = 'UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = ? WHERE jti = ? AND revoked_at IS NULL';
            await pool.execute(query, [newJti, oldJti]);
        }catch(error){
            console.error("Failed to update refresh token:", error);
            throw new Error("Database error during refresh token update");
        }
    }
    async revokeRefreshToken(jti: string) {
        try{
            const query = 'UPDATE refresh_tokens SET revoked_at = NOW() WHERE jti = ? AND revoked_at IS NULL';
            await pool.execute(query, [jti]);
        }catch(error){
            console.error("Failed to revoke refresh token:", error);
            throw new Error("Database error during refresh token revocation");
        }
    }
    // Revoke every active session for a user (e.g. after a password change).
    async revokeAllForUser(userId: number) {
        try{
            const query = 'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL';
            await pool.execute(query, [userId]);
        }catch(error){
            console.error("Failed to revoke user refresh tokens:", error);
            throw new Error("Database error during user refresh token revocation");
        }
    }
}


export const refreshTokensDAO = new RefreshTokensDAO();
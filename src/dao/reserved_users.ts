import { ResultSetHeader, RowDataPacket } from "mysql2";
import  pool  from "./db";

export class ReservedUserDAO {
    async isReserved(username: string): Promise<boolean> {
        const query = 'SELECT * FROM reserved_usernames WHERE username = ?';
        const [rows] = await pool.execute<RowDataPacket[]>(query, [username]);
        return rows.length > 0; // Return true if user is reserved, false otherwise
    }

    // ─── Admin CRUD ──────────────────────────────────────────────────────────

    async getAll(search: string, limit: number, offset: number): Promise<RowDataPacket[]> {
        const like = `%${search}%`;
        const query = search
            ? 'SELECT username FROM reserved_usernames WHERE username LIKE ? ORDER BY username ASC LIMIT ? OFFSET ?'
            : 'SELECT username FROM reserved_usernames ORDER BY username ASC LIMIT ? OFFSET ?';
        const params = search ? [like, limit, offset] : [limit, offset];
        const [rows] = await pool.query<RowDataPacket[]>(query, params);
        return rows;
    }

    async count(search: string): Promise<number> {
        const like = `%${search}%`;
        const query = search
            ? 'SELECT COUNT(*) as count FROM reserved_usernames WHERE username LIKE ?'
            : 'SELECT COUNT(*) as count FROM reserved_usernames';
        const params = search ? [like] : [];
        const [rows] = await pool.query<RowDataPacket[]>(query, params);
        return rows[0].count;
    }

    async add(username: string) {
        const query = 'INSERT INTO reserved_usernames (username) VALUES (?)';
        await pool.execute(query, [username]);
    }

    async rename(oldUsername: string, newUsername: string) {
        const query = 'UPDATE reserved_usernames SET username = ? WHERE username = ?';
        const [result] = await pool.execute<ResultSetHeader>(query, [newUsername, oldUsername]);
        return result;
    }

    async remove(username: string) {
        const query = 'DELETE FROM reserved_usernames WHERE username = ?';
        const [result] = await pool.execute<ResultSetHeader>(query, [username]);
        return result;
    }
}

export const reservedUserDAO = new ReservedUserDAO();

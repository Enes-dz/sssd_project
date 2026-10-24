import pool from './db';
import { ResultSetHeader, RowDataPacket } from 'mysql2'; 

class UserDAO {
  async createUser(user: any) {
    const { username, email, password } = user;
    const query = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
    const [result] = await pool.execute(query, [username, email, password]);
    return result;
  }

  async findUserByPhoneNumber(phone_number: string) {
    const query = 'SELECT * FROM users WHERE phone_number = ?';
    const [rows] = await pool.execute<RowDataPacket[]>(query, [phone_number]);
    if (rows.length > 0) {
      return rows[0];
    } else {
      return null;
    }
  }

  async findUserById(id: number) {
    try{
    const query = 'SELECT * FROM users WHERE id = ?';
    const [rows] = await pool.execute<RowDataPacket[]>(query, [id]);
    if (rows.length > 0) {
        return rows[0]; // Return the first user found
    }else {
        return null; // No user found
    }
  }catch(error){
    throw new Error("Database error during user search by ID");
  }
  }


  async findUserByUsername(username: string) {
    const query = 'SELECT * FROM users WHERE username = ?';
    const [rows] = await pool.execute<RowDataPacket[]>(query, [username]);
    
    if (rows.length > 0) {
        return rows[0]; // Return the first user found
    }else {
        return null; // No user found
    }
  }
    async findUserByEmail(email: string) {
    const query = 'SELECT * FROM users WHERE email = ?';
    const [rows] = await pool.execute<RowDataPacket[]>(query, [email]);
    if (rows.length > 0) {
        return rows[0]; // Return the first user found
    }else {
        return null; // No user found
    }
  }

    async findUserByEmailorUsername(identity: string) {
    try{  
      const query = 'SELECT * FROM users WHERE email = ? OR username = ?';
      const [rows] = await pool.execute<RowDataPacket[]>(query, [identity, identity]);
      if (rows.length > 0) {
          return rows[0]; // Return the first user found
      }else {
          return null; // No user found
      }
    }catch(error){
      throw new Error("Database error during user search");
    }
  }

  async registerUser(user: any) {
    try {
      const { full_name, username, password, email, phone_number, verificationToken, expiresAt } = user;
      console.log("Verification Token:", verificationToken);
      const query = 'INSERT INTO users (name, username, email, phone_number, password, email_verification_token, email_verification_token_expires_at, role) VALUES (?, ?, ?, ?, ?, ?, ?, "user")';
      const [result] = await pool.execute<ResultSetHeader>(query, [full_name, username, email, phone_number, password, verificationToken, expiresAt]);
      return result;

    } catch (error) {
      console.error("Error during user registration:", error);
      return null; // Return null if there's an error during registration
    }
  }

  async verify_email_token(token:string){
    try {
      const query = 'SELECT * FROM users WHERE email_verification_token = ?';
      const [rows] = await pool.execute<RowDataPacket[]>(query, [token]);
      if (rows.length > 0) {
        return {
          id: rows[0].id,
          email: rows[0].email,
          token: rows[0].email_verification_token,
          expiresAt: rows[0].email_verification_token_expires_at
        }; // Return the first user found
      }else{
        return null; // No user found
      }
    }catch(error){
      throw new Error("Database error during token verification");
    }
   
  }

  async updateEmailVerificationToken(email: string, token: string, expiresAt: number) {
    try {
      const query = 'UPDATE users SET email_verification_token = ?, email_verification_token_expires_at = ? WHERE email = ?';
      await pool.execute(query, [token, expiresAt, email]);
    } catch (error) {
      throw new Error("Database error during email verification token update");
    }
  }

  async activateUser(token:string){
    try{
      const query = 'UPDATE users SET email_verified = 1, email_verification_token = NULL, email_verification_token_expires_at = NULL WHERE email_verification_token = ?';
      await pool.execute(query, [token]);
    }catch(error){
      throw new Error("Database error during user activation");
    }
  }

  async update2FASetupToken(email: string, token: string, expiresAt: number) {
    try {
      const query = 'UPDATE users SET 2fa_setup_token = ?, 2fa_setup_token_expires_at = ? WHERE email = ?';
      await pool.execute(query, [token, expiresAt, email]);
    } catch (error) {
      throw new Error("Database error during 2FA setup token update");
    }
  }

  async get2FASetupToken(token: string) {
    try {
      const query = 'SELECT * FROM users WHERE 2fa_setup_token = ?';
      const [rows] = await pool.execute<RowDataPacket[]>(query, [token]);
      if (rows.length > 0) {
        return rows[0];
      } else {
        return null;
      }
    } catch (error) {
      throw new Error("Database error during 2FA setup token retrieval");
    }
  }
  // _2fa_method should be one of "email", "sms"
  async updateUser2FAStatus(userId: number, _2fa_method: string) {
    try{
      const query = `UPDATE users SET ${_2fa_method}_enabled = 1, 2fa_setup_token = NULL, 2fa_setup_token_expires_at = NULL WHERE id = ?`;
      await pool.execute(query, [userId]);
    } catch (error) {
      throw new Error("Database error during 2FA status update");
    }
  }
  async updateUserTOTPSecret(userId: number, secret: string) {
    try{
      const query = 'UPDATE users SET totp_secret = ?, totp_enabled = 1, 2fa_setup_token = NULL, 2fa_setup_token_expires_at = NULL WHERE id = ?';
      await pool.execute(query, [secret, userId]);
    }catch(error){
      throw new Error("Database error during TOTP secret update");
    }
  }

  async recoveryCodeExists(userId: number): Promise<boolean> {
    try{
      const query = 'SELECT recovery_code FROM users WHERE id = ?';
      const [rows] = await pool.execute<RowDataPacket[]>(query, [userId]);
      return !!rows[0].recovery_code; // Return true if recovery code exists, false otherwise 
    }catch(error){
      throw new Error("Database error during recovery code check");
    }
  }

  async saveRecoveryCode(userId: number, hashedCode: string) {
    try{
      const query = 'UPDATE users SET recovery_code = ? WHERE id = ?';
      await pool.execute(query, [hashedCode, userId]);
    }catch(error){
      throw new Error("Database error during recovery code save");
    }
  }

  async deleteRecoveryCode(email: string) {
    try{
      const query = 'UPDATE users SET recovery_code = NULL WHERE email = ?';
      await pool.execute(query, [email]);
    }catch(error){
      throw new Error("Database error during recovery code deletion");
    }
  }

  async reset2FA(email: string) {
    try{
      const query = 'UPDATE users SET email_enabled = 0, sms_enabled = 0, totp_enabled = 0, recovery_code = NULL WHERE email = ?';
      await pool.execute(query, [email]);
    }catch(error){
      throw new Error("Database error during 2FA reset");
    }
  }

  async updatePasswordResetToken(userId: number, token: string, expiresAt: number) {
    try{
      const query = 'UPDATE users SET password_reset_token = ?, password_reset_token_expires_at = ? WHERE id = ?';
      await pool.execute(query, [token, expiresAt, userId]);
    }catch(error){
      throw new Error("Database error during password reset token update");
    }
  }

  async findUserByPasswordResetToken(token: string) {
    try{
      const query = 'SELECT email, password_reset_token_expires_at, password FROM users WHERE password_reset_token = ?';
      const [rows] = await pool.execute<RowDataPacket[]>(query, [token]);
      if (rows.length === 0){
        return null;
      }
      return rows[0];
    }catch(error){
      throw new Error("Database error during password reset token verification");
    }
  }

  async deletePasswordResetToken(UserEmail: string) {
    try{
      const query = 'UPDATE users SET password_reset_token = NULL, password_reset_token_expires_at = NULL WHERE email = ?';
      await pool.execute(query, [UserEmail]);
    }catch(error){
      throw new Error("Database error during password reset token deletion");
    }
  }

  async updatePassword(email: string, password: string) {
    try{
      const query = 'UPDATE users SET password = ? WHERE email = ?';
      await pool.execute(query, [password, email]);
    }catch(error){
      throw new Error("Database error during password update");
    }
  }

  // ─── Security settings (user dashboard) ──────────────────────────────────

  // Disable a single 2FA method. For TOTP we also clear the stored secret.
  async disable2FAMethod(userId: number, method: "sms" | "email" | "totp") {
    try{
      const query = method === "totp"
        ? 'UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?'
        : `UPDATE users SET ${method}_enabled = 0 WHERE id = ?`;
      await pool.execute(query, [userId]);
    }catch(error){
      throw new Error("Database error during 2FA method disable");
    }
  }

  // Save a TOTP secret without enabling it yet (pending confirmation).
  async setPendingTOTPSecret(userId: number, secret: string) {
    try{
      const query = 'UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?';
      await pool.execute(query, [secret, userId]);
    }catch(error){
      throw new Error("Database error during TOTP secret save");
    }
  }

  // Enable TOTP once the user has confirmed a code against the saved secret.
  async enableTOTP(userId: number) {
    try{
      const query = 'UPDATE users SET totp_enabled = 1 WHERE id = ?';
      await pool.execute(query, [userId]);
    }catch(error){
      throw new Error("Database error during TOTP enable");
    }
  }

  async updatePasswordById(userId: number, password: string) {
    try{
      const query = 'UPDATE users SET password = ? WHERE id = ?';
      await pool.execute(query, [password, userId]);
    }catch(error){
      throw new Error("Database error during password update");
    }
  }

  // ─── Admin: user management ──────────────────────────────────────────────

  async setBlockedStatus(userId: number, blocked: boolean) {
    try{
      const query = 'UPDATE users SET is_blocked = ? WHERE id = ?';
      await pool.execute(query, [blocked ? 1 : 0, userId]);
    }catch(error){
      throw new Error("Database error during user block status update");
    }
  }

  // Paginated user list with optional search across username/email/name.
  async getUsers(search: string, limit: number, offset: number): Promise<RowDataPacket[]> {
    try{
      const like = `%${search}%`;
      const query = search
        ? `SELECT id, name, username, email, phone_number, role, is_blocked, email_verified,
                  sms_enabled, email_enabled, totp_enabled
           FROM users
           WHERE username LIKE ? OR email LIKE ? OR name LIKE ?
           ORDER BY id ASC LIMIT ? OFFSET ?`
        : `SELECT id, name, username, email, phone_number, role, is_blocked, email_verified,
                  sms_enabled, email_enabled, totp_enabled
           FROM users
           ORDER BY id ASC LIMIT ? OFFSET ?`;
      const params = search ? [like, like, like, limit, offset] : [limit, offset];
      const [rows] = await pool.query<RowDataPacket[]>(query, params);
      return rows;
    }catch(error){
      throw new Error("Database error during user list retrieval");
    }
  }

  async countUsers(search: string): Promise<number> {
    try{
      const like = `%${search}%`;
      const query = search
        ? 'SELECT COUNT(*) as count FROM users WHERE username LIKE ? OR email LIKE ? OR name LIKE ?'
        : 'SELECT COUNT(*) as count FROM users';
      const params = search ? [like, like, like] : [];
      const [rows] = await pool.query<RowDataPacket[]>(query, params);
      return rows[0].count;
    }catch(error){
      throw new Error("Database error during user count");
    }
  }
}

export const userDAO = new UserDAO();
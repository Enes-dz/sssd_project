import { refreshTokensDAO } from "../dao/refresh_tokens";
import { userDAO } from "../dao/users";
import { signAccessToken, signRefreshToken } from "../utils/jwt_tokens";
import { allLogsDAO } from "../dao/all_logs";

class RefreshService {
    async refreshToken(payload: any, logInfo: {user_agent:string, ip_address: string}){
        try{
            if (!payload.jti) {
                return { status: 400, data: { errors: ["Missing jti."] } };
            }
            if (!payload.sub) {
                return { status: 400, data: { errors: ["Missing sub."] } };
            }
            const oldJti = payload.jti;
            const userId = payload.sub;

            const refreshInfo = await refreshTokensDAO.getRefreshInfo(oldJti);
            if (!refreshInfo) {
                await allLogsDAO.logFailedRefreshToken(
                    logInfo.user_agent,
                    userId,
                    "user",
                    logInfo.ip_address,
                    "refresh_token",
                    "failed(invalid_token)",
                    "refresh_token_revoked"
                );
                return { status: 401, data: { errors: ["Invalid refresh token."] } };
            }
            if (refreshInfo.revoked_at !== null || refreshInfo.expires_at < new Date()){
                await allLogsDAO.logFailedRefreshToken(
                    logInfo.user_agent,
                    userId,
                    "user",
                    logInfo.ip_address,
                    "refresh_token",
                    "failed(expired_token)",
                    "refresh_token_revoked"
                );
                return { status: 401, data: { errors: ["Invalid refresh token."] } };
            }
            const user = await userDAO.findUserById(userId);
            if (!user) {
                return { status: 401, data: { errors: ["User not found."] } };
            }

            const newAccess = await signAccessToken(user);
            const { token: newRefresh, jti: newJti, expiresAt } = await signRefreshToken(user.id);

            await refreshTokensDAO.insertRefreshToken(newJti, user.id, expiresAt, logInfo.user_agent, logInfo.ip_address);
            await refreshTokensDAO.updateRevokedRefreshToken(oldJti, newJti);

            // Log success
            await allLogsDAO.logSuccessfulRefreshToken(
                logInfo.user_agent,
                user.id,
                "user",
                logInfo.ip_address,
                JSON.stringify(refreshInfo),
                JSON.stringify({ jti: newJti, expires_at: expiresAt })
            );

            return { status: 200, data: { message: "New access token created", access_token: newAccess}, refresh_token: newRefresh, refresh_expires_at: expiresAt };
        }catch(error){
            console.error("Error refreshing token:", error);
            return { status: 500, data: { errors: ["Internal server error during refresh token"] } };
        }
    }

    async logout(payload: any, logInfo: {user_agent:string, ip_address: string}){
        try{
            if (!payload.jti) {
                return { status: 400, data: { errors: ["Missing jti."] } };
            }
            if (!payload.sub) {
                return { status: 400, data: { errors: ["Missing sub."] } };
            }
            const oldRefreshInfo = await refreshTokensDAO.getRefreshInfo(payload.jti);
            if (!oldRefreshInfo) {
                return { status: 401, data: { errors: ["Invalid refresh token."] } };
            }
            await refreshTokensDAO.revokeRefreshToken(payload.jti);
            const newRefreshInfo = await refreshTokensDAO.getRefreshInfo(payload.jti);
            if (newRefreshInfo) {
                return { status: 401, data: { errors: ["Invalid refresh token."] } };
            }
            // Log logout
            await allLogsDAO.logLogout(
                logInfo.user_agent,
                oldRefreshInfo.user_id,
                "user",
                logInfo.ip_address,
                "refresh_token",
                JSON.stringify(oldRefreshInfo),
                JSON.stringify(newRefreshInfo),
                "logout",
                "success",
                "refresh_token_revoked"
            );

            return { status: 200, data: { message: "Logout successful" } };
        }catch(error){
            console.error("Error logging out:", error);
            return { status: 500, data: { errors: ["Internal server error during logout"] } };
        }
    }
}

export const refreshService = new RefreshService();
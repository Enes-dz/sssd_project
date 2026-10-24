import { userDAO } from "../dao/users";
import { allLogsDAO } from "../dao/all_logs";
import { reservedUserDAO } from "../dao/reserved_users";
import { refreshTokensDAO } from "../dao/refresh_tokens";

type LogInfo = { user_agent: string, ip_address: string };
type Actor = { id: number, role: string };

function clampInt(value: any, def: number, min: number, max: number): number {
    const n = parseInt(value, 10);
    if (isNaN(n)) return def;
    return Math.min(Math.max(n, min), max);
}

// `time` is stored as a numeric YYYYMMDDHHMMSS bigint.
function dateToLowerBound(date: string): number | undefined {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) return undefined;
    return parseInt(`${m[1]}${m[2]}${m[3]}000000`, 10);
}
function dateToUpperBound(date: string): number | undefined {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) return undefined;
    return parseInt(`${m[1]}${m[2]}${m[3]}235959`, 10);
}
function formatLogTime(time: number | null): string | null {
    if (time == null) return null;
    const s = String(time).padStart(14, "0");
    return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}`;
}

const RESERVED_USERNAME_REGEX = /^[a-zA-Z0-9]{1,100}$/;

class AdminService {

    // ─── Users preview + blocking ──────────────────────────────────────────────
    async listUsers(query: any) {
        try {
            const page = clampInt(query.page, 1, 1, 1000000);
            const limit = clampInt(query.limit, 20, 1, 100);
            const search = (typeof query.search === "string" ? query.search : "").trim();
            const offset = (page - 1) * limit;

            const [users, total] = await Promise.all([
                userDAO.getUsers(search, limit, offset),
                userDAO.countUsers(search),
            ]);

            const mapped = users.map(u => ({
                id: u.id,
                name: u.name,
                username: u.username,
                email: u.email,
                phone_number: u.phone_number,
                role: u.role,
                is_blocked: !!u.is_blocked,
                email_verified: !!u.email_verified,
                two_factor: { sms: !!u.sms_enabled, email: !!u.email_enabled, totp: !!u.totp_enabled },
            }));

            return {
                status: 200,
                data: {
                    status: "success",
                    users: mapped,
                    pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) },
                }
            };
        } catch (error) {
            return { status: 500, data: { status: "error", message: "Failed to load users." } };
        }
    }

    async setUserBlocked(actor: Actor, targetId: number, blocked: boolean, logInfo: LogInfo) {
        try {
            if (!targetId || isNaN(targetId)) {
                return { status: 400, data: { status: "error", message: "Invalid user id." } };
            }
            if (targetId === actor.id) {
                return { status: 400, data: { status: "error", message: "You cannot block your own account." } };
            }
            const target = await userDAO.findUserById(targetId);
            if (!target) {
                return { status: 404, data: { status: "error", message: "User not found." } };
            }
            if (target.role === "admin" && blocked) {
                return { status: 403, data: { status: "error", message: "Administrators cannot be blocked." } };
            }
            if (!!target.is_blocked === blocked) {
                return { status: 400, data: { status: "error", message: `User is already ${blocked ? "blocked" : "active"}.` } };
            }

            await userDAO.setBlockedStatus(targetId, blocked);
            // A blocked user should lose any active sessions immediately.
            if (blocked) await refreshTokensDAO.revokeAllForUser(targetId);

            await allLogsDAO.logEvent({
                user_agent: logInfo.user_agent, user_id: actor.id, user_role: actor.role,
                ip_address: logInfo.ip_address, action: blocked ? "block_user" : "unblock_user",
                status: "success", event_type: "admin_user_management",
                object_changed: "is_blocked", object_id: targetId,
                original_object: String(!!target.is_blocked), new_object: String(blocked),
            });

            return { status: 200, data: { status: "success", message: `User ${blocked ? "blocked" : "unblocked"} successfully.` } };
        } catch (error) {
            return { status: 500, data: { status: "error", message: "Failed to update user block status." } };
        }
    }

    // ─── Audit logs preview ─────────────────────────────────────────────────────
    async listLogs(query: any) {
        try {
            const page = clampInt(query.page, 1, 1, 1000000);
            const limit = clampInt(query.limit, 25, 1, 100);
            const offset = (page - 1) * limit;

            const filters: any = {};
            if (query.user_id && !isNaN(parseInt(query.user_id, 10))) filters.user_id = parseInt(query.user_id, 10);
            if (query.event_type) filters.event_type = String(query.event_type);
            if (query.action) filters.action = String(query.action);
            if (query.status) filters.status = String(query.status);
            if (query.user_role) filters.user_role = String(query.user_role);
            if (query.ip_address) filters.ip_address = String(query.ip_address);
            if (query.date_from) filters.time_from = dateToLowerBound(String(query.date_from));
            if (query.date_to) filters.time_to = dateToUpperBound(String(query.date_to));

            const [logs, total, eventTypes, actions, statuses] = await Promise.all([
                allLogsDAO.getLogs(filters, limit, offset),
                allLogsDAO.countLogs(filters),
                allLogsDAO.getDistinct("event_type"),
                allLogsDAO.getDistinct("action"),
                allLogsDAO.getDistinct("status"),
            ]);

            const mapped = logs.map(l => ({
                id: l.id,
                time: l.time,
                time_formatted: formatLogTime(l.time),
                user_id: l.user_id,
                user_role: l.user_role,
                ip_address: l.ip_address,
                user_agent: l.user_agent,
                action: l.action,
                status: l.status,
                event_type: l.event_type,
                object_changed: l.object_changed,
                object_id: l.object_id,
            }));

            return {
                status: 200,
                data: {
                    status: "success",
                    logs: mapped,
                    pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) },
                    filter_options: { event_types: eventTypes, actions, statuses },
                }
            };
        } catch (error) {
            return { status: 500, data: { status: "error", message: "Failed to load audit logs." } };
        }
    }

    // ─── Reserved usernames CRUD ────────────────────────────────────────────────
    async listReserved(query: any) {
        try {
            const page = clampInt(query.page, 1, 1, 1000000);
            const limit = clampInt(query.limit, 20, 1, 100);
            const search = (typeof query.search === "string" ? query.search : "").trim().toLowerCase();
            const offset = (page - 1) * limit;

            const [rows, total] = await Promise.all([
                reservedUserDAO.getAll(search, limit, offset),
                reservedUserDAO.count(search),
            ]);

            return {
                status: 200,
                data: {
                    status: "success",
                    reserved_usernames: rows.map(r => r.username),
                    pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) },
                }
            };
        } catch (error) {
            return { status: 500, data: { status: "error", message: "Failed to load reserved usernames." } };
        }
    }

    async createReserved(actor: Actor, usernameRaw: string, logInfo: LogInfo) {
        try {
            const username = (usernameRaw || "").trim().toLowerCase();
            if (!RESERVED_USERNAME_REGEX.test(username)) {
                return { status: 400, data: { status: "error", message: "Username must be alphanumeric (1-100 characters)." } };
            }
            if (await reservedUserDAO.isReserved(username)) {
                return { status: 409, data: { status: "error", message: "This username is already reserved." } };
            }
            await reservedUserDAO.add(username);
            await allLogsDAO.logEvent({
                user_agent: logInfo.user_agent, user_id: actor.id, user_role: actor.role,
                ip_address: logInfo.ip_address, action: "create_reserved_username",
                status: "success", event_type: "admin_reserved_username",
                object_changed: "reserved_username", new_object: username,
            });
            return { status: 201, data: { status: "success", message: "Reserved username added.", username } };
        } catch (error) {
            return { status: 500, data: { status: "error", message: "Failed to add reserved username." } };
        }
    }

    async updateReserved(actor: Actor, oldUsernameRaw: string, newUsernameRaw: string, logInfo: LogInfo) {
        try {
            const oldUsername = (oldUsernameRaw || "").trim().toLowerCase();
            const newUsername = (newUsernameRaw || "").trim().toLowerCase();
            if (!RESERVED_USERNAME_REGEX.test(newUsername)) {
                return { status: 400, data: { status: "error", message: "Username must be alphanumeric (1-100 characters)." } };
            }
            if (!await reservedUserDAO.isReserved(oldUsername)) {
                return { status: 404, data: { status: "error", message: "Reserved username not found." } };
            }
            if (oldUsername !== newUsername && await reservedUserDAO.isReserved(newUsername)) {
                return { status: 409, data: { status: "error", message: "Target username is already reserved." } };
            }
            await reservedUserDAO.rename(oldUsername, newUsername);
            await allLogsDAO.logEvent({
                user_agent: logInfo.user_agent, user_id: actor.id, user_role: actor.role,
                ip_address: logInfo.ip_address, action: "update_reserved_username",
                status: "success", event_type: "admin_reserved_username",
                object_changed: "reserved_username", original_object: oldUsername, new_object: newUsername,
            });
            return { status: 200, data: { status: "success", message: "Reserved username updated.", username: newUsername } };
        } catch (error) {
            return { status: 500, data: { status: "error", message: "Failed to update reserved username." } };
        }
    }

    async deleteReserved(actor: Actor, usernameRaw: string, logInfo: LogInfo) {
        try {
            const username = (usernameRaw || "").trim().toLowerCase();
            if (!await reservedUserDAO.isReserved(username)) {
                return { status: 404, data: { status: "error", message: "Reserved username not found." } };
            }
            await reservedUserDAO.remove(username);
            await allLogsDAO.logEvent({
                user_agent: logInfo.user_agent, user_id: actor.id, user_role: actor.role,
                ip_address: logInfo.ip_address, action: "delete_reserved_username",
                status: "success", event_type: "admin_reserved_username",
                object_changed: "reserved_username", original_object: username,
            });
            return { status: 200, data: { status: "success", message: "Reserved username removed." } };
        } catch (error) {
            return { status: 500, data: { status: "error", message: "Failed to delete reserved username." } };
        }
    }
}

export const adminService = new AdminService();

import { userDAO } from "../dao/users";

class UserInfo {
    async getUserInfo(jwt_data:any){
        const userId = jwt_data.sub;
        const userInfo = await userDAO.findUserById(userId);
        if (!userInfo){
            return {
                status: 404,
                data: {
                    status: "error",
                    message: "User not found"
                }
            }
        }

        return {
            status: 200,
            data : {
                status: "success",
                id: userInfo.id,
                username: userInfo.username,
                name: userInfo.name,
                email: userInfo.email,
                role: userInfo.role,
                phone_number: userInfo.phone_number,
                is_blocked: !!userInfo.is_blocked,
                two_factor: {
                    sms: !!userInfo.sms_enabled,
                    email: !!userInfo.email_enabled,
                    totp: !!userInfo.totp_enabled,
                }
            }
        }
    }
}

export const userInfoService = new UserInfo();

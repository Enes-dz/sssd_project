import { config } from '../config';
import { httpClient } from '../utils/httpClient';
import { userDAO } from '../dao/users';
import { allLogsDAO } from '../dao/all_logs';



class VerificationService {
    private infobipBaseUrl = config.infobipBaseUrl;
    private infobipApiKey = config.infobipApiKey; 

    async sendSMS(mobileNumber: string, code: string) {
        const url = `${this.infobipBaseUrl}/sms/2/text/advanced`;

        const body = {
            messages: [
            {
                destinations: [{ to: mobileNumber }],
                from: "ServiceAuth",
                text: `Your verification code is: ${code}`
            }
            ]
        };

        const headers = {
            'Authorization': `App ${this.infobipApiKey}`,
        };

        try {
            return await httpClient(url, 'POST', body, headers);
        } catch (error) {
            console.error("SMS Failed", error);
            throw new Error("Failed to send SMS");
        }
    }
    async emailVerification(token:string, logInfo: {user_agent:string, ip_address: string}){
        try{
            const tokenData = await userDAO.verify_email_token(token);
            if (!tokenData) {
                return { status: 400, data: { errors: ["Invalid verification token."] } };
            }
            //Check if token is expired
            if(tokenData && tokenData.expiresAt < Date.now()){
                return { status: 400, data: { errors: ["Token has expired. Please request a new verification email."] } };
            }

            //Activate user
            await userDAO.activateUser(token);
            //log email verification
            await allLogsDAO.logemailVerification(
                logInfo.user_agent,
                tokenData.id,
                "user",
                logInfo.ip_address,
                "email_verification",
                "success",
                "email_verification"
            );
            return { status: 200, data: { message: "Email verified successfully" } };
            
        } catch (error) {
            console.error("Email Verification Failed", error);
            return { status: 500, data: { errors: ["Failed to verify email."] } };
        }
    }
}

export const verificationService = new VerificationService();

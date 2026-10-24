import { config } from '../config';
import { httpClient } from './httpClient';

export async function sendSMS(mobileNumber: string, code: string) {
    const infobipBaseUrl = config.infobipBaseUrl;
    const infobipApiKey = config.infobipApiKey; 
    const url = `${infobipBaseUrl}/sms/2/text/advanced`;

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
        'Authorization': `App ${infobipApiKey}`,
    };

    try {
        return await httpClient(url, 'POST', body, headers);
    } catch (error) {
        console.error("SMS Failed", error);
        throw new Error("Failed to send SMS");
    }
}
import { generateSecret, generateURI, generate, verify } from "otplib";


export function generateTOTPSecret(username: string) {
    const secret = generateSecret();
     
    const otpAuthUri = generateURI(
        {
            secret,
            label: `${username}_SSSD_project`,
            issuer: "Enes App"
        }
    );

    return { secret, otpAuthUri };
}

export async function verifyTOTPToken(secret: string, token: string): Promise<boolean> {
    const result = await verify({ secret: secret, token: token })
    return result.valid;
}

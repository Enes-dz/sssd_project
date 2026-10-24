import {randomBytes} from "crypto";
import bcrypt from "bcrypt";

const saltRounds = 10;


export async function generateRecoveryCode(): Promise<{ plainCode: string; hashedCode: string }> {
    const code = randomBytes(5).toString("hex"); 

    //Hash the code before returning
    const hashedCode = await bcrypt.hash(code, saltRounds);
    return {
        plainCode: code,
        hashedCode: hashedCode
    };
}

export async function verifyRecoveryCode(plainCode: string, hashedCode: string): Promise<boolean> {
    return await bcrypt.compare(plainCode, hashedCode);
}
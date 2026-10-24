import { generateSecret, generateURI } from "otplib";

const secret = generateSecret();
console.log("Secret:", secret);

const otpUri = generateURI(
    {
        secret,
        label: "user@stu.ibu.edu.ba",
        issuer: "MyService"
    }
)
console.log("OTP URI:", otpUri);
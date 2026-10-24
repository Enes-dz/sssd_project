import crypto from "crypto";

export const haveIBeenPwnedCheck = async (password: string): Promise<boolean> => {
    const sha1Hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1Hash.slice(0, 5);
    const suffix = sha1Hash.slice(-5);

    try {
        const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.text();
        
        if (data.includes(suffix)) {
            return true; 
        }else {
            return false; 
        }

    } catch (error) {
        console.error("Error occurred while checking pwned passwords:", error);
        return true; // Assume password is pwned if there's an error to err on the side of caution
    }
}
import { httpClient } from "../src/utils/httpClient";

export async function isValidTLD(email: string): Promise<boolean> {
  const ianaUrl = "https://data.iana.org/TLD/tlds-alpha-by-domain.txt";

  try {
    const parts = email.split('.');
    if (parts.length < 2) return false;

    const emailTld = parts.pop()?.toUpperCase().trim();
    if (!emailTld) return false;

    const data = await httpClient(ianaUrl, 'GET');

    if (typeof data !== 'string') {
      throw new Error("Unexpected response format from IANA");
    }

    const validTlds = new Set(
      data
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
    );

    // 4. Validate existence
    return validTlds.has(emailTld);
  } catch (error) {
    console.error("TLD Validation Error:", error);
    return false;
  }
}
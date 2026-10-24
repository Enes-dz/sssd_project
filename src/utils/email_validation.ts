import { httpClient } from "./httpClient";
import {promises as dns} from 'dns';


export function emailFormatIsValid(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        return false; // Invalid email format
      }
      return true; // Valid email format
}

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

    return validTlds.has(emailTld);
  } catch (error) {
    console.error("TLD Validation Error:", error);
    return false;
  }
}

export async function isDomainValid(email: string): Promise<boolean> {
    try {
        const domain = email.split('@').pop();
        if (!domain) return false;
        dns.setServers(['8.8.8.8', '1.1.1.1']);
        const mxRecords = await dns.resolveMx(domain);
        return mxRecords && mxRecords.length > 0;
    }catch (error) {
        console.error("Domain Validation Error:", error);
        return false;
    }
}
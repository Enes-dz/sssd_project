
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const httpClient = async (
  url: string,
  method: HttpMethod,
  body: any = null,
  headers: Record<string, string> = {}
) => {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body) {
    if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
      options.body = new URLSearchParams(body).toString();
    } else {
      options.body = JSON.stringify(body);
    }
  }

  const response = await fetch(url, options);
  
  // Return text if not JSON to avoid parsing errors
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return await response.json();
  }
  return await response.text();
};
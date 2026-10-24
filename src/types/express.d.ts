// src/types/express.d.ts

export interface SingleSignOnJWTPayload {
  type: "third_party_login";
  email: string;
  name: string;
}

export type CustomJWTPayloads = 
  | SingleSignOnJWTPayload ;

declare global {
    namespace Express {
        interface Request {
            jwt_data?: CustomJWTPayloads;
        }
    }
  }

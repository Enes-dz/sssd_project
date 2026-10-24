import { OpenAPIV3 } from "openapi-types";
import { config } from "../config";

export const openApiSpec: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: {
    title: "SSD2026 API",
    version: "1.0.0",
    description:
      "Authentication & account-management API for the SSD2026 project.\n\n" +
      "It covers registration, login with multi-factor authentication " +
      "(email / SMS / TOTP), OAuth sign-in (Google & GitHub), password reset, " +
      "refresh-token sessions, a self-service user dashboard and an admin panel.\n\n" +
      "**Authentication model**\n" +
      "- Most authenticated calls expect a short-lived access JWT in the non-standard " +
      "`auth` request header (not `Authorization`).\n" +
      "- The login-time 2FA endpoints expect the temporary 2FA JWT (issued by `/login`) " +
      "in the same `auth` header.\n" +
      "- `/refresh` and `/logout` rely on the HttpOnly `refresh_token` cookie that the " +
      "server sets on a successful login / 2FA verification.",
  },
  servers: [
    { url: `${config.baseUrl}/api`, description: "API server" },
  ],
  tags: [
    { name: "Health", description: "Server liveness check" },
    { name: "Auth", description: "Registration, login, sessions and password reset" },
    { name: "2FA", description: "Two-factor enrollment and login-time verification" },
    { name: "OAuth", description: "Google & GitHub single sign-on" },
    { name: "Dashboard", description: "Authenticated user self-service (profile, password, 2FA)" },
    { name: "Admin", description: "Admin-only user, audit-log and reserved-username management" },
  ],

  components: {
    securitySchemes: {
      accessToken: {
        type: "apiKey",
        in: "header",
        name: "auth",
        description: "Short-lived access JWT issued after a successful login / 2FA step. Carries { sub, username, email, role }.",
      },
      twoFactorToken: {
        type: "apiKey",
        in: "header",
        name: "auth",
        description: "Temporary login-time 2FA JWT returned by /login (field `jwt_2fa`). Sent in the `auth` header when verifying a 2FA code.",
      },
      singleSignOnToken: {
        type: "apiKey",
        in: "header",
        name: "auth",
        description: "Single-sign-on JWT returned by the OAuth callbacks for brand-new users (field `jwt`). Used to complete OAuth registration.",
      },
      refreshCookie: {
        type: "apiKey",
        in: "cookie",
        name: "refresh_token",
        description: "HttpOnly refresh-token cookie set by the server on login / 2FA verification.",
      },
    },

    schemas: {
      Error: {
        type: "object",
        properties: {
          status: { type: "string", example: "error" },
          message: { type: "string", example: "Something went wrong" },
        },
        required: ["status", "message"],
      },
      ValidationError: {
        type: "object",
        description: "Returned by registration / verification flows that collect multiple field errors.",
        properties: {
          errors: {
            type: "array",
            items: { type: "string" },
            example: ["Username must be alphanumeric (no spaces or special characters)."],
          },
        },
        required: ["errors"],
      },
      Message: {
        type: "object",
        properties: {
          message: { type: "string", example: "Operation successful" },
        },
        required: ["message"],
      },
      StatusMessage: {
        type: "object",
        properties: {
          status: { type: "string", example: "success" },
          message: { type: "string", example: "Operation successful" },
        },
        required: ["status", "message"],
      },
      TwoFactorFlags: {
        type: "object",
        description: "Which 2FA methods are currently enabled for the user.",
        properties: {
          sms: { type: "boolean", example: false },
          email: { type: "boolean", example: true },
          totp: { type: "boolean", example: false },
        },
        required: ["sms", "email", "totp"],
      },
      Pagination: {
        type: "object",
        properties: {
          page: { type: "integer", example: 1 },
          limit: { type: "integer", example: 20 },
          total: { type: "integer", example: 137 },
          total_pages: { type: "integer", example: 7 },
        },
        required: ["page", "limit", "total", "total_pages"],
      },
      AdminUser: {
        type: "object",
        properties: {
          id: { type: "integer", example: 42 },
          name: { type: "string", example: "John Doe" },
          username: { type: "string", example: "johndoe123" },
          email: { type: "string", example: "john@example.com" },
          phone_number: { type: "string", example: "+1234567890" },
          role: { type: "string", example: "user" },
          is_blocked: { type: "boolean", example: false },
          email_verified: { type: "boolean", example: true },
          two_factor: { $ref: "#/components/schemas/TwoFactorFlags" },
        },
      },
      AuditLogEntry: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1001 },
          time: {
            type: "integer",
            format: "int64",
            description: "Raw event time as a YYYYMMDDHHMMSS numeric value.",
            example: 20260601153000,
          },
          time_formatted: { type: "string", nullable: true, example: "2026-06-01 15:30:00" },
          user_id: { type: "integer", nullable: true, example: 42 },
          user_role: { type: "string", nullable: true, example: "user" },
          ip_address: { type: "string", nullable: true, example: "203.0.113.7" },
          user_agent: { type: "string", nullable: true, example: "Mozilla/5.0" },
          action: { type: "string", nullable: true, example: "login" },
          status: { type: "string", nullable: true, example: "success" },
          event_type: { type: "string", nullable: true, example: "login" },
          object_changed: { type: "string", nullable: true, example: "is_blocked" },
          object_id: { type: "integer", nullable: true, example: 42 },
        },
      },
    },

    responses: {
      ServerError: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      UnauthorizedError: {
        description: "Missing, invalid or expired authentication token",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            examples: {
              missing: { value: { status: "error", message: "Authorization header missing" } },
              invalid: { value: { status: "error", message: "Invalid or expired token" } },
            },
          },
        },
      },
      ForbiddenError: {
        description: "Authenticated but not allowed to perform this action",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
            examples: {
              wrongTokenType: { value: { status: "error", message: "Wrong token type" } },
              adminRequired: { value: { status: "error", message: "Administrator access required" } },
              blocked: { value: { status: "error", message: "Account is blocked" } },
            },
          },
        },
      },
    },
  },

  paths: {
    // ─────────────────────────── Health ───────────────────────────
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Server liveness check",
        operationId: "healthCheck",
        responses: {
          "200": {
            description: "Server is alive",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { data: { type: "string", example: "OK" } },
                  required: ["data"],
                },
              },
            },
          },
        },
      },
    },

    // ─────────────────────────── Auth ───────────────────────────
    "/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user",
        description:
          "Validates the submitted profile (username, password strength, breached-password check, " +
          "email format / TLD / deliverability, phone number) and, on success, creates the account " +
          "and sends an email-verification link.",
        operationId: "registerUser",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  full_name: { type: "string", example: "John Doe" },
                  username: { type: "string", example: "johndoe123" },
                  password: { type: "string", format: "password", example: "Password@123" },
                  email: { type: "string", format: "email", example: "john@example.com" },
                  phone_number: { type: "string", example: "+1234567890" },
                },
                required: ["full_name", "username", "password", "email", "phone_number"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Registration successful — verification email sent",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Message" },
                example: { message: "Registration successful" },
              },
            },
          },
          "400": {
            description: "Validation errors",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationError" },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/login": {
      post: {
        tags: ["Auth"],
        summary: "Login with username/email and password",
        description:
          "Step 1 of authentication. Depending on account state the response can be:\n" +
          "- `success` — trusted device, fully authenticated (access token returned, refresh cookie set).\n" +
          "- `2fa_required` — a second factor is needed; use the returned `jwt_2fa` with the matching 2FA verify endpoint.\n" +
          "- `captcha_required` — too many recent attempts; solve the captcha via `/captcha/verify` and retry.\n" +
          "Setting a `trusted_device_token` property in the body makes the server read the trusted-device cookie to skip 2FA.",
        operationId: "loginUser",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  identity: { type: "string", description: "Email or username", example: "john@example.com" },
                  password: { type: "string", format: "password", example: "Password@123" },
                  jwt_token: {
                    type: "string",
                    description: "Optional captcha JWT (from /captcha/verify) when a captcha was required.",
                  },
                  trusted_device_token: {
                    type: "boolean",
                    description: "Presence of this key tells the server to read the `trusted_device_token` cookie to skip 2FA.",
                  },
                },
                required: ["identity", "password"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Password accepted. Either fully authenticated or a 2FA step is required.",
            headers: {
              "Set-Cookie": {
                description: "HttpOnly `refresh_token` cookie (only when fully authenticated via a trusted device).",
                schema: { type: "string" },
              },
            },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string" },
                    access_token: { type: "string" },
                    user: { type: "string" },
                    method: { type: "string", enum: ["totp", "sms", "email", "google"] },
                    jwt_2fa: { type: "string" },
                  },
                },
                examples: {
                  trustedDevice: {
                    summary: "Trusted device — fully authenticated",
                    value: { status: "success", message: "Successfully logged in", access_token: "eyJhbGci..." },
                  },
                  twoFactorRequired: {
                    summary: "2FA required",
                    value: { status: "2fa_required", user: "johndoe123", method: "totp", jwt_2fa: "eyJhbGci..." },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing identity or password",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Missing identity or password" },
              },
            },
          },
          "401": {
            description: "Incorrect password",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Incorrect password" },
              },
            },
          },
          "403": {
            description: "Captcha required, account blocked, email not verified, or 2FA setup required",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    message: { type: "string" },
                    jwt_captcha: { type: "string" },
                  },
                },
                examples: {
                  captchaRequired: { value: { status: "captcha_required", message: "Please complete captcha to continue", jwt_captcha: "eyJhbGci..." } },
                  blocked: { value: { status: "error", message: "Your account is blocked. Please contact support." } },
                  emailNotVerified: { value: { status: "error", message: "Email not verified. Please check your inbox." } },
                  setupRequired: { value: { status: "error", message: "2FA setup required. Please check your email." } },
                },
              },
            },
          },
          "404": {
            description: "User does not exist",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "User doesn't exist" },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/verify_email": {
      get: {
        tags: ["Auth"],
        summary: "Verify a user's email address",
        description: "Consumes the token from the verification email and activates the account.",
        operationId: "verifyEmail",
        parameters: [
          {
            name: "token",
            in: "query",
            required: true,
            description: "Email-verification token from the link sent during registration.",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Email verified",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Message" },
                example: { message: "Email verified successfully" },
              },
            },
          },
          "400": {
            description: "Invalid or expired token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationError" },
                example: { errors: ["Invalid verification token."] },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/captcha/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify an hCaptcha challenge",
        description:
          "Validates the hCaptcha response against the issued captcha JWT and returns a refreshed " +
          "captcha JWT recording the outcome, to be replayed on the original action (login / password reset).",
        operationId: "verifyCaptcha",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  jwt_captcha: { type: "string", description: "Captcha JWT previously issued by the server." },
                  "h-captcha-response": { type: "string", description: "Token produced by the hCaptcha widget." },
                },
                required: ["jwt_captcha", "h-captcha-response"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Captcha passed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "Captcha passed" },
                    jwt_token: { type: "string" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing jwt_captcha parameter",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Missing jwt_captcha parameter" },
              },
            },
          },
          "403": {
            description: "Invalid captcha token or captcha failed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "error" },
                    message: { type: "string", example: "Captcha failed" },
                    jwt_token: { type: "string" },
                  },
                },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/password-reset": {
      post: {
        tags: ["Auth"],
        summary: "Request a password-reset email",
        description:
          "Sends a reset link to the account email. After 2+ resets in 60 minutes a captcha is required; " +
          "in that case provide a passing captcha JWT as `jwt_captcha_token`.",
        operationId: "requestPasswordReset",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email", example: "john@example.com" },
                  jwt_captcha_token: { type: "string", description: "Optional captcha JWT when a captcha is required." },
                },
                required: ["email"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Reset email sent",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusMessage" },
                example: { status: "success", message: "Password reset email sent" },
              },
            },
          },
          "400": {
            description: "Invalid email",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Invalid email" },
              },
            },
          },
          "403": {
            description: "Captcha required",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "captcha_required" },
                    message: { type: "string", example: "Please complete captcha to continue" },
                    jwt_captcha: { type: "string" },
                  },
                },
              },
            },
          },
          "404": {
            description: "User not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "User not found" },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/password-reset/verify": {
      post: {
        tags: ["Auth"],
        summary: "Complete a password reset",
        description: "Validates the reset token + email, enforces password policy and breach check, then updates the password.",
        operationId: "verifyPasswordReset",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  token: { type: "string", description: "Reset token from the email link." },
                  new_password: { type: "string", format: "password", example: "NewPassword@123" },
                  email: { type: "string", format: "email", example: "john@example.com" },
                },
                required: ["token", "new_password", "email"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Password reset successful",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusMessage" },
                example: { status: "success", message: "Password reset successful" },
              },
            },
          },
          "400": {
            description: "Invalid token/email, expired token, or password policy failure",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                examples: {
                  expired: { value: { status: "error", message: "Token expired. Start password reset process again." } },
                  weak: { value: { status: "error", message: "This password has been pwned. Please choose a different one." } },
                },
              },
            },
          },
          "404": {
            description: "Invalid token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Invalid token" },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/trusted-device": {
      post: {
        tags: ["Auth"],
        summary: "Remember the current device (skip future 2FA)",
        description:
          "Issues a trusted-device token (stored as the HttpOnly `trusted_device_token` cookie) so that future " +
          "logins from the same device & user-agent can skip the 2FA step until it expires (10 days).",
        operationId: "writeTrustedDevice",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { email: { type: "string", format: "email", example: "john@example.com" } },
                required: ["email"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Trusted device stored",
            headers: {
              "Set-Cookie": {
                description: "HttpOnly `trusted_device_token` cookie.",
                schema: { type: "string" },
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusMessage" },
                example: { status: "success", message: "Trusted device written successfully" },
              },
            },
          },
          "400": {
            description: "Missing required fields",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Missing required fields" },
              },
            },
          },
          "404": {
            description: "User not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "User not found" },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Rotate the access & refresh tokens",
        description:
          "Reads the `refresh_token` cookie, rotates it (revoking the old one) and returns a new access token. " +
          "A fresh `refresh_token` cookie is set; on failure the cookie is cleared.",
        operationId: "refreshSession",
        security: [{ refreshCookie: [] }],
        responses: {
          "200": {
            description: "New access token issued",
            headers: {
              "Set-Cookie": { description: "Rotated HttpOnly `refresh_token` cookie.", schema: { type: "string" } },
            },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "New access token created" },
                    access_token: { type: "string" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Missing, invalid or revoked refresh token",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string", example: "invalid_refresh" } },
                },
              },
            },
          },
          "500": {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string", example: "internal_server_error" } },
                },
              },
            },
          },
        },
      },
    },

    "/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out (revoke the refresh token)",
        description: "Revokes the refresh token associated with the `refresh_token` cookie and clears the cookie.",
        operationId: "logout",
        security: [{ refreshCookie: [] }],
        responses: {
          "200": {
            description: "Logged out",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Message" },
                example: { message: "Logout successful" },
              },
            },
          },
          "401": {
            description: "Not logged in or invalid refresh token",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string", example: "not_logged_in" } },
                },
              },
            },
          },
          "500": {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string", example: "internal_server_error" } },
                },
              },
            },
          },
        },
      },
    },

    // ─────────────────────────── 2FA ───────────────────────────
    "/2fa/email": {
      get: {
        tags: ["2FA"],
        summary: "Enable email 2FA (enrollment)",
        description: "Uses the one-time 2FA setup token (emailed when 2FA setup is required) to enable email-based 2FA. May return a one-time recovery code.",
        operationId: "initiateEmail2FA",
        parameters: [
          { name: "token", in: "query", required: true, description: "2FA setup token.", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Email 2FA enabled",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Message" },
                example: { message: "Email 2FA setup successful. Use the following recovery code if you lose access to your email: ABCD-1234" },
              },
            },
          },
          "400": {
            description: "Missing/invalid/expired token or method already enabled",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationError" },
                example: { errors: ["Invalid 2FA setup token."] },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/2fa/email/verify": {
      post: {
        tags: ["2FA"],
        summary: "Verify an email 2FA code (login)",
        description: "Completes a login that requires email 2FA. Send the `jwt_2fa` token from /login in the `auth` header and the emailed code in the body.",
        operationId: "verifyEmail2FA",
        security: [{ twoFactorToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { code: { type: "string", example: "123456" } },
                required: ["code"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "2FA verified — fully authenticated",
            headers: {
              "Set-Cookie": { description: "HttpOnly `refresh_token` cookie.", schema: { type: "string" } },
            },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "Email 2FA verification successful." },
                    access_token: { type: "string" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing token/code, invalid code, or invalid/expired 2FA token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationError" },
                example: { errors: ["Invalid email code."] },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/2fa/sms": {
      get: {
        tags: ["2FA"],
        summary: "Start SMS 2FA enrollment",
        description: "Sends a one-time SMS code and returns an encrypted `sms_code` JWT to be replayed at /2fa/sms/enable.",
        operationId: "initiateSMS2FA",
        parameters: [
          { name: "token", in: "query", required: true, description: "2FA setup token.", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "SMS code sent",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "Please enter the code sent to your phone." },
                    sms_code: { type: "string" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing/invalid/expired token or SMS 2FA already enabled",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationError" },
                example: { errors: ["Invalid 2FA setup token."] },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/2fa/sms/enable": {
      post: {
        tags: ["2FA"],
        summary: "Confirm SMS 2FA enrollment",
        description: "Verifies the SMS code (using the `sms_code` JWT in the `auth` header) and enables SMS 2FA. May return a one-time recovery code.",
        operationId: "enableSMS2FA",
        security: [{ twoFactorToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { code: { type: "string", example: "123456" } },
                required: ["code"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "SMS 2FA enabled",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Message" },
                example: { message: "SMS 2FA setup successful. Log in to your account." },
              },
            },
          },
          "400": {
            description: "Missing token/code or invalid code",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationError" },
                example: { errors: ["Invalid code."] },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/2fa/sms/verify": {
      post: {
        tags: ["2FA"],
        summary: "Verify an SMS 2FA code (login)",
        description: "Completes a login that requires SMS 2FA. Send the `jwt_2fa` token from /login in the `auth` header.",
        operationId: "verifySMS2FA",
        security: [{ twoFactorToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { code: { type: "string", example: "123456" } },
                required: ["code"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "2FA verified — fully authenticated",
            headers: {
              "Set-Cookie": { description: "HttpOnly `refresh_token` cookie.", schema: { type: "string" } },
            },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "SMS 2FA verification successful." },
                    access_token: { type: "string" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing token/code, invalid code, or invalid/expired 2FA token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationError" },
                example: { errors: ["Invalid SMS code."] },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/2fa/totp": {
      get: {
        tags: ["2FA"],
        summary: "Start TOTP 2FA enrollment",
        description: "Generates a TOTP secret, returns the otpauth URI and a QR-code data URL, and may return a one-time recovery code.",
        operationId: "initiateTOTP2FA",
        parameters: [
          { name: "token", in: "query", required: true, description: "2FA setup token.", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "TOTP secret generated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "TOTP 2FA setup successful. Use the following secret in your authenticator app." },
                    totp_secret: { type: "string", description: "otpauth:// URI", example: "otpauth://totp/SSD2026:johndoe123?secret=JBSWY3DPEHPK3PXP&issuer=SSD2026" },
                    qrCode: { type: "string", description: "Data-URL PNG of the otpauth URI.", example: "data:image/png;base64,iVBORw0KGgo..." },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing/invalid/expired token or TOTP already enabled",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationError" },
                example: { errors: ["TOTP 2FA is already enabled for this user."] },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/2fa/totp/verify": {
      post: {
        tags: ["2FA"],
        summary: "Verify a TOTP code (login)",
        description: "Completes a login that requires TOTP. Send the `jwt_2fa` token from /login in the `auth` header.",
        operationId: "verifyTOTP2FA",
        security: [{ twoFactorToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { code: { type: "string", example: "123456" } },
                required: ["code"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "2FA verified — fully authenticated",
            headers: {
              "Set-Cookie": { description: "HttpOnly `refresh_token` cookie.", schema: { type: "string" } },
            },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "TOTP 2FA verification successful." },
                    access_token: { type: "string" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing token/code, invalid code, or invalid/expired 2FA token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationError" },
                example: { errors: ["Invalid TOTP code."] },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/2fa/reset": {
      post: {
        tags: ["2FA"],
        summary: "Reset all 2FA methods with a recovery code",
        description: "Verifies the recovery code for an account and disables all 2FA methods so the user can re-enroll.",
        operationId: "resetTwoFactor",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email", example: "john@example.com" },
                  recoveryCode: { type: "string", example: "ABCD-1234-EFGH-5678" },
                },
                required: ["email", "recoveryCode"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "2FA reset successful",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Message" },
                example: { message: "2FA reset successful. You can now log in and set up 2FA again." },
              },
            },
          },
          "400": {
            description: "Missing fields or invalid email / recovery code",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationError" },
                example: { errors: ["Invalid recovery code."] },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    // ─────────────────────────── OAuth ───────────────────────────
    "/google-login": {
      get: {
        tags: ["OAuth"],
        summary: "Get the Google OAuth authorization URL",
        operationId: "googleLogin",
        responses: {
          "200": {
            description: "Authorization URL",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { authUrl: { type: "string", example: "https://accounts.google.com/o/oauth2/v2/auth?..." } },
                },
              },
            },
          },
        },
      },
    },

    "/v1/google-callback": {
      get: {
        tags: ["OAuth"],
        summary: "Google OAuth callback",
        description:
          "Exchanges the Google `code` for user info. For an existing user it returns a `2fa_required` payload; " +
          "for a new user it returns a single-sign-on `jwt` to complete registration via /verify-google-register.",
        operationId: "googleCallback",
        parameters: [
          { name: "code", in: "query", required: true, description: "Authorization code from Google.", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Existing user (2FA required) or new user (registration token)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    user: { type: "string" },
                    method: { type: "string" },
                    jwt_2fa: { type: "string" },
                    email: { type: "string" },
                    jwt: { type: "string" },
                  },
                },
                examples: {
                  existingUser: { value: { status: "2fa_required", user: "johndoe123", method: "google", jwt_2fa: "eyJhbGci..." } },
                  newUser: { value: { email: "john@example.com", method: "login", jwt: "eyJhbGci..." } },
                },
              },
            },
          },
          "400": {
            description: "Missing code parameter",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Missing code parameter" },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/verify-google-register": {
      post: {
        tags: ["OAuth"],
        summary: "Complete Google sign-up",
        description: "Finishes registration for a Google user. Requires the single-sign-on `jwt` in the `auth` header.",
        operationId: "verifyGoogleRegister",
        security: [{ singleSignOnToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  username: { type: "string", example: "johndoe123" },
                  password: { type: "string", format: "password", example: "Password@123" },
                  phone_number: { type: "string", example: "+1234567890" },
                },
                required: ["username", "password", "phone_number"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "User registered",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusMessage" },
                example: { status: "success", message: "User registered successfully, please login now." },
              },
            },
          },
          "400": {
            description: "Invalid token type or validation failure",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Invalid JWT token type" },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/github-login": {
      get: {
        tags: ["OAuth"],
        summary: "Get the GitHub OAuth authorization URL",
        operationId: "githubLogin",
        responses: {
          "200": {
            description: "Authorization URL",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { authUrl: { type: "string", example: "https://github.com/login/oauth/authorize?..." } },
                },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/v1/github-callback": {
      get: {
        tags: ["OAuth"],
        summary: "GitHub OAuth callback",
        description:
          "Validates the anti-CSRF `state`, exchanges the `code` for the GitHub profile, then returns a " +
          "`2fa_required` payload (existing user) or a single-sign-on `jwt` (new user).",
        operationId: "githubCallback",
        parameters: [
          { name: "code", in: "query", required: true, description: "Authorization code from GitHub.", schema: { type: "string" } },
          { name: "state", in: "query", required: true, description: "Anti-CSRF state issued by /github-login.", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Existing user (2FA required) or new user (registration token)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    user: { type: "string" },
                    method: { type: "string" },
                    jwt_2fa: { type: "string" },
                    email: { type: "string" },
                    jwt: { type: "string" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing code or invalid/missing state parameter",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                examples: {
                  missingCode: { value: { status: "error", message: "Missing code parameter" } },
                  badState: { value: { status: "error", message: "Invalid or missing state parameter" } },
                },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/verify-github-register": {
      post: {
        tags: ["OAuth"],
        summary: "Complete GitHub sign-up",
        description: "Finishes registration for a GitHub user. Requires the single-sign-on `jwt` in the `auth` header.",
        operationId: "verifyGithubRegister",
        security: [{ singleSignOnToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  username: { type: "string", example: "johndoe123" },
                  password: { type: "string", format: "password", example: "Password@123" },
                  phone_number: { type: "string", example: "+1234567890" },
                },
                required: ["username", "password", "phone_number"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "User registered",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusMessage" },
                example: { status: "success", message: "User registered successfully, please login now." },
              },
            },
          },
          "400": {
            description: "Invalid token type or validation failure",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Invalid JWT token type" },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    // ─────────────────────────── Dashboard ───────────────────────────
    "/me": {
      get: {
        tags: ["Dashboard"],
        summary: "Get the current authenticated user",
        description: "Returns the profile + 2FA flags for the user identified by the access token.",
        operationId: "getCurrentUser",
        security: [{ accessToken: [] }],
        responses: {
          "200": {
            description: "Current user",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    id: { type: "integer", example: 42 },
                    username: { type: "string", example: "johndoe123" },
                    name: { type: "string", example: "John Doe" },
                    email: { type: "string", example: "john@example.com" },
                    role: { type: "string", example: "user" },
                    phone_number: { type: "string", example: "+1234567890" },
                    is_blocked: { type: "boolean", example: false },
                    two_factor: { $ref: "#/components/schemas/TwoFactorFlags" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "404": {
            description: "User not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "User not found" },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/dashboard/password/change": {
      post: {
        tags: ["Dashboard"],
        summary: "Change the current user's password",
        description: "Verifies the current password, enforces password policy + breach check, updates it and revokes all sessions.",
        operationId: "changePassword",
        security: [{ accessToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  current_password: { type: "string", format: "password", example: "Password@123" },
                  new_password: { type: "string", format: "password", example: "NewPassword@123" },
                },
                required: ["current_password", "new_password"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Password changed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusMessage" },
                example: { status: "success", message: "Password changed successfully. Please sign in again." },
              },
            },
          },
          "400": {
            description: "Missing fields, same as current, or policy/breach failure",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "New password must be different from the current one." },
              },
            },
          },
          "401": {
            description: "Missing access token or wrong current password",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Current password is incorrect." },
              },
            },
          },
          "404": {
            description: "User not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "User not found." },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/dashboard/2fa/email/init": {
      post: {
        tags: ["Dashboard"],
        summary: "Start enabling email 2FA",
        description: "Emails a verification code and returns a `setup_token` to confirm at /dashboard/2fa/email/confirm.",
        operationId: "dashboardInitEmail2FA",
        security: [{ accessToken: [] }],
        responses: {
          "200": {
            description: "Code sent",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "A verification code was sent to your email." },
                    setup_token: { type: "string" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Email 2FA already enabled",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Email 2FA is already enabled." },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "404": {
            description: "User not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/dashboard/2fa/email/confirm": {
      post: {
        tags: ["Dashboard"],
        summary: "Confirm and enable email 2FA",
        operationId: "dashboardConfirmEmail2FA",
        security: [{ accessToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  setup_token: { type: "string", description: "Token from /dashboard/2fa/email/init." },
                  code: { type: "string", example: "123456" },
                },
                required: ["setup_token", "code"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Email 2FA enabled (recovery code returned on first 2FA setup)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "EMAIL 2FA enabled." },
                    recovery_code: { type: "string", nullable: true, example: "ABCD-1234-EFGH-5678" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing token/code, expired setup, or incorrect code",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Incorrect verification code." },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/dashboard/2fa/sms/init": {
      post: {
        tags: ["Dashboard"],
        summary: "Start enabling SMS 2FA",
        description: "Sends a verification code by SMS and returns a `setup_token` to confirm at /dashboard/2fa/sms/confirm.",
        operationId: "dashboardInitSMS2FA",
        security: [{ accessToken: [] }],
        responses: {
          "200": {
            description: "Code sent",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "A verification code was sent to your phone." },
                    setup_token: { type: "string" },
                  },
                },
              },
            },
          },
          "400": {
            description: "SMS 2FA already enabled",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "SMS 2FA is already enabled." },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "404": {
            description: "User not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/dashboard/2fa/sms/confirm": {
      post: {
        tags: ["Dashboard"],
        summary: "Confirm and enable SMS 2FA",
        operationId: "dashboardConfirmSMS2FA",
        security: [{ accessToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  setup_token: { type: "string", description: "Token from /dashboard/2fa/sms/init." },
                  code: { type: "string", example: "123456" },
                },
                required: ["setup_token", "code"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "SMS 2FA enabled (recovery code returned on first 2FA setup)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "SMS 2FA enabled." },
                    recovery_code: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing token/code, expired setup, or incorrect code",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Incorrect verification code." },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/dashboard/2fa/totp/init": {
      post: {
        tags: ["Dashboard"],
        summary: "Start enabling TOTP 2FA",
        description: "Generates a pending TOTP secret and returns the otpauth URI + QR-code data URL to scan.",
        operationId: "dashboardInitTOTP2FA",
        security: [{ accessToken: [] }],
        responses: {
          "200": {
            description: "TOTP secret generated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "Scan the QR code in your authenticator app, then enter a code to confirm." },
                    otpauth_uri: { type: "string", example: "otpauth://totp/SSD2026:johndoe123?secret=JBSWY3DPEHPK3PXP&issuer=SSD2026" },
                    qr_code: { type: "string", example: "data:image/png;base64,iVBORw0KGgo..." },
                  },
                },
              },
            },
          },
          "400": {
            description: "TOTP 2FA already enabled",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "TOTP 2FA is already enabled." },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "404": {
            description: "User not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/dashboard/2fa/totp/confirm": {
      post: {
        tags: ["Dashboard"],
        summary: "Confirm and enable TOTP 2FA",
        operationId: "dashboardConfirmTOTP2FA",
        security: [{ accessToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { code: { type: "string", example: "123456" } },
                required: ["code"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "TOTP 2FA enabled (recovery code returned on first 2FA setup)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "TOTP 2FA enabled." },
                    recovery_code: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing code, setup not started, or incorrect code",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Incorrect authenticator code." },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/dashboard/2fa/disable": {
      post: {
        tags: ["Dashboard"],
        summary: "Disable a 2FA method",
        description: "Disables the given 2FA method. At least one method must always remain enabled.",
        operationId: "dashboardDisable2FA",
        security: [{ accessToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { method: { type: "string", enum: ["sms", "email", "totp"], example: "sms" } },
                required: ["method"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "2FA method disabled",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusMessage" },
                example: { status: "success", message: "SMS 2FA disabled." },
              },
            },
          },
          "400": {
            description: "Invalid method, method not enabled, or last remaining method",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "At least one 2FA method must remain enabled." },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "404": {
            description: "User not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    // ─────────────────────────── Admin ───────────────────────────
    "/admin/users": {
      get: {
        tags: ["Admin"],
        summary: "List users (paginated, searchable)",
        description: "Admin-only. Requires a valid access token whose user is an admin (role re-checked in the DB).",
        operationId: "adminListUsers",
        security: [{ accessToken: [] }],
        parameters: [
          { name: "page", in: "query", required: false, schema: { type: "integer", default: 1, minimum: 1 } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20, minimum: 1, maximum: 100 } },
          { name: "search", in: "query", required: false, description: "Filter by name / username / email.", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Paged user list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    users: { type: "array", items: { $ref: "#/components/schemas/AdminUser" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/admin/users/{id}/block": {
      post: {
        tags: ["Admin"],
        summary: "Block a user",
        description: "Admin-only. Blocks the target user and revokes all of their active sessions. Admins cannot be blocked and you cannot block yourself.",
        operationId: "adminBlockUser",
        security: [{ accessToken: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "Target user id.", schema: { type: "integer" } },
        ],
        responses: {
          "200": {
            description: "User blocked",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusMessage" },
                example: { status: "success", message: "User blocked successfully." },
              },
            },
          },
          "400": {
            description: "Invalid id, self-block, or already blocked",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "You cannot block your own account." },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": {
            description: "Not an admin, or attempting to block an administrator",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Administrators cannot be blocked." },
              },
            },
          },
          "404": {
            description: "User not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/admin/users/{id}/unblock": {
      post: {
        tags: ["Admin"],
        summary: "Unblock a user",
        operationId: "adminUnblockUser",
        security: [{ accessToken: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "Target user id.", schema: { type: "integer" } },
        ],
        responses: {
          "200": {
            description: "User unblocked",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusMessage" },
                example: { status: "success", message: "User unblocked successfully." },
              },
            },
          },
          "400": {
            description: "Invalid id or already active",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "User is already active." },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "404": {
            description: "User not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/admin/logs": {
      get: {
        tags: ["Admin"],
        summary: "List audit logs (filtered, paginated)",
        description: "Admin-only. Returns audit-log entries with filtering and the distinct values available for each filter.",
        operationId: "adminListLogs",
        security: [{ accessToken: [] }],
        parameters: [
          { name: "page", in: "query", required: false, schema: { type: "integer", default: 1, minimum: 1 } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", default: 25, minimum: 1, maximum: 100 } },
          { name: "user_id", in: "query", required: false, schema: { type: "integer" } },
          { name: "event_type", in: "query", required: false, schema: { type: "string" } },
          { name: "action", in: "query", required: false, schema: { type: "string" } },
          { name: "status", in: "query", required: false, schema: { type: "string" } },
          { name: "user_role", in: "query", required: false, schema: { type: "string" } },
          { name: "ip_address", in: "query", required: false, schema: { type: "string" } },
          { name: "date_from", in: "query", required: false, description: "Inclusive lower bound (YYYY-MM-DD).", schema: { type: "string", format: "date" } },
          { name: "date_to", in: "query", required: false, description: "Inclusive upper bound (YYYY-MM-DD).", schema: { type: "string", format: "date" } },
        ],
        responses: {
          "200": {
            description: "Paged audit logs with filter options",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    logs: { type: "array", items: { $ref: "#/components/schemas/AuditLogEntry" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                    filter_options: {
                      type: "object",
                      properties: {
                        event_types: { type: "array", items: { type: "string" } },
                        actions: { type: "array", items: { type: "string" } },
                        statuses: { type: "array", items: { type: "string" } },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/admin/reserved-usernames": {
      get: {
        tags: ["Admin"],
        summary: "List reserved usernames",
        operationId: "adminListReservedUsernames",
        security: [{ accessToken: [] }],
        parameters: [
          { name: "page", in: "query", required: false, schema: { type: "integer", default: 1, minimum: 1 } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", default: 20, minimum: 1, maximum: 100 } },
          { name: "search", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Paged reserved-username list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    reserved_usernames: { type: "array", items: { type: "string" }, example: ["admin", "root", "support"] },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
      post: {
        tags: ["Admin"],
        summary: "Add a reserved username",
        operationId: "adminCreateReservedUsername",
        security: [{ accessToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { username: { type: "string", example: "support" } },
                required: ["username"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Reserved username added",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "Reserved username added." },
                    username: { type: "string", example: "support" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Username is not alphanumeric (1-100 chars)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Username must be alphanumeric (1-100 characters)." },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "409": {
            description: "Username is already reserved",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "This username is already reserved." },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },

    "/admin/reserved-usernames/{username}": {
      put: {
        tags: ["Admin"],
        summary: "Rename a reserved username",
        operationId: "adminUpdateReservedUsername",
        security: [{ accessToken: [] }],
        parameters: [
          { name: "username", in: "path", required: true, description: "Existing reserved username.", schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { username: { type: "string", description: "New username.", example: "helpdesk" } },
                required: ["username"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Reserved username updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "Reserved username updated." },
                    username: { type: "string", example: "helpdesk" },
                  },
                },
              },
            },
          },
          "400": {
            description: "New username is not alphanumeric (1-100 chars)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Username must be alphanumeric (1-100 characters)." },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "404": {
            description: "Reserved username not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Reserved username not found." },
              },
            },
          },
          "409": {
            description: "Target username is already reserved",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Target username is already reserved." },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
      delete: {
        tags: ["Admin"],
        summary: "Remove a reserved username",
        operationId: "adminDeleteReservedUsername",
        security: [{ accessToken: [] }],
        parameters: [
          { name: "username", in: "path", required: true, description: "Reserved username to remove.", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Reserved username removed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusMessage" },
                example: { status: "success", message: "Reserved username removed." },
              },
            },
          },
          "401": { $ref: "#/components/responses/UnauthorizedError" },
          "403": { $ref: "#/components/responses/ForbiddenError" },
          "404": {
            description: "Reserved username not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
                example: { status: "error", message: "Reserved username not found." },
              },
            },
          },
          "500": { $ref: "#/components/responses/ServerError" },
        },
      },
    },
  },
};

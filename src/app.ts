import express from "express";
import { router } from "./routes";
import { openApiSpec } from "./docs/openapi";
import SwaggerUi from "swagger-ui-express";
import path from "path";


const app = express();

app.set('trust proxy', true);

// Lightweight cookie parser: populates req.cookies from the Cookie header.
// Avoids an extra dependency while making req.cookies available to all routes.
app.use((req, _res, next) => {
  const header = req.headers.cookie;
  const cookies: Record<string, string> = {};
  if (header) {
    header.split(";").forEach((pair) => {
      const idx = pair.indexOf("=");
      if (idx > -1) {
        const key = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (key) cookies[key] = decodeURIComponent(value);
      }
    });
  }
  (req as any).cookies = cookies;
  next();
});

app.get("/api", (_req, res) => res.json({ status: "ok", message: "Welcome to the authentication API" }));

app.get("/api/docs.json", (_req, res) => res.json(openApiSpec));

// 1. Serve the static files from the 'frontend' directory
// Since app.ts is in /src, we go up one level to find /frontend
app.use("/front", express.static(path.join(__dirname, "../frontend")));

// 2. Redirect root '/frontend' to the login page
app.get("/front", (_req, res) => {
  res.redirect("/front/login.html");
});

// 3. Post-login dashboards. main.js redirects here after authentication;
//    assets are referenced with absolute /front/* paths inside these files.
app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dashboard.html"));
});
app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/admin.html"));
});


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", router);
app.use("/api/docs", SwaggerUi.serve, SwaggerUi.setup(openApiSpec));




export default app;
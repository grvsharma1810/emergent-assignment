require("dotenv/config");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { WorkOS } = require("@workos-inc/node");
const { PrismaClient } = require("./generated/prisma");

// Environment variables
const CLIENT_ID = process.env.WORKOS_CLIENT_ID || "";
const API_KEY = process.env.WORKOS_API_KEY || "";
const WORKOS_COOKIE_PASSWORD = process.env.WORKOS_COOKIE_PASSWORD || "";

// URLs
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const prisma = new PrismaClient();
const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(cookieParser());
app.use(express.json());

const workos = new WorkOS(API_KEY, {
  clientId: CLIENT_ID,
});

async function withAuth(req, res, next) {
  // Check for sealed session in Authorization header (for CLI) or cookie (for web)
  const authHeader = req.headers["authorization"];
  let sessionData;
  let isCli = false;

  console.log("[withAuth] Authorization header:", authHeader);

  if (authHeader && authHeader.startsWith("Bearer ")) {
    // CLI authentication with sealed session token
    sessionData = authHeader.replace("Bearer ", "");
    isCli = true;
    console.log("[withAuth] CLI request detected. Using Authorization header.");
  } else {
    // Web authentication with cookie
    sessionData = req.cookies["wos-session"];
    console.log("[withAuth] Web request detected. Using wos-session cookie.");
  }

  if (!sessionData) {
    console.warn("[withAuth] No session data found.");
    if (isCli) {
      return res.status(401).json({ error: "No authorization token provided" });
    }
    return res.redirect("/login");
  }

  console.log("[withAuth] Loading sealed session...");
  const session = workos.userManagement.loadSealedSession({
    sessionData,
    cookiePassword: WORKOS_COOKIE_PASSWORD,
  });

  try {
    const { authenticated, reason, user } = await session.authenticate();
    console.log(`[withAuth] Session authenticated: ${authenticated}`, reason);

    if (authenticated) {
      // Store session and user in request for use in route handlers
      req.session = session;
      req.user = user;
      console.log(`[withAuth] User stored in request: ${user?.id}`);
      return next();
    }

    // Session not authenticated, attempt to refresh for both CLI and web
    console.log("[withAuth] Attempting to refresh session...");
    const {
      authenticated: refreshed,
      sealedSession,
      user: refreshedUser,
    } = await session.refresh();

    if (!refreshed) {
      console.warn("[withAuth] Session refresh failed.");
      if (isCli) {
        return res
          .status(401)
          .json({ error: "Session expired. Please login again.", reason });
      }
      return res.redirect("/login");
    }

    console.log(
      `[withAuth] Session refreshed successfully for user: ${refreshedUser?.id}`
    );

    // Store refreshed session and user in request
    req.session = session;
    req.user = refreshedUser;

    if (isCli) {
      // For CLI, send new sealed session token in response header
      res.setHeader("X-New-Session-Token", sealedSession);
      console.log(
        "[withAuth] New session token set in X-New-Session-Token header"
      );
      return next();
    } else {
      // For web, update the cookie
      res.cookie("wos-session", sealedSession, {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      });

      // Redirect to the same route to ensure the updated cookie is used
      console.log("[withAuth] Session refreshed. Redirecting to original URL.");
      return res.redirect(req.originalUrl);
    }
  } catch (e) {
    // Failed to refresh access token, redirect user to login page
    // after deleting the cookie
    console.error("[withAuth] Error during authentication or refresh:", e);
    res.clearCookie("wos-session");
    res.redirect("/login");
  }
}

// This `/login` endpoint should be registered as the login endpoint
// on the "Redirects" page of the WorkOS Dashboard.
app.get("/login", (req, res) => {
  const authorizationUrl = workos.userManagement.getAuthorizationUrl({
    // Specify that we'd like AuthKit to handle the authentication flow
    provider: "authkit",

    // The callback endpoint that WorkOS will redirect to after a user authenticates
    redirectUri: `${BACKEND_URL}/callback`,
    clientId: CLIENT_ID,
  });

  // Redirect the user to the AuthKit sign-in page
  res.redirect(authorizationUrl);
});

app.get("/callback", async (req, res) => {
  // The authorization code returned by AuthKit
  const code = req.query.code;

  console.log("[/callback] Received callback with code:", code);

  if (!code) {
    console.error("[/callback] No code provided in query params");
    return res.status(400).send("No code provided");
  }

  try {
    console.log("[/callback] Authenticating with WorkOS...");
    const authenticateResponse =
      await workos.userManagement.authenticateWithCode({
        clientId: CLIENT_ID,
        code,
        session: {
          sealSession: true,
          cookiePassword: WORKOS_COOKIE_PASSWORD,
        },
      });

    const { user, sealedSession } = authenticateResponse;

    console.log("[/callback] Authentication successful for user:", user?.id);

    // Store the session in a cookie
    res.cookie("wos-session", sealedSession, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });

    // Use the information in `user` for further business logic.

    // Redirect the user to the homepage
    console.log("[/callback] Redirecting user to frontend dashboard");
    return res.redirect(`${FRONTEND_URL}/dashboard`);
  } catch (error) {
    console.error("[/callback] Authentication failed:", error);
    return res.redirect("/login");
  }
});

app.get("/logout", withAuth, async (req, res) => {
  const session = req.session;

  const url = await session.getLogoutUrl();

  console.log("[/logout] Logging out user and redirecting to:", url);

  res.clearCookie("wos-session");
  res.redirect(url);
});

app.get("/user", withAuth, async (req, res) => {
  // User is already authenticated and stored in req.user by withAuth middleware
  const user = req.user;

  console.log(`[/user] User ${user.firstName} is logged in`);

  res.json({ user });
});

// GET favorite color - authenticated endpoint
app.get("/favorite-color", withAuth, async (req, res) => {
  try {
    // User is already authenticated and stored in req.user by withAuth middleware
    const user = req.user;

    // Find or create user in database
    let dbUser = await prisma.user.findUnique({
      where: { workosId: user.id },
    });

    if (!dbUser) {
      // Create user if doesn't exist
      dbUser = await prisma.user.create({
        data: {
          workosId: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      });
    }

    res.json({ favoriteColor: dbUser.favoriteColor });
  } catch (error) {
    console.error("[/favorite-color GET] Error:", error);
    res.status(500).json({ error: "Failed to fetch favorite color" });
  }
});

// POST favorite color - authenticated endpoint
app.post("/favorite-color", withAuth, async (req, res) => {
  try {
    // User is already authenticated and stored in req.user by withAuth middleware
    const user = req.user;
    const { favoriteColor } = req.body;

    if (!favoriteColor || typeof favoriteColor !== "string") {
      return res.status(400).json({ error: "favoriteColor is required" });
    }

    // Upsert user with favorite color
    const dbUser = await prisma.user.upsert({
      where: { workosId: user.id },
      update: {
        favoriteColor,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      create: {
        workosId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        favoriteColor,
      },
    });

    res.json({ favoriteColor: dbUser.favoriteColor });
  } catch (error) {
    console.error("[/favorite-color POST] Error:", error);
    res.status(500).json({ error: "Failed to update favorite color" });
  }
});

// CLI Authentication - Exchange refresh token for sealed session
app.post("/cli/auth/session", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "refreshToken is required" });
    }

    console.log("[/cli/auth/session] Authenticating with refresh token...");

    // Authenticate with refresh token and seal the session
    const {
      sealedSession,
      user,
      refreshToken: newRefreshToken,
    } = await workos.userManagement.authenticateWithRefreshToken({
      clientId: CLIENT_ID,
      refreshToken,
      session: {
        sealSession: true,
        cookiePassword: WORKOS_COOKIE_PASSWORD,
      },
    });

    console.log(
      "[/cli/auth/session] Session sealed successfully for user:",
      user?.id
    );

    res.json({
      sessionToken: sealedSession,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error) {
    console.error("[/cli/auth/session] Error:", error);
    res.status(401).json({ error: "Failed to create session" });
  }
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

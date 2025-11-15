require("dotenv/config");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { WorkOS } = require("@workos-inc/node");
const { PrismaClient } = require("./generated/prisma");

const CLIENT_ID = "client_01KA32XKNNQ65WTEB00XYTZG8W";
const API_KEY =
  "sk_test_a2V5XzAxS0EzMlhLMUFTSFlOMjRTRVA4Wlk2OE04LHhLMG9IckdzZ1FHUFlyQVdPemF1ZHBOODM";
const WORKOS_COOKIE_PASSWORD = "1Oj0cO7NKnEDom664iXm8IvGWqWbAm4T";

const prisma = new PrismaClient();
const app = express();

// CORS configuration
app.use(
  cors({
    origin: true, // Allow all origins
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(cookieParser());

const workos = new WorkOS(API_KEY, {
  clientId: CLIENT_ID,
});

async function withAuth(req, res, next) {
  const session = workos.userManagement.loadSealedSession({
    sessionData: req.cookies["wos-session"],
    cookiePassword: WORKOS_COOKIE_PASSWORD,
  });

  const { authenticated, reason } = await session.authenticate();

  if (authenticated) {
    return next();
  }

  // If the cookie is missing, redirect to login
  if (!authenticated && reason === "no_session_cookie_provided") {
    return res.redirect("/login");
  }

  // If the session is invalid, attempt to refresh
  try {
    const { authenticated, sealedSession } = await session.refresh();

    if (!authenticated) {
      return res.redirect("/login");
    }

    // update the cookie
    res.cookie("wos-session", sealedSession, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });

    // Redirect to the same route to ensure the updated cookie is used
    return res.redirect(req.originalUrl);
  } catch (e) {
    // Failed to refresh access token, redirect user to login page
    // after deleting the cookie
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
    redirectUri: "http://localhost:3000/callback",
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
    console.log("[/callback] Redirecting user to /");
    return res.redirect("http://localhost:5173/dashboard");
  } catch (error) {
    console.error("[/callback] Authentication failed:", error);
    return res.redirect("/login");
  }
});

app.get("/logout", async (req, res) => {
  const session = workos.userManagement.loadSealedSession({
    sessionData: req.cookies["wos-session"],
    cookiePassword: WORKOS_COOKIE_PASSWORD,
  });

  const url = await session.getLogoutUrl();

  res.clearCookie("wos-session");
  res.redirect(url);
});

app.get("/user", withAuth, async (req, res) => {
  const session = workos.userManagement.loadSealedSession({
    sessionData: req.cookies["wos-session"],
    cookiePassword: WORKOS_COOKIE_PASSWORD,
  });

  const { user } = await session.authenticate();

  console.log(`User ${user.firstName} is logged in`);

  // ... render dashboard page

  res.json({ user });
});

// GET favorite color - authenticated endpoint
app.get("/favorite-color", withAuth, async (req, res) => {
  try {
    const session = workos.userManagement.loadSealedSession({
      sessionData: req.cookies["wos-session"],
      cookiePassword: WORKOS_COOKIE_PASSWORD,
    });

    const { user } = await session.authenticate();

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
app.post("/favorite-color", withAuth, express.json(), async (req, res) => {
  try {
    const session = workos.userManagement.loadSealedSession({
      sessionData: req.cookies["wos-session"],
      cookiePassword: WORKOS_COOKIE_PASSWORD,
    });

    const { user } = await session.authenticate();
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

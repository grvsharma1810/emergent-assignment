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

// Store for device authorization codes (in production, use Redis or database)
const deviceCodes = new Map();

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
app.use(express.json());

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

// ========================================
// CLI Authentication Endpoints
// ========================================

// Helper function to generate random codes
function generateCode(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper function to generate secure token
function generateToken() {
  return require("crypto").randomBytes(32).toString("hex");
}

// Middleware to verify CLI bearer token
async function withCliAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "No authentication token provided"
    });
  }

  const token = authHeader.substring(7);

  // Find device code with this token and check expiration
  let userWorkosId = null;
  let isExpired = false;

  for (const [deviceCode, data] of deviceCodes.entries()) {
    if (data.token === token && data.status === "authorized") {
      // Check if token expired
      if (data.expiresAt && Date.now() > data.expiresAt) {
        isExpired = true;
        deviceCodes.delete(deviceCode); // Clean up expired token
        break;
      }

      userWorkosId = data.workosId;
      break;
    }
  }

  if (isExpired) {
    return res.status(401).json({
      error: "Token expired",
      message: "Your session has expired. Please run 'pulse login' again."
    });
  }

  if (!userWorkosId) {
    return res.status(401).json({
      error: "Invalid token",
      message: "Invalid or expired token. Please run 'pulse login' again."
    });
  }

  req.userWorkosId = userWorkosId;
  next();
}

// Initiate device authorization
app.post("/cli/auth/device", (req, res) => {
  const deviceCode = generateCode(32);
  const userCode = generateCode(6);
  const verificationUrl = `http://localhost:3000/cli/auth/verify`; // No user code in URL!

  deviceCodes.set(deviceCode, {
    userCode,
    deviceCode,
    status: "pending",
    createdAt: Date.now(),
  });

  // Clean up expired codes (older than 10 minutes)
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [code, data] of deviceCodes.entries()) {
    if (data.createdAt < tenMinutesAgo) {
      deviceCodes.delete(code);
    }
  }

  res.json({
    deviceCode,
    userCode,
    verificationUrl,
    expiresIn: 600, // 10 minutes
    interval: 5, // Poll every 5 seconds
  });
});

// Verification page for CLI auth - Shows form to enter code
app.get("/cli/auth/verify", (req, res) => {
  // Show a page where user manually enters the code
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Verify Your Device - Pulse CLI</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
          }
          .container {
            background: white;
            padding: 3rem;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 500px;
            width: 100%;
            text-align: center;
          }
          .logo {
            font-size: 3rem;
            margin-bottom: 1rem;
          }
          h1 {
            color: #333;
            margin-bottom: 1rem;
            font-size: 1.8rem;
          }
          .subtitle {
            color: #666;
            margin-bottom: 2rem;
            line-height: 1.6;
          }
          .code-input {
            width: 100%;
            padding: 1rem;
            font-size: 1.5rem;
            text-align: center;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5rem;
            font-weight: bold;
            margin-bottom: 1.5rem;
            transition: border-color 0.3s;
          }
          .code-input:focus {
            outline: none;
            border-color: #667eea;
          }
          .submit-btn {
            width: 100%;
            padding: 1rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .submit-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
          }
          .submit-btn:active {
            transform: translateY(0);
          }
          .submit-btn:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
          }
          .error {
            color: #e74c3c;
            margin-top: 1rem;
            display: none;
          }
          .error.show {
            display: block;
          }
          .instructions {
            background: #f8f9fa;
            padding: 1.5rem;
            border-radius: 8px;
            margin-bottom: 2rem;
            text-align: left;
          }
          .instructions h3 {
            color: #333;
            font-size: 1rem;
            margin-bottom: 0.5rem;
          }
          .instructions ol {
            margin-left: 1.5rem;
            color: #666;
            line-height: 1.8;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">🔐</div>
          <h1>Authorize Pulse CLI</h1>
          <p class="subtitle">
            To continue, please enter the verification code displayed in your terminal.
          </p>

          <div class="instructions">
            <h3>📋 Instructions:</h3>
            <ol>
              <li>Look at your terminal window</li>
              <li>Find the 6-character code</li>
              <li>Enter it below</li>
              <li>Click "Continue to Sign In"</li>
            </ol>
          </div>

          <form id="verifyForm">
            <input
              type="text"
              id="userCode"
              class="code-input"
              placeholder="XXXXXX"
              maxlength="6"
              pattern="[A-Z0-9]{6}"
              required
              autocomplete="off"
              autofocus
            />
            <button type="submit" class="submit-btn" id="submitBtn">
              Continue to Sign In →
            </button>
            <div class="error" id="error">Invalid code. Please check your terminal and try again.</div>
          </form>
        </div>

        <script>
          const form = document.getElementById('verifyForm');
          const input = document.getElementById('userCode');
          const submitBtn = document.getElementById('submitBtn');
          const error = document.getElementById('error');

          // Auto-uppercase and format input
          input.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            error.classList.remove('show');
          });

          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userCode = input.value.trim();

            if (userCode.length !== 6) {
              error.textContent = 'Code must be exactly 6 characters';
              error.classList.add('show');
              return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Verifying...';

            try {
              // Verify the code exists
              const response = await fetch('/cli/auth/verify-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userCode })
              });

              if (!response.ok) {
                throw new Error('Invalid code');
              }

              // Code is valid, redirect to WorkOS auth
              window.location.href = '/cli/auth/start-auth?user_code=' + userCode;
            } catch (err) {
              error.textContent = 'Invalid code. Please check your terminal and try again.';
              error.classList.add('show');
              submitBtn.disabled = false;
              submitBtn.textContent = 'Continue to Sign In →';
            }
          });
        </script>
      </body>
    </html>
  `);
});

// Verify that user code exists and is valid
app.post("/cli/auth/verify-code", express.json(), (req, res) => {
  const { userCode } = req.body;

  if (!userCode) {
    return res.status(400).json({ error: "Missing userCode" });
  }

  // Check if this user code exists and is pending
  let isValid = false;
  for (const [deviceCode, data] of deviceCodes.entries()) {
    if (data.userCode === userCode && data.status === "pending") {
      isValid = true;
      break;
    }
  }

  if (!isValid) {
    return res.status(400).json({ error: "Invalid or expired code" });
  }

  res.json({ valid: true });
});

// Start the WorkOS authentication flow after code verification
app.get("/cli/auth/start-auth", (req, res) => {
  const userCode = req.query.user_code;

  if (!userCode) {
    return res.status(400).send("Missing user_code parameter");
  }

  // Verify code still exists
  let isValid = false;
  for (const [deviceCode, data] of deviceCodes.entries()) {
    if (data.userCode === userCode && data.status === "pending") {
      isValid = true;
      break;
    }
  }

  if (!isValid) {
    return res.status(400).send("Invalid or expired code");
  }

  // Redirect to WorkOS login with state containing user code
  const authorizationUrl = workos.userManagement.getAuthorizationUrl({
    provider: "authkit",
    redirectUri: "http://localhost:3000/cli/auth/callback",
    clientId: CLIENT_ID,
    state: userCode,
  });

  res.redirect(authorizationUrl);
});

// CLI auth callback
app.get("/cli/auth/callback", async (req, res) => {
  const code = req.query.code;
  const userCode = req.query.state;

  console.log("[/cli/auth/callback] Received callback with code:", code);
  console.log("[/cli/auth/callback] User code:", userCode);

  if (!code || !userCode) {
    console.error("[/cli/auth/callback] Missing code or user_code");
    return res.status(400).send("Missing required parameters");
  }

  try {
    // Authenticate with WorkOS
    console.log("[/cli/auth/callback] Authenticating with WorkOS...");
    const authenticateResponse =
      await workos.userManagement.authenticateWithCode({
        clientId: CLIENT_ID,
        code,
      });

    const { user } = authenticateResponse;
    console.log("[/cli/auth/callback] Authentication successful for user:", user?.id);

    // Find the device code with this user code
    let foundDeviceCode = null;
    for (const [deviceCode, data] of deviceCodes.entries()) {
      if (data.userCode === userCode && data.status === "pending") {
        foundDeviceCode = deviceCode;
        break;
      }
    }

    if (!foundDeviceCode) {
      console.error("[/cli/auth/callback] Device code not found for user code:", userCode);
      return res.status(400).send("Invalid or expired user code");
    }

    // Generate access token and update device code status
    const token = generateToken();
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days from now

    const deviceData = deviceCodes.get(foundDeviceCode);
    deviceData.status = "authorized";
    deviceData.token = token;
    deviceData.workosId = user.id;
    deviceData.expiresAt = expiresAt; // Add expiration timestamp
    deviceCodes.set(foundDeviceCode, deviceData);

    console.log("[/cli/auth/callback] Device authorized successfully");

    // Show success page
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Successful</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 3rem;
              border-radius: 12px;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
              text-align: center;
              max-width: 500px;
            }
            h1 {
              color: #667eea;
              margin-bottom: 1rem;
            }
            p {
              color: #666;
              line-height: 1.6;
            }
            .success-icon {
              font-size: 4rem;
              margin-bottom: 1rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">✓</div>
            <h1>Authentication Successful!</h1>
            <p>You have successfully authenticated Pulse CLI.</p>
            <p><strong>You can now close this window and return to your terminal.</strong></p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("[/cli/auth/callback] Authentication failed:", error);
    res.status(500).send("Authentication failed");
  }
});

// Poll for token
app.post("/cli/auth/token", express.json(), (req, res) => {
  const { deviceCode } = req.body;

  if (!deviceCode) {
    return res.status(400).json({ error: "Missing deviceCode" });
  }

  const deviceData = deviceCodes.get(deviceCode);

  if (!deviceData) {
    return res.status(400).json({ error: "Invalid device code" });
  }

  if (deviceData.status === "pending") {
    return res.status(428).json({ error: "Authorization pending" });
  }

  if (deviceData.status === "authorized") {
    return res.json({
      token: deviceData.token,
      expiresAt: deviceData.expiresAt
    });
  }

  return res.status(400).json({ error: "Invalid device code status" });
});

// Validate CLI token
app.get("/cli/auth/validate", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ valid: false, error: "No token provided" });
  }

  const token = authHeader.substring(7);

  // Check if token exists and is valid
  let isValid = false;
  let userWorkosId = null;
  let expiresAt = null;

  for (const [deviceCode, data] of deviceCodes.entries()) {
    if (data.token === token && data.status === "authorized") {
      // Check if token expired
      if (data.expiresAt && Date.now() > data.expiresAt) {
        // Token expired, clean it up
        deviceCodes.delete(deviceCode);
        return res.status(401).json({
          valid: false,
          error: "Token expired",
          message: "Your session has expired. Please run 'pulse login' again."
        });
      }

      isValid = true;
      userWorkosId = data.workosId;
      expiresAt = data.expiresAt;
      break;
    }
  }

  if (!isValid) {
    return res.status(401).json({ valid: false, error: "Invalid or expired token" });
  }

  // Check if user still exists in database
  try {
    const user = await prisma.user.findUnique({
      where: { workosId: userWorkosId },
    });

    if (!user) {
      return res.status(401).json({ valid: false, error: "User not found" });
    }

    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;
    const daysUntilExpiry = Math.floor(timeUntilExpiry / (24 * 60 * 60 * 1000));

    res.json({
      valid: true,
      userId: userWorkosId,
      email: user.email,
      firstName: user.firstName,
      expiresAt: expiresAt,
      expiresIn: timeUntilExpiry,
      expiresInDays: daysUntilExpiry
    });
  } catch (error) {
    console.error("[/cli/auth/validate] Error:", error);
    res.status(500).json({ valid: false, error: "Validation failed" });
  }
});

// CLI Get favorite color
app.get("/cli/favorite-color", withCliAuth, async (req, res) => {
  try {
    const workosId = req.userWorkosId;

    // Find or create user in database
    let dbUser = await prisma.user.findUnique({
      where: { workosId },
    });

    if (!dbUser) {
      return res.json({ favoriteColor: null });
    }

    res.json({ favoriteColor: dbUser.favoriteColor });
  } catch (error) {
    console.error("[/cli/favorite-color GET] Error:", error);
    res.status(500).json({ error: "Failed to fetch favorite color" });
  }
});

// CLI Set favorite color
app.post("/cli/favorite-color", withCliAuth, express.json(), async (req, res) => {
  try {
    const workosId = req.userWorkosId;
    const { favoriteColor } = req.body;

    if (!favoriteColor || typeof favoriteColor !== "string") {
      return res.status(400).json({ error: "favoriteColor is required" });
    }

    // Find user first to get email
    const existingUser = await prisma.user.findUnique({
      where: { workosId },
    });

    if (!existingUser) {
      return res.status(404).json({ error: "User not found. Please authenticate via web first." });
    }

    // Update user with favorite color
    const dbUser = await prisma.user.update({
      where: { workosId },
      data: { favoriteColor },
    });

    res.json({ favoriteColor: dbUser.favoriteColor });
  } catch (error) {
    console.error("[/cli/favorite-color POST] Error:", error);
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

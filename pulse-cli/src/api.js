const axios = require("axios");
const { BACKEND_URL, WORKOS_CLIENT_ID, getSessionToken } = require("./config");

// Create axios instance with default config
const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 30000,
});

// Add session token to requests
api.interceptors.request.use((config) => {
  const token = getSessionToken();
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// Handle token refresh from response headers
api.interceptors.response.use(
  (response) => {
    // Check if server sent a new session token (after refresh)
    const newToken = response.headers['x-new-session-token'];
    if (newToken) {
      console.log('[API] Received refreshed session token, updating local config...');
      const { saveSessionToken } = require('./config');
      saveSessionToken(newToken);
    }
    return response;
  },
  (error) => {
    // Pass through errors
    return Promise.reject(error);
  }
);

// Initiate device authorization directly with WorkOS
async function initiateDeviceAuth() {
  try {
    const response = await fetch(
      "https://api.workos.com/user_management/authorize/device",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: WORKOS_CLIENT_ID,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.message || "Failed to initiate device authorization"
      );
    }

    const data = await response.json();

    // Transform to match expected format
    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUrl: data.verification_uri,
      verificationUrlComplete: data.verification_uri_complete,
      expiresIn: data.expires_in,
      interval: data.interval,
    };
  } catch (error) {
    throw new Error(error.message || "Failed to initiate device authorization");
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Poll for device authorization completion using WorkOS recommended approach
async function pollForToken({ deviceCode, expiresIn = 300, interval = 5 }) {
  console.log("[pollForToken] Start polling for deviceCode:", deviceCode);
  const timeout = AbortSignal.timeout(expiresIn * 1000);
  let currentInterval = interval;

  while (true) {
    console.log(`[pollForToken] Polling with interval: ${currentInterval}s`);
    const response = await (async () => {
      try {
        return await fetch(
          "https://api.workos.com/user_management/authenticate",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:device_code",
              device_code: deviceCode,
              client_id: WORKOS_CLIENT_ID,
            }),
            signal: timeout,
          }
        );
      } catch (error) {
        console.error("[pollForToken] Fetch error:", error);
        if (error.name === "TimeoutError") {
          throw new Error("Authorization timed out");
        }
        throw error;
      }
    })();

    const data = await response.json();
    console.log("[pollForToken] Response data:", data);

    if (response.ok) {
      // Success! Return tokens for further processing.
      console.log("[pollForToken] Authorization successful");
      return data;
    }

    switch (data.error) {
      case "authorization_pending":
        console.log("[pollForToken] Authorization pending, waiting...");
        // Wait before polling again
        await sleep(currentInterval * 1000);
        break;

      case "slow_down":
        // Increase the interval by 1 second when this happens
        currentInterval += 1;
        console.log(
          "[pollForToken] Slow down requested, increasing interval to",
          currentInterval
        );
        await sleep(currentInterval * 1000);
        break;

      // Terminal cases
      case "access_denied":
      case "expired_token":
        console.error("[pollForToken] Terminal error:", data.error);
        throw new Error("Authorization failed: " + data.error);

      default:
        console.error("[pollForToken] Unknown error:", data.error);
        throw new Error(
          "Authorization failed: " + (data.error || "Unknown error")
        );
    }
  }
}

// Exchange tokens for sealed session (authenticated endpoint)
async function exchangeForSession(tokensFromWorkOS) {
  try {
    const response = await fetch(`${BACKEND_URL}/cli/auth/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokensFromWorkOS.access_token}`, // Authenticate the request
      },
      body: JSON.stringify({
        refreshToken: tokensFromWorkOS.refresh_token // Use to create sealed session
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to exchange token for session");
    }

    return await response.json();
  } catch (error) {
    throw new Error(error.message || "Failed to exchange token for session");
  }
}

// Get favorite color
async function getFavoriteColor() {
  try {
    const response = await api.get("/favorite-color");
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Not authenticated. Please run "pulse login" first.');
    }
    throw new Error(
      error.response?.data?.error || "Failed to get favorite color"
    );
  }
}

// Set favorite color
async function setFavoriteColor(color) {
  try {
    const response = await api.post("/favorite-color", {
      favoriteColor: color,
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Not authenticated. Please run "pulse login" first.');
    }
    throw new Error(
      error.response?.data?.error || "Failed to set favorite color"
    );
  }
}

// Validate session with server
async function validateSession() {
  try {
    const url = `${BACKEND_URL}/user`;
    console.log(`[validateSession] Making GET request to: ${url}`);
    const response = await api.get("/user");
    return {
      valid: true,
      ...response.data,
    };
  } catch (error) {
    if (error.response?.status === 401) {
      return {
        valid: false,
        error: error.response?.data?.error || "Token invalid or expired",
        message: error.response?.data?.message,
      };
    }
    throw new Error("Failed to validate session");
  }
}

module.exports = {
  initiateDeviceAuth,
  pollForToken,
  exchangeForSession,
  getFavoriteColor,
  setFavoriteColor,
  validateSession,
};

const os = require("os");
const path = require("path");
const fs = require("fs");

const CONFIG_DIR = path.join(os.homedir(), ".pulse");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const BACKEND_URL = process.env.PULSE_BACKEND_URL || 'http://localhost:3000';
const WORKOS_CLIENT_ID =
  process.env.WORKOS_CLIENT_ID || "";

// Ensure config directory exists
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// Read config
function readConfig() {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    return {};
  }

  try {
    const data = fs.readFileSync(CONFIG_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading config:", error.message);
    return {};
  }
}

// Write config
function writeConfig(config) {
  ensureConfigDir();

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
  } catch (error) {
    console.error("Error writing config:", error.message);
    throw error;
  }
}

// Get session token
function getSessionToken() {
  const config = readConfig();
  return config.sessionToken || null;
}

// Save session token
function saveSessionToken(token) {
  const config = readConfig();
  config.sessionToken = token;
  writeConfig(config);
}

// Clear session
function clearSession() {
  const config = readConfig();
  delete config.sessionToken;
  writeConfig(config);
}

// Check if logged in (synchronous - just checks local state)
// For actual validation, use validateSession() from api.js
function isLoggedIn() {
  const token = getSessionToken();
  return !!token;
}

module.exports = {
  BACKEND_URL,
  CONFIG_FILE,
  WORKOS_CLIENT_ID,
  getSessionToken,
  saveSessionToken,
  clearSession,
  isLoggedIn,
  readConfig,
  writeConfig,
};

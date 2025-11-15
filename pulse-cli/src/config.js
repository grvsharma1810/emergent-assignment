const os = require('os');
const path = require('path');
const fs = require('fs');

const CONFIG_DIR = path.join(os.homedir(), '.pulse');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const BACKEND_URL = process.env.PULSE_BACKEND_URL || 'http://localhost:3000';

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
    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading config:', error.message);
    return {};
  }
}

// Write config
function writeConfig(config) {
  ensureConfigDir();

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing config:', error.message);
    throw error;
  }
}

// Get session token
function getSessionToken() {
  const config = readConfig();
  return config.sessionToken || null;
}

// Save session token with expiration
function saveSessionToken(token, expiresAt) {
  const config = readConfig();
  config.sessionToken = token;
  config.expiresAt = expiresAt;
  writeConfig(config);
}

// Clear session
function clearSession() {
  const config = readConfig();
  delete config.sessionToken;
  delete config.expiresAt;
  writeConfig(config);
}

// Check if token expired locally (quick check before API call)
function isTokenExpiredLocally() {
  const config = readConfig();

  if (!config.expiresAt) {
    return false; // No expiration set (old tokens)
  }

  return Date.now() > config.expiresAt;
}

// Get token expiration info
function getTokenExpiration() {
  const config = readConfig();
  return config.expiresAt || null;
}

// Check if logged in (synchronous - just checks local state)
// For actual validation, use validateSession() from api.js
function isLoggedIn() {
  const token = getSessionToken();

  if (!token) {
    return false;
  }

  // Quick local check to avoid unnecessary API calls
  if (isTokenExpiredLocally()) {
    clearSession();
    return false;
  }

  return true;
}

module.exports = {
  BACKEND_URL,
  CONFIG_FILE,
  getSessionToken,
  saveSessionToken,
  clearSession,
  isLoggedIn,
  isTokenExpiredLocally,
  getTokenExpiration,
  readConfig,
  writeConfig,
};

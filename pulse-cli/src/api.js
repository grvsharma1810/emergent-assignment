const axios = require('axios');
const { BACKEND_URL, getSessionToken } = require('./config');

// Create axios instance with default config
const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 30000,
});

// Add session token to requests
api.interceptors.request.use((config) => {
  const token = getSessionToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Initiate device authorization
async function initiateDeviceAuth() {
  try {
    const response = await api.post('/cli/auth/device');
    return response.data;
  } catch (error) {
    throw new Error(
      error.response?.data?.error || 'Failed to initiate device authorization'
    );
  }
}

// Poll for device authorization completion
async function pollForToken(deviceCode) {
  try {
    const response = await api.post('/cli/auth/token', {
      deviceCode,
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 428) {
      // Authorization pending
      return { pending: true };
    }
    throw new Error(
      error.response?.data?.error || 'Failed to get authorization token'
    );
  }
}

// Get favorite color
async function getFavoriteColor() {
  try {
    const response = await api.get('/cli/favorite-color');
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Not authenticated. Please run "pulse login" first.');
    }
    throw new Error(
      error.response?.data?.error || 'Failed to get favorite color'
    );
  }
}

// Set favorite color
async function setFavoriteColor(color) {
  try {
    const response = await api.post('/cli/favorite-color', {
      favoriteColor: color,
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('Not authenticated. Please run "pulse login" first.');
    }
    throw new Error(
      error.response?.data?.error || 'Failed to set favorite color'
    );
  }
}

// Validate session with server
async function validateSession() {
  try {
    const response = await api.get('/cli/auth/validate');
    return {
      valid: true,
      ...response.data
    };
  } catch (error) {
    if (error.response?.status === 401) {
      return {
        valid: false,
        error: error.response?.data?.error || 'Token invalid or expired',
        message: error.response?.data?.message
      };
    }
    throw new Error('Failed to validate session');
  }
}

module.exports = {
  initiateDeviceAuth,
  pollForToken,
  getFavoriteColor,
  setFavoriteColor,
  validateSession,
};

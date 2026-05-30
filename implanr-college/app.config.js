/**
 * app.config.js - Dynamic Expo configuration
 * 
 * Patches Node's module resolution so @expo/config-plugins is always
 * resolvable. When the real module can't be found in node_modules, it
 * falls back to a local shim that provides minimal implementations.
 */
const path = require('path');
const Module = require('module');

const SHIM_PATH = path.join(__dirname, '_expo_config_plugins_shim.js');

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === '@expo/config-plugins') {
    // Strategy 1: Normal resolution
    try {
      return originalResolveFilename.call(this, request, parent, isMain, options);
    } catch (_) {}

    // Strategy 2: Explicit paths in project node_modules
    var projectRoot = __dirname;
    var fallbacks = [
      path.join(projectRoot, 'node_modules', '@expo', 'config-plugins'),
      path.join(projectRoot, 'node_modules', 'expo', 'node_modules', '@expo', 'config-plugins'),
    ];
    for (var i = 0; i < fallbacks.length; i++) {
      try {
        return originalResolveFilename.call(this, fallbacks[i], parent, isMain, options);
      } catch (_) {}
    }

    // Strategy 3: Try process.cwd() based resolution
    try {
      var cwdPath = path.join(process.cwd(), 'node_modules', '@expo', 'config-plugins');
      return originalResolveFilename.call(this, cwdPath, parent, isMain, options);
    } catch (_) {}

    // Strategy 4: Local shim file (always available, included in deployment zip)
    return SHIM_PATH;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

module.exports = ({ config }) => {
  // In deployed environment, Emergent sets REACT_APP_BACKEND_URL to the production URL.
  // In preview, only EXPO_PUBLIC_BACKEND_URL is available.
  const backendUrl = process.env.REACT_APP_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL || '';

  return {
    ...config,
    extra: {
      ...(config.extra || {}),
      backendUrl,
    },
  };
};

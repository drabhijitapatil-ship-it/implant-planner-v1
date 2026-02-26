/**
 * app.config.js - Dynamic Expo configuration
 * 
 * Patches Node's module resolution so @expo/config-plugins is always
 * resolvable, even when npm doesn't hoist it to the top-level node_modules
 * in the EAS build environment.
 */
const path = require('path');
const Module = require('module');

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === '@expo/config-plugins') {
    try {
      return originalResolveFilename.call(this, request, parent, isMain, options);
    } catch (e) {
      const projectRoot = __dirname;
      const fallbacks = [
        path.join(projectRoot, 'node_modules', '@expo', 'config-plugins'),
        path.join(projectRoot, 'node_modules', 'expo', 'node_modules', '@expo', 'config-plugins'),
      ];
      for (const loc of fallbacks) {
        try {
          return originalResolveFilename.call(this, loc, parent, isMain, options);
        } catch (_) {}
      }
      throw e;
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

module.exports = ({ config }) => {
  return config;
};

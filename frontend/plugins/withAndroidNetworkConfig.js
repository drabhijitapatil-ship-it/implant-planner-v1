const { withAndroidManifest } = require('@expo/config-plugins');

const withAndroidNetworkConfig = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application?.[0];
    if (mainApplication) {
      mainApplication.$['android:usesCleartextTraffic'] = 'true';
    }
    return config;
  });
};

module.exports = withAndroidNetworkConfig;

/**
 * Local shim for @expo/config-plugins
 * 
 * Provides minimal implementations of config plugin helpers needed by
 * the withAndroidNetworkConfig plugin. Used as a last-resort fallback
 * when the real @expo/config-plugins module cannot be found during
 * EAS builds.
 */

function withMod(config, opts) {
  var mods = Object.assign({}, config.mods);
  var platformMods = Object.assign({}, mods[opts.platform]);
  platformMods[opts.mod] = opts.action;
  mods[opts.platform] = platformMods;
  return Object.assign({}, config, { mods: mods });
}

function createWithMod(platform, mod) {
  return function (config, action) {
    return withMod(config, { platform: platform, mod: mod, action: action });
  };
}

exports.withMod = withMod;
exports.withAndroidManifest = createWithMod('android', 'manifest');
exports.withAndroidStyles = createWithMod('android', 'styles');
exports.withAndroidColors = createWithMod('android', 'colors');
exports.withAndroidColorsNight = createWithMod('android', 'colorsNight');
exports.withStringsXml = createWithMod('android', 'strings');
exports.withMainActivity = createWithMod('android', 'mainActivity');
exports.withMainApplication = createWithMod('android', 'mainApplication');
exports.withAppBuildGradle = createWithMod('android', 'appBuildGradle');
exports.withProjectBuildGradle = createWithMod('android', 'projectBuildGradle');
exports.withSettingsGradle = createWithMod('android', 'settingsGradle');
exports.withGradleProperties = createWithMod('android', 'gradleProperties');
exports.withInfoPlist = createWithMod('ios', 'infoPlist');
exports.withEntitlementsPlist = createWithMod('ios', 'entitlements');
exports.withExpoPlist = createWithMod('ios', 'expoPlist');
exports.withXcodeProject = createWithMod('ios', 'xcodeProject');
exports.withPodfile = createWithMod('ios', 'podfile');
exports.withPodfileProperties = createWithMod('ios', 'podfileProperties');
exports.withAppDelegate = createWithMod('ios', 'appDelegate');
exports.withDangerousMod = function (config, props) {
  return withMod(config, { platform: props[0], mod: 'dangerous', action: props[1] });
};
exports.withPlugins = function (config, plugins) { return config; };
exports.withRunOnce = function (config, props) { return config; };
exports.withStaticPlugin = function (config, props) { return config; };
exports.withBaseMod = function (config, props) { return config; };
exports.withDefaultBaseMods = function (config) { return config; };
exports.withFinalizedMod = function (config, props) { return config; };
exports.AndroidConfig = {};
exports.IOSConfig = {};
exports.XML = {};
exports.History = {};
exports.WarningAggregator = { addWarningAndroid: function(){}, addWarningIOS: function(){} };

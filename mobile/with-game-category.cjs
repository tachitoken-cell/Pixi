const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = config => withAndroidManifest(config, config => {
  // Android 16 large screens honor a game's requested landscape orientation.
  AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults).$['android:appCategory'] = 'game';
  return config;
});

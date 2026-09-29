const { withAndroidManifest } = require('expo/config-plugins');

module.exports = config => withAndroidManifest(config, value => {
  const manifest = value.modResults.manifest;
  const queries = manifest.queries || (manifest.queries = []);
  const target = queries[0] || (queries[0] = {});
  const packages = target.package || (target.package = []);
  for (const name of ['io.metamask', 'app.phantom', 'com.okx.wallet', 'com.okinc.okex.gp', 'com.wallet.crypto.trustapp', 'com.debank.rabbymobile']) {
    if (!packages.some(entry => entry.$?.['android:name'] === name)) packages.push({ $: { 'android:name': name } });
  }
  return value;
});

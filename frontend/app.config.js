// Satu sumber kebenaran versi: extra.appVersion diturunkan dari expo.version,
// jadi mustahil keduanya tidak sinkron. Naikkan versi cukup di app.json.
export default ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra ?? {}),
    appVersion: config.version,
  },
});

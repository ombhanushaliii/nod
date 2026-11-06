// Extends app.json. google-services.json is kept out of git, so EAS cloud
// builds get it from the EAS secret file GOOGLE_SERVICES_JSON; local builds
// keep using ./google-services.json.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
});

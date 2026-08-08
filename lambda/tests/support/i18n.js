/**
 * Builds a `requestAttributes.t` function identical to the one the real
 * LocalizationInterceptor installs (same i18next + sprintf post-processor, same
 * prompt files). Tests assert on real user-facing strings rather than on stubs,
 * so a prompt whose placeholders stop matching its call sites fails here.
 */
const i18n = require("i18next");
const sprintf = require("i18next-sprintf-postprocessor");
const languageStrings = require("../../languageStrings");

const createTranslate = (locale = "en-US") => {
  const client = i18n.createInstance().use(sprintf);
  client.init({
    lng: locale,
    resources: languageStrings,
    returnObjects: true,
    // i18next treats "." as the key separator (needed for nested keys such as
    // "widgets.nextPrayerTime.title") and ":" as the namespace separator. We keep
    // "." enabled to match production, but disable ":" so values like "20:00"
    // passed as keys aren't mangled.
    nsSeparator: false,
  });

  return (...args) =>
    client.t(args[0], {
      returnObjects: true,
      postProcess: "sprintf",
      sprintf: args.slice(1),
    });
};

module.exports = { createTranslate };

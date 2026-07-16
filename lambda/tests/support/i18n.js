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
    // i18next treats "." and ":" as key/namespace separators; prompt keys are
    // flat, and disabling them keeps values such as "20:00" from being mangled.
    keySeparator: false,
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

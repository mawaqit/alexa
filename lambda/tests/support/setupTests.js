/**
 * The Lambda logs verbosely on every code path, which drowns out test output.
 * Set VERBOSE_LOGS=1 to see it when debugging a failure.
 */
if (!process.env.VERBOSE_LOGS) {
  global.console.log = jest.fn();
  global.console.error = jest.fn();
  global.console.warn = jest.fn();
}

/**
 * Both services log verbosely on every code path, which drowns out test output.
 * Set VERBOSE_LOGS=1 to see it when debugging a failure.
 *
 * The two halves need silencing differently: `lambda` writes through the global
 * console, while `azan-lambda` uses Powertools, which bypasses it and reads its
 * level from LOG_LEVEL when the logger is constructed.
 */
if (!process.env.VERBOSE_LOGS) {
  global.console.log = jest.fn();
  global.console.error = jest.fn();
  global.console.warn = jest.fn();

  process.env.LOG_LEVEL = "SILENT";
}

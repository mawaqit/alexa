import { Logger } from "@aws-lambda-powertools/logger";

/**
 * The service's single logger.
 *
 * Why a logger and not `console.log`: concurrent invocations share one
 * CloudWatch log stream, so a bare message like "Getting user info" cannot be
 * traced back to the request that produced it. Powertools stamps every line
 * with the Lambda request id (once {@link withLambdaContext} has run), plus the
 * cold-start flag and function metadata — and emits JSON, which makes the
 * result queryable in CloudWatch Logs Insights instead of grep-able by eye.
 *
 * Verbosity is controlled by the `LOG_LEVEL` environment variable
 * (`DEBUG` | `INFO` | `WARN` | `ERROR` | `SILENT`), defaulting to `INFO`.
 *
 * Structured data goes in the second argument, never interpolated into the
 * message — that is what makes a field filterable:
 *
 * ```ts
 * logger.info("User updated", { userId });   // ✅ filterable on userId
 * logger.info(`User ${userId} updated`);     // ❌ opaque string
 * ```
 */
export const logger = new Logger({
  serviceName: "mawaqit-alexa-azan",
});

/**
 * Attaches the Lambda invocation context so every subsequent line carries the
 * request id. Call once, at the top of the handler.
 *
 * The context is optional in our handler signature (tests invoke without one),
 * so this is a no-op when it is absent rather than a failure.
 */
export function withLambdaContext(context: unknown): void {
  if (context && typeof context === "object" && "awsRequestId" in context) {
    logger.addContext(context as Parameters<typeof logger.addContext>[0]);
  }
}

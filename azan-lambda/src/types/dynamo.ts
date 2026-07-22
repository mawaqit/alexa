/**
 * Persistence shapes for the two DynamoDB tables this service touches.
 *
 * Both tables are schemaless and written by more than one Lambda, which is why
 * the record types carry an index signature: we model the attributes this
 * service reads or writes, and let the rest through untyped-but-constrained.
 */

/**
 * Anything the DynamoDB document client can marshal into an attribute.
 *
 * The SDK's own `NativeAttributeValue` widens to `any`, which would let an
 * unchecked value flow straight into a write. This is the same set, closed.
 */
export type AttributeValue =
  | string
  | number
  | boolean
  | null
  | AttributeValue[]
  | { [key: string]: AttributeValue };

/**
 * A row of the Azan table.
 *
 * Also written by the main skill backend, so a real row carries attributes
 * this service does not model.
 */
export interface AzanUserRecord {
  /** The Amazon `user_id`, e.g. `amzn1.account.XXXX`. */
  id: string;
  /** Stored snake_case, matching what the main backend expects to read. */
  refresh_token?: string;
  endpointId?: string;
  createdTimestamp?: string;
  updatedTimestamp?: string;
  [attribute: string]: AttributeValue | undefined;
}

/** A row of the persistence table, queried through the `mosqueId` index. */
export interface MosqueSubscriberRecord {
  id: string;
  mosqueId?: string;
  [attribute: string]: AttributeValue | undefined;
}

/**
 * Attributes to write in `updateAzanUserInfo`.
 *
 * `refreshToken` and `endpointId` are named because they are renamed on the way
 * in; anything else is written under its own key.
 */
export interface AzanUserUpdate {
  // `| undefined` is explicit: callers pass `undefined` to mean "leave this
  // attribute alone", and the implementation skips it rather than writing it.
  refreshToken?: string | null | undefined;
  endpointId?: string | null | undefined;
  [attribute: string]: AttributeValue | undefined;
}

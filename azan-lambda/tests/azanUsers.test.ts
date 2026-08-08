/**
 * The Azan table is written from two Lambdas at once (this dispatcher and the
 * main skill backend), so every write is a single atomic UpdateExpression
 * rather than a read-modify-write. These tests pin the generated expression:
 * a regression there silently wipes a field instead of failing loudly.
 *
 * The table names and the region are read from process.env at *module load*,
 * hence the assignments before the imports below.
 */

process.env.TARGET_DYNAMO_REGION = "eu-west-3";
process.env.AZAN_DYNAMO_DB_TABLE = "azan-users-test";

/** The subset of a DynamoDB reply the code under test reads. */
interface CommandOutput {
  Item?: Record<string, unknown>;
  Items?: Record<string, unknown>[];
  Attributes?: Record<string, unknown>;
  LastEvaluatedKey?: Record<string, unknown>;
}

/** Stands in for an SDK command — all the assertions care about is `input`. */
interface CapturedCommand {
  input: Record<string, unknown>;
}

const mockSend = jest.fn() as jest.MockedFunction<
  (command: CapturedCommand) => Promise<CommandOutput>
>;
// A plain array, not a jest.fn: the client is constructed once at module load,
// and clearAllMocks() would erase that record before any test could read it.
const mockClientConfigs: unknown[] = [];

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class DynamoDBClient {
    constructor(config: unknown) {
      mockClientConfigs.push(config);
    }
  },
}));

jest.mock("@aws-sdk/lib-dynamodb", () => {
  /** Stand-in for the SDK command objects — keeps the params for assertions. */
  class FakeCommand {
    constructor(public input: Record<string, unknown>) {}
  }
  return {
    DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
    GetCommand: class GetCommand extends FakeCommand {},
    QueryCommand: class QueryCommand extends FakeCommand {},
    UpdateCommand: class UpdateCommand extends FakeCommand {},
  };
});

// Imported last on purpose: TypeScript keeps top-level statements in source
// order, so the env vars above and the mock state below must both be in place
// before azanUsers is loaded — it reads them at module load.
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";

import { updateAzanUserInfo } from "../src/services/azanUsers";

/** Shape of the params handed to an UpdateCommand. */
interface UpdateInput {
  TableName: string;
  Key: Record<string, unknown>;
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
  ReturnValues: string;
}

const NOW = "2026-07-22T10:00:00.000Z";

/** The command instance handed to dynamo.send() on the nth call. */
const sentCommand = (call = 0): CapturedCommand => {
  const command = mockSend.mock.calls[call]?.[0];
  if (!command) throw new Error(`dynamo.send() was not called ${call + 1}x`);
  return command;
};

/** Its params, read back as whichever command shape the test expects. */
const sentInput = <T>(call = 0): T => sentCommand(call).input as T;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ doNotFake: ["nextTick"] }).setSystemTime(new Date(NOW));
});

afterEach(() => {
  jest.useRealTimers();
});

describe("client configuration", () => {
  it("pins the client to the Paris region", () => {
    // Data lives in eu-west-3 while this Lambda runs in eu-west-1; without an
    // explicit region the SDK defaults to the compute region and every call
    // fails with ResourceNotFound.
    expect(mockClientConfigs).toEqual([{ region: "eu-west-3" }]);
  });
});

describe("updateAzanUserInfo", () => {
  beforeEach(() => {
    mockSend.mockResolvedValue({ Attributes: { id: "user-1" } });
  });

  it("upserts timestamps only, when no attribute is supplied", async () => {
    const attributes = await updateAzanUserInfo("user-1", {});

    expect(attributes).toEqual({ id: "user-1" });
    expect(sentCommand()).toBeInstanceOf(UpdateCommand);
    expect(sentCommand().input).toEqual({
      TableName: "azan-users-test",
      Key: { id: "user-1" },
      UpdateExpression:
        "SET #updatedTimestamp = :updatedTimestamp, #createdTimestamp = if_not_exists(#createdTimestamp, :createdTimestamp)",
      ExpressionAttributeNames: {
        "#updatedTimestamp": "updatedTimestamp",
        "#createdTimestamp": "createdTimestamp",
      },
      ExpressionAttributeValues: {
        ":updatedTimestamp": NOW,
        ":createdTimestamp": NOW,
      },
      ReturnValues: "ALL_NEW",
    });
  });

  it("stores the refresh token under its snake_case attribute name", async () => {
    await updateAzanUserInfo("user-1", { refreshToken: "rt" });

    const {
      UpdateExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
    } = sentInput<UpdateInput>();
    expect(UpdateExpression).toContain("#refresh_token = :refresh_token");
    expect(ExpressionAttributeNames["#refresh_token"]).toBe("refresh_token");
    expect(ExpressionAttributeValues[":refresh_token"]).toBe("rt");
  });

  it("stores the endpointId", async () => {
    await updateAzanUserInfo("user-1", { endpointId: "e-1" });

    const { UpdateExpression, ExpressionAttributeValues } =
      sentInput<UpdateInput>();
    expect(UpdateExpression).toContain("#endpointId = :endpointId");
    expect(ExpressionAttributeValues[":endpointId"]).toBe("e-1");
  });

  it("passes arbitrary extra attributes through as prefixed placeholders", async () => {
    await updateAzanUserInfo("user-1", { mosqueId: "m-1", enabled: true });

    const {
      UpdateExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
    } = sentInput<UpdateInput>();
    expect(UpdateExpression).toContain("#attr_mosqueId = :val_mosqueId");
    expect(UpdateExpression).toContain("#attr_enabled = :val_enabled");
    expect(ExpressionAttributeNames).toMatchObject({
      "#attr_mosqueId": "mosqueId",
      "#attr_enabled": "enabled",
    });
    expect(ExpressionAttributeValues).toMatchObject({
      ":val_mosqueId": "m-1",
      ":val_enabled": true,
    });
  });

  it("never lets a caller-supplied timestamp collide with the managed ones", async () => {
    // Both names are already in the SET clause; emitting them twice makes
    // DynamoDB reject the whole update.
    await updateAzanUserInfo("user-1", {
      updatedTimestamp: "nope",
      createdTimestamp: "nope",
    });

    const { UpdateExpression, ExpressionAttributeValues } =
      sentInput<UpdateInput>();
    expect(UpdateExpression).not.toContain("#attr_updatedTimestamp");
    expect(UpdateExpression).not.toContain("#attr_createdTimestamp");
    expect(ExpressionAttributeValues[":updatedTimestamp"]).toBe(NOW);
  });

  it("skips a null or undefined refreshToken instead of writing it", async () => {
    await updateAzanUserInfo("user-1", {
      refreshToken: null,
      endpointId: undefined,
    });

    const { UpdateExpression } = sentInput<UpdateInput>();
    expect(UpdateExpression).not.toContain("refresh_token");
    expect(UpdateExpression).not.toContain("endpointId");
  });

  it("skips an extra attribute whose value is undefined", async () => {
    // DynamoDB has no `undefined`: naming the placeholder without supplying a
    // value makes the SDK reject the entire update.
    await updateAzanUserInfo("user-1", { mosqueId: undefined, enabled: false });

    const { UpdateExpression, ExpressionAttributeValues } =
      sentInput<UpdateInput>();
    expect(UpdateExpression).not.toContain("mosqueId");
    expect(UpdateExpression).toContain("#attr_enabled = :val_enabled");
    expect(ExpressionAttributeValues).not.toHaveProperty(":val_mosqueId");
  });

  it("writes an explicit null, which DynamoDB stores as the NULL type", async () => {
    await updateAzanUserInfo("user-1", { mosqueId: null });

    const { UpdateExpression, ExpressionAttributeValues } =
      sentInput<UpdateInput>();
    expect(UpdateExpression).toContain("#attr_mosqueId = :val_mosqueId");
    expect(ExpressionAttributeValues[":val_mosqueId"]).toBeNull();
  });

  it("propagates an update failure", async () => {
    mockSend.mockRejectedValue(new Error("ConditionalCheckFailed"));

    await expect(
      updateAzanUserInfo("user-1", { endpointId: "e-1" }),
    ).rejects.toThrow("ConditionalCheckFailed");
  });
});

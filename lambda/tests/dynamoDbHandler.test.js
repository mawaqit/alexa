/**
 * GetPersistenceUserByUserId is the bridge the companion website uses to go
 * from an LWA account id (all a website login has) to the Alexa-linked
 * persistence row (keyed by the Alexa skill's own user id) via the
 * userId-index GSI. That GSI is a manual DynamoDB step, not something this
 * repo's IaC creates — this test only pins the query shape (index name,
 * partition key expression, table) against a mocked client.
 */
const mockSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class DynamoDBClient {},
}));

jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
  GetCommand: class GetCommand {
    constructor(input) {
      this.input = input;
    }
  },
  PutCommand: class PutCommand {
    constructor(input) {
      this.input = input;
    }
  },
  DeleteCommand: class DeleteCommand {
    constructor(input) {
      this.input = input;
    }
  },
  QueryCommand: class QueryCommand {
    constructor(input) {
      this.input = input;
    }
  },
  BatchGetCommand: class BatchGetCommand {
    constructor(input) {
      this.input = input;
    }
  },
  UpdateCommand: class UpdateCommand {
    constructor(input) {
      this.input = input;
    }
  },
}));

process.env.PERSISTENCE_ADAPTER_TABLE_NAME = "mawaqit-alexa-user-data-dev";
process.env.AZAN_DYNAMO_DB_TABLE = "mawaqit-alexa-azan-users-data-dev";

const dbHandler = require("../handlers/dynamoDbHandler.js");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GetPersistenceUserByUserId", () => {
  it("queries the userId-index GSI on the persistence table by the LWA user id", async () => {
    mockSend.mockResolvedValue({
      Items: [{ id: "amzn1.ask.account.EXAMPLE" }],
    });

    await dbHandler.GetPersistenceUserByUserId("amzn1.account.EXAMPLE");

    const command = mockSend.mock.calls[0][0];
    expect(command.input).toEqual({
      TableName: "mawaqit-alexa-user-data-dev",
      IndexName: "userId-index",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": "amzn1.account.EXAMPLE" },
    });
  });

  it("returns the single matching item", async () => {
    const item = {
      id: "amzn1.ask.account.EXAMPLE",
      userId: "amzn1.account.EXAMPLE",
    };
    mockSend.mockResolvedValue({ Items: [item] });

    const result = await dbHandler.GetPersistenceUserByUserId(
      "amzn1.account.EXAMPLE",
    );

    expect(result).toEqual(item);
  });

  it("returns null when the Alexa skill isn't linked to this LWA id yet", async () => {
    mockSend.mockResolvedValue({ Items: [] });

    const result = await dbHandler.GetPersistenceUserByUserId(
      "amzn1.account.UNLINKED",
    );

    expect(result).toBeNull();
  });
});

describe("UpdateAzanUserAttributesAtomic", () => {
  it("builds a single UpdateExpression rather than a read-then-PutCommand — this table is written concurrently by other Lambdas, so a read-modify-write would lose one writer's update", async () => {
    mockSend.mockResolvedValue({ Attributes: {} });

    await dbHandler.UpdateAzanUserAttributesAtomic("amzn1.account.EXAMPLE", {
      pendingMosqueSelection: { uuid: "mosque-uuid" },
      pendingTimezone: "Europe/Paris",
    });

    // Only one DynamoDB call total — no preceding GetCommand.
    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.input.Key).toEqual({ id: "amzn1.account.EXAMPLE" });
    expect(command.input.UpdateExpression).toContain(
      "#attr_pendingMosqueSelection = :val_pendingMosqueSelection",
    );
    expect(command.input.UpdateExpression).toContain(
      "#attr_pendingTimezone = :val_pendingTimezone",
    );
    expect(
      command.input.ExpressionAttributeValues[":val_pendingMosqueSelection"],
    ).toEqual({
      uuid: "mosque-uuid",
    });
    expect(
      command.input.ExpressionAttributeValues[":val_pendingTimezone"],
    ).toBe("Europe/Paris");
  });

  it("writes null (not undefined) to actually clear a field", async () => {
    mockSend.mockResolvedValue({ Attributes: {} });

    await dbHandler.UpdateAzanUserAttributesAtomic("amzn1.account.EXAMPLE", {
      pendingMosqueSelection: null,
    });

    const command = mockSend.mock.calls[0][0];
    expect(
      command.input.ExpressionAttributeValues[":val_pendingMosqueSelection"],
    ).toBeNull();
  });

  it("skips undefined attributes entirely rather than sending them to DynamoDB, which rejects an explicit undefined value", async () => {
    mockSend.mockResolvedValue({ Attributes: {} });

    await dbHandler.UpdateAzanUserAttributesAtomic("amzn1.account.EXAMPLE", {
      pendingTimezone: undefined,
    });

    const command = mockSend.mock.calls[0][0];
    expect(command.input.UpdateExpression).not.toContain("pendingTimezone");
  });

  it("sets createdTimestamp only if it doesn't already exist, via if_not_exists", async () => {
    mockSend.mockResolvedValue({ Attributes: {} });

    await dbHandler.UpdateAzanUserAttributesAtomic("amzn1.account.EXAMPLE", {});

    const command = mockSend.mock.calls[0][0];
    expect(command.input.UpdateExpression).toContain(
      "#createdTimestamp = if_not_exists(#createdTimestamp, :createdTimestamp)",
    );
  });
});

describe("GetPersistenceUserById", () => {
  it("gets by the plain partition key, not the userId-index GSI", async () => {
    mockSend.mockResolvedValue({ Item: { id: "amzn1.ask.account.EXAMPLE" } });

    await dbHandler.GetPersistenceUserById("amzn1.ask.account.EXAMPLE");

    const command = mockSend.mock.calls[0][0];
    expect(command.input).toEqual({
      TableName: "mawaqit-alexa-user-data-dev",
      Key: { id: "amzn1.ask.account.EXAMPLE" },
      // applyPendingWebConfig treats this as the freshest available copy of
      // `attributes` before a full-replace write — a default eventually
      // consistent read could hand back a snapshot that predates another
      // recent save (see webConfigHandler.js).
      ConsistentRead: true,
    });
  });

  it("returns null (not undefined) when the row doesn't exist yet — a brand-new user's very first request", async () => {
    mockSend.mockResolvedValue({});

    const result = await dbHandler.GetPersistenceUserById(
      "amzn1.ask.account.NEW",
    );

    expect(result).toBeNull();
  });
});

describe("UpdateAzanUserInfo", () => {
  it("preserves fields this call doesn't know about — a full PutCommand built from scratch would silently drop pendingMosqueSelection the website already staged", async () => {
    // GetAzanUserInfo (the internal existence check)
    mockSend.mockResolvedValueOnce({
      Item: {
        id: "amzn1.account.EXAMPLE",
        refresh_token: "old-token",
        pendingMosqueSelection: { uuid: "mosque-uuid" },
        createdTimestamp: "2026-01-01T00:00:00.000Z",
      },
    });
    // The PutCommand itself
    mockSend.mockResolvedValueOnce({});

    await dbHandler.UpdateAzanUserInfo("amzn1.account.EXAMPLE", {
      refreshToken: "new-token",
    });

    const putCommand = mockSend.mock.calls[1][0];
    expect(putCommand.input.Item.pendingMosqueSelection).toEqual({
      uuid: "mosque-uuid",
    });
    expect(putCommand.input.Item.refresh_token).toBe("new-token");
    expect(putCommand.input.Item.createdTimestamp).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });
});

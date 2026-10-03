/**
 * The Azan table decides who gets the adhan pushed to their devices. Three
 * failures matter here, each of which is silent in production:
 *
 * - A whole-item Put racing azan-lambda's Discover wiped `endpointId`, leaving
 *   a linked user who never hears the adhan. Writes must be a single
 *   UpdateExpression that touches only what was passed.
 * - The row is keyed by the Amazon account id, not the Alexa user id, so
 *   deletion depends on the mapping persisted at account linking.
 * - Dev and prod share a skill id, so SkillDisabled can reach either stage's
 *   Lambda while the data sits in the other. Deletion must sweep both, or the
 *   adhan keeps arriving after the user disabled the skill.
 */
process.env.AZAN_DYNAMO_DB_TABLE = "azan-users-test";

const mockSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class DynamoDBClient {},
}));
jest.mock("@aws-sdk/lib-dynamodb", () => {
  class FakeCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    GetCommand: class GetCommand extends FakeCommand {},
    PutCommand: class PutCommand extends FakeCommand {},
    UpdateCommand: class UpdateCommand extends FakeCommand {},
    DeleteCommand: class DeleteCommand extends FakeCommand {},
    QueryCommand: class QueryCommand extends FakeCommand {},
    BatchGetCommand: class BatchGetCommand extends FakeCommand {},
  };
});
jest.mock("axios");

const axios = require("axios");
const { UpdateAzanUserInfo } = require("../handlers/dynamoDbHandler.js");
const { AuthHandler } = require("../handlers/authHandler.js");
const { SkillEventHandler } = require("../handlers/skillEventHandler.js");
const { buildHandlerInput } = require("./support/handlerInput");

const ALEXA_ID = "user-1"; // what buildHandlerInput puts in the envelope
const AMAZON_ID = "amzn1.account.ABCDEF";

const TABLES = {
  devPersistence: "mawaqit-alexa-user-data-dev",
  prodPersistence: "mawaqit-alexa-user-data-prod",
  devAzan: "mawaqit-alexa-azan-users-data-dev",
  prodAzan: "mawaqit-alexa-azan-users-data-prod",
};

const sentCommands = () => mockSend.mock.calls.map(([command]) => command);
const deletes = () =>
  sentCommands()
    .filter((command) => command.constructor.name === "DeleteCommand")
    .map(({ input }) => [input.TableName, input.Key.id]);

/**
 * Stands in for DynamoDB: `rows` maps a table name to the persistence item a
 * Get returns, `failing` lists tables whose every call rejects.
 */
const fakeDynamo = ({ rows = {}, failing = {} } = {}) => {
  mockSend.mockImplementation(async ({ input }) => {
    if (failing[input.TableName]) throw failing[input.TableName];
    return { Item: rows[input.TableName], Attributes: {} };
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  fakeDynamo();
});

describe("UpdateAzanUserInfo", () => {
  it("writes with a single UpdateCommand, never a read-then-Put", async () => {
    await UpdateAzanUserInfo(AMAZON_ID, { refreshToken: "rt" });

    const commands = sentCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0].constructor.name).toBe("UpdateCommand");
  });

  it("leaves endpointId alone when only the refresh token is passed", async () => {
    // The exact write that used to erase Discover's endpointId.
    await UpdateAzanUserInfo(AMAZON_ID, { refreshToken: "rt" });

    const { input } = sentCommands()[0];
    expect(input.Key).toEqual({ id: AMAZON_ID });
    expect(input.UpdateExpression).toContain("#refresh_token = :refresh_token");
    expect(input.UpdateExpression).not.toContain("endpointId");
    expect(input.ExpressionAttributeValues[":refresh_token"]).toBe("rt");
  });

  it("keeps the original createdTimestamp on an existing row", async () => {
    await UpdateAzanUserInfo(AMAZON_ID, { refreshToken: "rt" });

    expect(sentCommands()[0].input.UpdateExpression).toContain(
      "if_not_exists(#createdTimestamp, :createdTimestamp)",
    );
  });

  it("skips undefined attributes, which DynamoDB would reject", async () => {
    await UpdateAzanUserInfo(AMAZON_ID, {
      refreshToken: "rt",
      extra: undefined,
    });

    expect(sentCommands()[0].input.UpdateExpression).not.toContain("extra");
  });
});

describe("account linking (Alexa.Authorization.Grant)", () => {
  it("persists the Amazon account id, so a later SkillDisabled can find the azan row", async () => {
    axios.request
      .mockResolvedValueOnce({
        data: { access_token: "at", refresh_token: "rt" },
      })
      .mockResolvedValueOnce({ data: { user_id: AMAZON_ID } });
    const handlerInput = buildHandlerInput({
      requestType: "Alexa.Authorization.Grant",
    });
    handlerInput.requestEnvelope.request.body = { grant: { code: "c" } };

    await AuthHandler.handle(handlerInput);

    expect(handlerInput._getPersistentAttributes().user_id).toBe(AMAZON_ID);
    expect(handlerInput._savePersistentAttributes).toHaveBeenCalled();
  });
});

describe("disabling the skill", () => {
  const buildDisabledInput = ({ persistentAttributes, accessToken } = {}) => {
    const handlerInput = buildHandlerInput({
      requestType: "AlexaSkillEvent.SkillDisabled",
      persistentAttributes,
      accessToken: accessToken ?? null,
    });
    handlerInput.attributesManager.deletePersistentAttributes = jest.fn(
      async () => {},
    );
    return handlerInput;
  };

  it("deletes from both stages even when the data is only in the other stage", async () => {
    // Event reached this Lambda, but the user's record is in prod's table.
    fakeDynamo({
      rows: {
        [TABLES.prodPersistence]: { attributes: { user_id: AMAZON_ID } },
      },
    });

    await SkillEventHandler.handle(buildDisabledInput());

    expect(deletes()).toEqual(
      expect.arrayContaining([
        [TABLES.devAzan, AMAZON_ID],
        [TABLES.prodAzan, AMAZON_ID],
        [TABLES.devPersistence, ALEXA_ID],
        [TABLES.prodPersistence, ALEXA_ID],
      ]),
    );
  });

  it("deletes each Amazon id found, when the stages disagree", async () => {
    fakeDynamo({
      rows: {
        [TABLES.devPersistence]: {
          attributes: { user_id: "amzn1.account.DEV" },
        },
        [TABLES.prodPersistence]: { userId: "amzn1.account.PROD" },
      },
    });

    await SkillEventHandler.handle(buildDisabledInput());

    const azanIds = deletes()
      .filter(([table]) => table.includes("azan"))
      .map(([, id]) => id);
    expect(new Set(azanIds)).toEqual(
      new Set(["amzn1.account.DEV", "amzn1.account.PROD"]),
    );
  });

  it("falls back to the linked access token when no id was persisted", async () => {
    axios.request.mockResolvedValueOnce({ data: { user_id: AMAZON_ID } });

    await SkillEventHandler.handle(
      buildDisabledInput({ accessToken: "token" }),
    );

    expect(deletes()).toContainEqual([TABLES.prodAzan, AMAZON_ID]);
  });

  it("never deletes from the azan table by the Alexa user id", async () => {
    // No mapping anywhere: that key matches no azan row, so nothing is sent.
    await SkillEventHandler.handle(buildDisabledInput());

    expect(deletes().filter(([table]) => table.includes("azan"))).toEqual([]);
  });

  it("still cleans prod when dev's tables are unreachable", async () => {
    fakeDynamo({
      rows: {
        [TABLES.prodPersistence]: { attributes: { user_id: AMAZON_ID } },
      },
      failing: {
        [TABLES.devPersistence]: new Error("dev down"),
        [TABLES.devAzan]: new Error("dev down"),
      },
    });
    const handlerInput = buildDisabledInput();

    await SkillEventHandler.handle(handlerInput);

    expect(deletes()).toEqual(
      expect.arrayContaining([
        [TABLES.prodAzan, AMAZON_ID],
        [TABLES.prodPersistence, ALEXA_ID],
      ]),
    );
    expect(
      handlerInput.attributesManager.deletePersistentAttributes,
    ).toHaveBeenCalled();
  });
});

describe('"delete my data" across stages', () => {
  const { DeleteDataIntentHandler } = require("../handlers/intentHandler.js");

  const buildConfirmedInput = () => {
    const handlerInput = buildHandlerInput({
      intentName: "DeleteDataIntent",
      confirmationStatus: "CONFIRMED",
      persistentAttributes: { user_id: AMAZON_ID },
    });
    handlerInput.attributesManager.deletePersistentAttributes = jest.fn(
      async () => {},
    );
    return handlerInput;
  };

  it("treats a stage with no table as nothing to delete, not a failure", async () => {
    const missing = Object.assign(new Error("no table"), {
      name: "ResourceNotFoundException",
    });
    fakeDynamo({
      failing: { [TABLES.devAzan]: missing, [TABLES.devPersistence]: missing },
    });

    const response = await DeleteDataIntentHandler.handle(
      buildConfirmedInput(),
    );

    expect(response.outputSpeech.ssml).toContain("successfully deleted");
  });

  it("reports failure if any stage genuinely failed, after trying every stage", async () => {
    fakeDynamo({ failing: { [TABLES.devAzan]: new Error("throttled") } });

    const response = await DeleteDataIntentHandler.handle(
      buildConfirmedInput(),
    );

    expect(response.outputSpeech.ssml).not.toContain("successfully deleted");
    // Prod was still cleaned despite dev failing.
    expect(deletes()).toContainEqual([TABLES.prodAzan, AMAZON_ID]);
  });
});

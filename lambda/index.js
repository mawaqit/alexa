const Alexa = require("ask-sdk-core");
const AWS = require("aws-sdk");
const { CustomDynamoDbPersistenceAdapter } = require("./util/CustomDynamoDbPersistenceAdapter.js");
const {
  LocalizationInterceptor,
  LogRequestInterceptor,
  LogResponseInterceptor,
  SavePersistenceAttributesToSession,
  AddDirectiveResponseInterceptor,
  SetApiKeysAsEnvironmentVariableFromAwsSsm,
  ResponseTimeCalculationInterceptor
} = require("./interceptors.js");
const helperFunctions = require("./helperFunctions.js");
const { SkillEventHandler } = require("./handlers/skillEventHandler.js");
const {
  SelectMosqueIntentAfterSelectingMosqueHandler,
  SelectMosqueIntentStartedHandler,
  NextPrayerTimeIntentHandler,
  NextIqamaTimeIntentHandler,
  PlayAdhanIntentHandler,
  NextPrayerTimeIntentWithoutNameHandler,
  MosqueInfoIntentHandler,
  AllIqamaTimeIntentHandler,
  DeleteDataIntentHandler,
  AllPrayerTimeIntentHandler,
  FavoriteAdhaanReciterStartedHandler,
  FavoriteAdhaanReciterIntentHandler,
  HadithIntentHandler,
  PlayAdhanTaskHandler,
  CreateRoutineStartedHandler,
  CreateRoutineIntentHandler,
  SessionResumedRequestHandler,
  YesIntentHandler,
  NoIntentHandler
} = require("./handlers/intentHandler.js");
const {
  MosqueListTouchEventHandler,
  AdhaanRecitationTouchEventHandler,
  RoutineListTouchEventHandler
} = require("./handlers/touchHandler.js");
const {
  AudioPlayerEventHandler,
  PlaybackCommandHandler,
  AudioIntentHandler
} = require("./handlers/audioPlayerHandler.js");
const {
  CFIRWithoutSlotsHandler,
  CFIRSelectMosqueAndFavoriteAdhaanReciterIntentHandler,
  CFIRNextPrayerTimeAndPlayAdhaanIntentHandler
} = require("./handlers/CFIRHandler.js");
const {
  InstallHadithWidgetRequestHandler,
  RemoveHadithWidgetRequestHandler,
  UpdateHadithWidgetRequestHandler,
  WidgetInstallationErrorHandler,
  UpdateHadithAPLEventHandler,
  ReadHadithAPLEventHandler
} = require("./handlers/hadithWidgetHandler.js");
const {
  InstallPrayerTimeWidgetRequestHandler,
  RemovePrayerTimeWidgetRequestHandler,
  UpdatePrayerTimeWidgetRequestHandler,
  UpdatePrayerTimeAPLEventHandler,
  ReadPrayerTimeAPLEventHandler
} = require("./handlers/prayerTimeWidgetHandler.js");
const { AuthHandler } = require("./handlers/authHandler.js");

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return (
      (Alexa.getRequestType(handlerInput.requestEnvelope) === "LaunchRequest" &&
        !handlerInput.requestEnvelope.request.task) ||
      (Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
        Alexa.getIntentName(handlerInput.requestEnvelope) === "LaunchIntent")
    );
  },
  async handle(handlerInput) {
    const { attributesManager } = handlerInput;
    const requestAttributes = attributesManager.getRequestAttributes();
    await helperFunctions
      .callDirectiveService(handlerInput, requestAttributes.t("welcomePrompt"))
      .catch((error) => {
        console.log("Error while calling directive service: ", error);
      });
    return await helperFunctions.checkForPersistenceData(handlerInput);
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.HelpIntent"
    );
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const speakOutput = requestAttributes.t("helpPrompt") + requestAttributes.t("doYouNeedAnythingElsePrompt");
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withShouldEndSession(false)
      .getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      (Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AMAZON.CancelIntent" ||
        Alexa.getIntentName(handlerInput.requestEnvelope) ===
        "AMAZON.StopIntent")
    );
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const speakOutput = requestAttributes.t("stopPrompt");

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withShouldEndSession(true)
      .getResponse();
  },
};
/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet
 * */
const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(handlerInput.requestEnvelope) ===
      "AMAZON.FallbackIntent"
    );
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const speakOutput = requestAttributes.t("fallbackPrompt");

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withShouldEndSession(false)
      .getResponse();
  },
};
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs
 * */
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) ===
      "SessionEndedRequest"
    );
  },
  handle(handlerInput) {
    console.log(
      `~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`
    );
    // Any cleanup logic goes here.
    return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
  },
};
/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents
 * by defining them above, then also adding them to the request handler chain below
 * */
const IntentReflectorHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest"
    );
  },
  handle(handlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const speakOutput = `You just triggered ${intentName}`;

    return (
      handlerInput.responseBuilder
        .speak(speakOutput)
        //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
        .getResponse()
    );
  },
};
/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below
 * */
const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const speakOutput = requestAttributes.t("errorPrompt");
    console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withShouldEndSession(false)
      .getResponse();
  },
};

const ExceptionEncounteredHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === "System.ExceptionEncountered";
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const speakOutput = requestAttributes.t("errorPrompt") || "I'm sorry, I can't understand the command. Please try again.";
    const error = handlerInput.requestEnvelope.request?.error;
    console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .withShouldEndSession(true)
      .getResponse();
  },
};

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom
 * */
exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    CFIRWithoutSlotsHandler,
    CFIRSelectMosqueAndFavoriteAdhaanReciterIntentHandler,
    CFIRNextPrayerTimeAndPlayAdhaanIntentHandler,
    AuthHandler,
    InstallHadithWidgetRequestHandler,
    RemoveHadithWidgetRequestHandler,
    UpdateHadithWidgetRequestHandler,
    WidgetInstallationErrorHandler,
    UpdateHadithAPLEventHandler,
    ReadHadithAPLEventHandler,
    InstallPrayerTimeWidgetRequestHandler,
    RemovePrayerTimeWidgetRequestHandler,
    UpdatePrayerTimeWidgetRequestHandler,
    UpdatePrayerTimeAPLEventHandler,
    ReadPrayerTimeAPLEventHandler,
    LaunchRequestHandler,
    ExceptionEncounteredHandler,
    HelpIntentHandler,
    AudioPlayerEventHandler,
    PlaybackCommandHandler,
    AudioIntentHandler,
    MosqueInfoIntentHandler,
    AllIqamaTimeIntentHandler,
    NextPrayerTimeIntentWithoutNameHandler,
    NextPrayerTimeIntentHandler,
    NextIqamaTimeIntentHandler,
    AllPrayerTimeIntentHandler,
    HadithIntentHandler,
    PlayAdhanIntentHandler,
    PlayAdhanTaskHandler,
    SelectMosqueIntentStartedHandler,
    SelectMosqueIntentAfterSelectingMosqueHandler,
    FavoriteAdhaanReciterStartedHandler,
    FavoriteAdhaanReciterIntentHandler,
    YesIntentHandler,
    NoIntentHandler,
    CreateRoutineStartedHandler,
    CreateRoutineIntentHandler,
    SessionResumedRequestHandler,
    DeleteDataIntentHandler,
    MosqueListTouchEventHandler,
    AdhaanRecitationTouchEventHandler,
    RoutineListTouchEventHandler,
    SkillEventHandler,
    CancelAndStopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler,
    IntentReflectorHandler
  )
  .addRequestInterceptors(
    LogRequestInterceptor,
    LocalizationInterceptor,
    SetApiKeysAsEnvironmentVariableFromAwsSsm,
    SavePersistenceAttributesToSession
  )
  .addResponseInterceptors(
    AddDirectiveResponseInterceptor,
    LogResponseInterceptor,
    ResponseTimeCalculationInterceptor
  )
  .addErrorHandlers(ErrorHandler)
  .withPersistenceAdapter(
    new CustomDynamoDbPersistenceAdapter({
      tableName: process.env.PERSISTENCE_ADAPTER_TABLE_NAME,
      createTable: true,
      dynamoDBClient: new AWS.DynamoDB({
        apiVersion: "latest",
        region: process.env.AWS_REGION,
      }),
    })
  )
  .withCustomUserAgent("sample/hello-world/v1.2")
  .withApiClient(new Alexa.DefaultApiClient())
  .lambda();

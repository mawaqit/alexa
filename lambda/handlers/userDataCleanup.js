const Alexa = require("ask-sdk-core");
const authHandler = require("./authHandler.js");
const {
  DeleteAzanUserInfo,
  DeletePersistedUserInfo,
  GetPersistedAmazonUserIds,
} = require("./dynamoDbHandler.js");

/**
 * Finds every Amazon account id (`amzn1.account.…`) linked to this Alexa user.
 *
 * The Azan table is keyed by the Amazon id, but a skill request carries only
 * the Alexa user id. The mapping is the `user_id` persisted at account linking
 * (AuthHandler) or on a later session — and it may sit in either stage's
 * table, so all of them are searched. The linked access token is the last
 * resort; SkillDisabled usually has none.
 */
async function resolveAmazonUserIds(handlerInput, alexaUserId) {
  const ids = new Set(await GetPersistedAmazonUserIds(alexaUserId));

  // This stage's own record, through the SDK — covers a stage outside the
  // cleanup sweep (e.g. a personal dev stage).
  const persisted =
    (await handlerInput.attributesManager.getPersistentAttributes()) || {};
  if (persisted.user_id) ids.add(persisted.user_id);

  if (ids.size === 0) {
    const accessToken =
      handlerInput.requestEnvelope?.context?.System?.user?.accessToken;
    if (accessToken) {
      const userInfo = await authHandler.getUserInfo(accessToken);
      if (userInfo?.user_id) ids.add(userInfo.user_id);
    }
  }
  return [...ids];
}

/**
 * Deletes everything stored for the requesting user, in every stage: the Azan
 * row(s) — which stop the adhan pushes — and the persistence row.
 *
 * Dev and prod share a skill id, so the event may reach either stage's Lambda
 * while the data lives in the other; sweeping all stages means neither Lambda
 * needs to know which. Azan rows go first: their key is read from the
 * persistence rows deleted after.
 *
 * Attempts every delete before throwing, so one failure never leaves the rest
 * behind. The caller still runs attributesManager.deletePersistentAttributes()
 * to clear this stage's SDK state.
 */
async function deleteUserDataEverywhere(handlerInput) {
  const alexaUserId = Alexa.getUserId(handlerInput.requestEnvelope);
  const amazonUserIds = await resolveAmazonUserIds(handlerInput, alexaUserId);
  if (amazonUserIds.length === 0) {
    console.log("[deleteUserDataEverywhere] No linked Amazon account found");
  }

  const results = await Promise.allSettled([
    ...amazonUserIds.map((id) => DeleteAzanUserInfo(id)),
    DeletePersistedUserInfo(alexaUserId),
  ]);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

module.exports = { deleteUserDataEverywhere };

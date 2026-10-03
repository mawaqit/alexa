const Alexa = require("ask-sdk-core");
const authHandler = require("./authHandler.js");
const {
  DeleteAzanUserInfo,
  DeletePersistedUserInfo,
  GetPersistedAmazonUserIds,
} = require("./dynamoDbHandler.js");

/**
 * Returns distinct Amazon account ids (`amzn1.account.…`) found for this user.
 *
 * The Azan table is keyed by the Amazon id, but a skill request carries only
 * the Alexa user id. The mapping is the `user_id` persisted at account linking
 * (AuthHandler) or on a later session — and it may sit in either stage's
 * table, so all of them are searched. The linked access token is the last
 * resort; SkillDisabled usually has none. Failed cross-stage reads are skipped,
 * but SDK persistence reads and access-token profile failures propagate.
 * Returns an empty array when no mapping or token yields an id.
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
 * Deletes the requesting user's persistence rows and resolved Amazon accounts'
 * Azan rows from the dev and prod tables.
 *
 * Dev and prod share a skill id, so the event may reach either stage's Lambda
 * while the data lives in the other; sweeping all stages means neither Lambda
 * needs to know which. Amazon ids are resolved before any deletion starts;
 * Azan and persistence deletions then run concurrently.
 *
 * Resolution errors propagate before deletion. Once ids are resolved, all
 * deletes settle before the first rejection is rethrown. With no Amazon ids,
 * only persistence rows are deleted. Does not clear the SDK persistence cache
 * or widget data; callers handle those separately.
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

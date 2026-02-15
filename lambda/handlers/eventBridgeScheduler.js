const {
  SchedulerClient,
  GetScheduleCommand,
  CreateScheduleCommand,
  UpdateScheduleCommand,
  ListSchedulesCommand,
  DeleteScheduleCommand,
} = require("@aws-sdk/client-scheduler");

const client = new SchedulerClient({ region: process.env.AWS_REGION });

const scheduleGroupName = "mawaqit-azan-schedule-" + process.env.STAGE;

/**
 * Creates or updates an EventBridge Schedule.
 * @param {Object} params
 * @param {string} params.mosqueId
 * @param {string} params.prayerName
 * @param {string} params.time - Time in HH:mm format (24-hour)
 * @param {string} params.timezone
 * @param {string} params.userId
 */
async function createOrUpdateSchedule({
  mosqueId,
  prayerName,
  time,
  timezone,
}) {
  const scheduleName = `${mosqueId}-${prayerName}`;

  // Parse time for Cron expression
  // Input time: "HH:mm" -> Cron: "mm HH * * ? *" (Daily)
  const [hour, minute] = time.split(":");
  const scheduleExpression = `cron(${minute} ${hour} * * ? *)`;

  // Simplified payload
  const payload = {
    mosqueId,
    prayerName,
  };

  try {
    // No need to check for existing schedule to merge users anymore.
    // Each schedule is unique to a mosque and prayer.

    // Update existing schedule
    // UpdateSchedule needs the full definition
    const updateCommand = new UpdateScheduleCommand({
      Name: scheduleName,
      GroupName: scheduleGroupName,
      ScheduleExpression: scheduleExpression,
      ScheduleExpressionTimezone: timezone,
      FlexibleTimeWindow: { Mode: "OFF" },
      Target: {
        Arn: `arn:aws:lambda:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:function:alexa-${process.env.STAGE}-triggerHandler`,
        RoleArn: process.env.SCHEDULER_ROLE_ARN,
        Input: JSON.stringify(payload),
        RetryPolicy: {
          MaximumEventAgeInSeconds: 900,
          MaximumRetryAttempts: 3,
        },
      },
      State: "ENABLED",
    });

    await client.send(updateCommand);
    console.log(`Updated schedule: ${scheduleName}`);
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      // Create new schedule if not found
      const createCommand = new CreateScheduleCommand({
        Name: scheduleName,
        GroupName: scheduleGroupName,
        ScheduleExpression: scheduleExpression,
        ScheduleExpressionTimezone: timezone,
        FlexibleTimeWindow: { Mode: "OFF" },
        Target: {
          Arn: `arn:aws:lambda:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:function:alexa-${process.env.STAGE}-triggerHandler`,
          RoleArn: process.env.SCHEDULER_ROLE_ARN,
          Input: JSON.stringify(payload),
          RetryPolicy: {
            MaximumEventAgeInSeconds: 900,
            MaximumRetryAttempts: 3,
          },
        },
        State: "ENABLED",
      });

      await client.send(createCommand);
      console.log(`Created schedule: ${scheduleName}`);
    } else {
      console.error("Error managing schedule:", error);
      throw error;
    }
  }
}

/**
 * Checks if a schedule exists.
 * @param {string} scheduleName
 * @returns {Promise<boolean>}
 */
async function checkScheduleExists(scheduleName) {
  try {
    const command = new GetScheduleCommand({
      Name: scheduleName,
      GroupName: scheduleGroupName,
    });
    await client.send(command);
    return true;
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      return false;
    }
    throw error;
  }
}

/**
 * Lists all schedules for a given mosque ID.
 * @param {string} mosqueId
 * @returns {Promise<Array>}
 */
async function listSchedulesForMosque(mosqueId) {
  const schedules = [];
  let nextToken;

  do {
    const command = new ListSchedulesCommand({
      GroupName: scheduleGroupName,
      NamePrefix: `${mosqueId}-`,
      NextToken: nextToken,
    });
    const response = await client.send(command);
    if (response.Schedules) {
      schedules.push(...response.Schedules);
    }
    nextToken = response.NextToken;
  } while (nextToken);

  return schedules;
}

/**
 * Retrieves all unique mosque IDs that have active schedules.
 * @returns {Promise<string[]>}
 */
/**
 * Retrieves a map of mosque IDs and their active prayer schedules.
 * @returns {Promise<Object.<string, string[]>>} Map of mosqueId -> array of prayer names
 */
async function getAllMosqueActivePrayers() {
  const mosqueMap = {}; // { mosqueId: Set(prayers) }
  let nextToken;

  try {
    do {
      const command = new ListSchedulesCommand({
        GroupName: scheduleGroupName,
        NextToken: nextToken,
      });
      const response = await client.send(command);
      console.log("Schedules found: ", JSON.stringify(response?.Schedules));

      if (response.Schedules) {
        response.Schedules.forEach((schedule) => {
          let mosqueId = null;

          // 1. Try getting mosqueId from payload
          if (schedule.Target && schedule.Target.Input) {
            try {
              const payload = JSON.parse(schedule.Target.Input);
              if (payload.mosqueId) {
                mosqueId = payload.mosqueId;
              }
            } catch (e) {
              console.warn(
                `Failed to parse payload for schedule ${schedule.Name}:`,
                e,
              );
            }
          }

          // 2. Fallback: Parse from name if payload failed
          if (!mosqueId) {
            const name = schedule.Name;
            const prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
            for (const prayer of prayers) {
              if (name.endsWith(`-${prayer}`)) {
                mosqueId = name.substring(0, name.length - prayer.length - 1);
                break;
              }
            }
          }

          // 3. If we found a mosqueId, determine the prayer name
          if (mosqueId) {
            // Schedule Name is `mosqueId-prayerName`
            // prayerName is the suffix
            const name = schedule.Name;
            if (name.startsWith(`${mosqueId}-`)) {
              const prayerName = name.substring(mosqueId.length + 1); // +1 for hyphen

              if (!mosqueMap[mosqueId]) {
                mosqueMap[mosqueId] = new Set();
              }
              mosqueMap[mosqueId].add(prayerName);
            }
          }
        });
      }
      nextToken = response.NextToken;
    } while (nextToken);

    // Convert Sets to Arrays
    const result = {};
    for (const [id, prayerSet] of Object.entries(mosqueMap)) {
      result[id] = Array.from(prayerSet);
    }
    return result;
  } catch (error) {
    console.error("Error listing schedules:", error);
    throw error;
  }
}

/**
 * Updates only the time of an existing schedule.
 * @param {string} mosqueId
 * @param {string} prayerName
 * @param {string} newTime - Time in HH:mm format (24-hour)
 */
async function updateScheduleTimeOnly(mosqueId, prayerName, newTime) {
  const scheduleName = `${mosqueId}-${prayerName}`;

  try {
    // 1. Get existing schedule to preserve other details
    const getCommand = new GetScheduleCommand({
      Name: scheduleName,
      GroupName: scheduleGroupName,
    });
    const existingSchedule = await client.send(getCommand);

    if (!existingSchedule) {
      console.log(`Schedule ${scheduleName} not found. Skipping update.`);
      return;
    }

    // 2. Parse new time for Cron
    const [hour, minute] = newTime.split(":");
    const scheduleExpression = `cron(${minute} ${hour} * * ? *)`;

    // Check if update is needed
    if (existingSchedule.ScheduleExpression === scheduleExpression) {
      console.log(
        `Schedule ${scheduleName} time (${newTime}) is unchanged. Skipping update.`,
      );
      return;
    }

    // 3. Update command
    const updateCommand = new UpdateScheduleCommand({
      Name: scheduleName,
      GroupName: scheduleGroupName,
      ScheduleExpression: scheduleExpression,
      ScheduleExpressionTimezone: existingSchedule.ScheduleExpressionTimezone,
      FlexibleTimeWindow: existingSchedule.FlexibleTimeWindow,
      Target: existingSchedule.Target,
      State: existingSchedule.State,
    });

    await client.send(updateCommand);
    console.log(`Updated time for schedule: ${scheduleName} to ${newTime}`);
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      console.log(`Schedule ${scheduleName} not found (during update).`);
    } else {
      console.error(`Error updating schedule time for ${scheduleName}:`, error);
      throw error;
    }
  }
}

/**
 * Deletes a schedule.
 * @param {string} mosqueId
 * @param {string} prayerName
 */
async function deleteSchedule(mosqueId, prayerName) {
  const scheduleName = `${mosqueId}-${prayerName}`;
  try {
    const command = new DeleteScheduleCommand({
      Name: scheduleName,
      GroupName: scheduleGroupName,
    });
    await client.send(command);
    console.log(`Deleted schedule: ${scheduleName}`);
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      console.log(`Schedule ${scheduleName} not found (during delete).`);
    } else {
      console.error(`Error deleting schedule ${scheduleName}:`, error);
      throw error;
    }
  }
}

module.exports = {
  createOrUpdateSchedule,
  checkScheduleExists,
  listSchedulesForMosque,
  getAllMosqueActivePrayers,
  updateScheduleTimeOnly,
  deleteSchedule,
};

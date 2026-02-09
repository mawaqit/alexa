const { SchedulerClient, GetScheduleCommand, CreateScheduleCommand, UpdateScheduleCommand, ListSchedulesCommand } = require("@aws-sdk/client-scheduler");

const client = new SchedulerClient({ region: process.env.AWS_REGION });

/**
 * Creates or updates an EventBridge Schedule.
 * @param {Object} params
 * @param {string} params.mosqueId
 * @param {string} params.prayerName
 * @param {string} params.time - Time in HH:mm format (24-hour)
 * @param {string} params.timezone
 * @param {string} params.userId
 */
async function createOrUpdateSchedule({ mosqueId, prayerName, time, timezone, userId }) {
    const scheduleName = `${mosqueId}-${prayerName}`;
    const scheduleGroupName = "default";
    
    // Parse time for Cron expression
    // Input time: "HH:mm" -> Cron: "mm HH * * ? *" (Daily)
    const [hour, minute] = time.split(':');
    const scheduleExpression = `cron(${minute} ${hour} * * ? *)`;

    // Default payload
    let payload = {
        mosqueId: mosqueId,
        userIds: [userId]
    };

    try {
        // Try to get existing schedule
        const getCommand = new GetScheduleCommand({
            Name: scheduleName, // Corrected parameter name
            GroupName: scheduleGroupName
        });
        
        const existingSchedule = await client.send(getCommand);
        
        // If exists, merge payloads
        if (existingSchedule?.Target?.Input) {
            const existingPayload = JSON.parse(existingSchedule.Target.Input);
            
            // Ensure userIds is an array
            if (!existingPayload.userIds) {
                existingPayload.userIds = [];
            }
            
            // Add userId if not present
            if (!existingPayload.userIds.includes(userId)) {
                existingPayload.userIds.push(userId);
            }
            
            payload = existingPayload;
        }

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
                Input: JSON.stringify(payload)
            },
            State: "ENABLED"
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
                    Input: JSON.stringify(payload)
                },
                State: "ENABLED"
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
            GroupName: "default"
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
            GroupName: "default",
            NamePrefix: `${mosqueId}-`,
            NextToken: nextToken
        });
        const response = await client.send(command);
        if (response.Schedules) {
            schedules.push(...response.Schedules);
        }
        nextToken = response.NextToken;
    } while (nextToken);

    return schedules;
}

module.exports = {
    createOrUpdateSchedule,
    checkScheduleExists,
    listSchedulesForMosque
};

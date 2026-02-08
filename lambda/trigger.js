// trigger.js
const axios = require('axios');


module.exports.handler = async (event, context) => {
    console.log("Trigger function started");
    console.log("Event:", JSON.stringify(event, null, 2));

    try {
        // --- Your logic goes here ---

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Success" })
        };
    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal Server Error" })
        };
    }
};
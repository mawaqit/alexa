
module.exports = {
    translation: {
    skillName: process.env.skillName,//new
    welcomePrompt:`Welcome to ${process.env.skillName}. What would you like to know?`,
    helpPrompt:`You can ask me about the weather, or say exit... What can I help you with?`,
    stopPrompt:`Goodbye!`,
    cancelPrompt:`Goodbye!`,
    errorPrompt:`Sorry, I had trouble doing what you asked. Please try again.`,
    noDataPrompt:`Sorry, I couldn't find any data for that request. Please try again.`,
    noCityPrompt:`Sorry, I couldn't find any data for that city. Please try again.`,
    requestForGeoLocationPrompt: `${process.env.skillName} would like to use your location. To turn on location sharing, please go to your Alexa app, and follow the instructions.`,
    noAddressPrompt: "It looks like you don't have an city set. You can set your city from the Alexa app."
    }
}
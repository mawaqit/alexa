
module.exports = {
  translation: {
    skillName: process.env.skillName, //new
    welcomePrompt: `Assalamu Alaikum! `,
    chooseMosquePrompt: ` Which mosque do you want to choose? %s. You can say the number associated to the mosque or you can select by touch.`,
    helpPrompt: `You can ask me about the weather, or say exit... What can I help you with?`,
    stopPrompt: `Goodbye!`,
    errorPrompt: `Sorry, I had trouble doing what you asked. Please try again.`,
    noDataPrompt: `Sorry, I couldn't find any data for that request. Please try again.`,
    noCityPrompt: `Sorry, I couldn't find any data for that city. Please try again.`,
    requestForGeoLocationPrompt: `${process.env.skillName} would like to use your location. To turn on location sharing, please go to your Alexa app, and follow the instructions.`,
    noAddressPrompt:
      "It looks like you don't have an address set. You can set your address from the Alexa app.",
    errorPromptforMosqueList: `You can't use our skill for now as you don't have a ${process.env.skillName} mosque near you. Please check your geolocalisation.`,
    logoUrl:
      "https://play-lh.googleusercontent.com/79-OHFiVzGLTSLg_tXcsS3VwxWd9ZAxL4eAt35IgIljERyMkYvAq92m-fgpDsZ-lNA",
    backgroundImageUrl:
      "https://t4.ftcdn.net/jpg/02/70/87/75/360_F_270877592_QRvRPXe7o3ElW3X0MoRIZW3MG7UpVqrm.jpg",
    titleForMosqueList: `${process.env.skillName} Mosques`,
    layoutDirection: "LTR",
    nextPrayerTimeErrorPrompt: `Sorry, I couldn't find the next prayer time for that mosque. Please try again.`,
    nextPrayerTimePrompt: "The next prayer time at %s is %s at %s in %s. Do you want something more?",
    prayerNames: ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"],
    unableToFindMosquePrompt: `Sorry, I couldn't find the mosque you were looking for. Please choose a valid option.`,
    mosqueNotRegisteredPrompt: `You don't have a registered mosque. Please register a mosque first.`,
    mosqueSearchWordPrompt: `Which location do you want to search mosques for? you can say the city name`,
    nextPrayerTimeWithNamePrompt: `At %s, the %s prayer at %s in %s. Do you want something more?`, 
    noPrayerTimePrompt: `Sorry, there is no %s time for this mosque.`,
    hoursAndMinutesPrompt: "%s hours and %s minutes",
    minutesPrompt: "%s minutes",
    nextPrayerTimeSpecificPrompt: `At %s, the %s prayer at %s. Do you want something more?`,
    shuruqPrompt: `At %s, shuruq is at %s. Do you want something more?`,
    secondsPrompt: "%s seconds",
    errorGeoConversionPrompt: `Sorry, I couldn't convert the address to geolocation. Please try again.`,
    nextIqamaTimePrompt: `The next iqama time at %s is %s at %s in %s. Do you want something more?`
  },
};
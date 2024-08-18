
module.exports = {
  translation: {
    skillName: process.env.skillName, //new
    welcomePrompt: `Assalamu Alaikum! `,
    chooseMosquePrompt: ` Which mosque do you want to choose? The nearest mosques are :  %s. You can choose by saying the number associated to the mosque `,
    chooseMosqueByTouchPrompt: "or you can choose by clicking on the mosque on your screen.",
    helpPrompt: `You can ask me to tell you the time of the next prayer or any other prayer, you can also ask me information on your mosque. I can play adhan and change your favorite mosque.`,
    stopPrompt: `Goodbye!`,
    errorPrompt: `Sorry, I had trouble doing what you asked. Please try again.`,
    noDataPrompt: `Sorry, I couldn't find any data for that request. Please try again.`,
    noCityPrompt: `Sorry, I couldn't find any data for that city. Please try again.`,
    requestForGeoLocationPrompt: `To use our skill, we will need to have access to your location so that we can find the nearest mosques from you. Please open the Alexa app to accept.`,
    noAddressPrompt:
      "It looks like you don't have an address set. You can set your address from the Alexa app.",
    errorPromptforMosqueList: `I have found no mosque near your location. I am sorry but for now, there is no mosque equipped with ${process.env.skillName} around you.`,
    logoUrl:
      "https://play-lh.googleusercontent.com/79-OHFiVzGLTSLg_tXcsS3VwxWd9ZAxL4eAt35IgIljERyMkYvAq92m-fgpDsZ-lNA",
    titleForMosqueList: `${process.env.skillName} Mosques`,
    layoutDirection: "LTR",
    nextPrayerTimeErrorPrompt: `Sorry, I couldn't find the next prayer time for that mosque. Please try again.`,
    nextPrayerTimePrompt: "At %s the next prayer is %s at %s in %s. Do you want something more?",
    prayerNames: ["<phoneme alphabet=\"ipa\" ph=\"fadʒr\">Fajr</phoneme>", " <phoneme alphabet=\"ipa\" ph=\"duhr\">Dhuhr</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"ʕa.sˤr\">Asr</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"maɣ.rɪb\">Maghrib</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"ʔɪʃaːʔ\">Isha</phoneme>","<phoneme alphabet=\"ipa\" ph=\"dʒumʕa\">Jumma</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"ʕiːd\">Eid</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"ʃu.ruːq\">Shuruq</phoneme>"],
    unableToFindMosquePrompt: `Sorry, I couldn't find the mosque you were looking for. Please choose a valid option.`,
    mosqueNotRegisteredPrompt: `You don't have a registered mosque. Please register a mosque first. `,
    mosqueSearchWordPrompt: `Which location do you want to search mosques for? you can say the city name`,
    nextPrayerTimeWithNamePrompt: ` %s at %s in %s. `, 
    noPrayerTimePrompt: `Sorry, there is no %s time for this mosque.`,
    hoursAndMinutesPrompt: "%s hours and %s minutes",
    minutesPrompt: "%s minutes",
    nextPrayerTimeSpecificPrompt: `At %s, the %s prayer at %s. Do you want something more?`,
    shuruqPrompt: `At %s, shuruq is at %s. Do you want something more?`,
    secondsPrompt: "%s seconds",
    errorGeoConversionPrompt: `Sorry, I couldn't convert the address to geolocation. Please try again.`,
    nextIqamaTimePrompt: `The iqama for the next prayer %s is in %s. `,
    selectedMosquePrompt: `Perfect, %s is now your favorite mosque! `,
    nextPrayerWithoutMosquePrompt: `The next prayer is %s at %s in %s.`,
    iqamaNotEnabledPrompt: "Iqama information is not provided by your mosque.",
    mosqueInfoPrompt: "Your mosque is %s. Located at %s, approximately %s km from your location. The jumua is at %s.",
    mosqueInfoErrorPrompt: "Sorry, I couldn't find the information for your mosque. Please try again.",
    allIqamaTimesPrompt: "For %s, the iqama time is %s. ",   
    deleteDataPrompt: "Your data has been deleted successfully." ,
    thankYouPrompt: `Thanks for using ${process.env.skillName} to provide you exact prayer times of your mosque. `,
    okPrompt: "Ok. ",
    jummaTimePrompt: "The jumma is at %s.",
    noJummaTimePrompt: "There is no jumma time for this mosque.",
    none: "None",
  },
};
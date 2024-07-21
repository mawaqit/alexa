
module.exports = {
  translation: {
    skillName: process.env.skillName, //new
    welcomePrompt: `Salam Aleykoum ! `,
    chooseMosquePrompt: ` Quelle mosquée voulez-vous choisir ? %s. Vous pouvez dire le numéro associé à la mosquée, vous pouvez aussi sélectionner en cliquant sur l'écran.`,
    helpPrompt: `Vous pouvez me demander les heures de prière, des informations sur votre mosquée, vous pouvez aussi changer de mosquée ou quitter la Skill. Comment puis-je vous aider ?`,
    stopPrompt: `Au revoir et qu'Allah vous préserve !`,
    errorPrompt: `Désolé, je n'ai pas bien compris ce que vous avez dit. Veuillez répéter s'il vous plaît.`,
    noDataPrompt: `Désolé, je n'ai pu trouver aucune donnée pour cette reqûete. Veuillez réessayer s'il vous plaît.`,
    noCityPrompt: `Désolé, je n'ai pu trouver aucune mosuée pour cette ville. Veuillez réessayer s'il vous plaît.`,
    requestForGeoLocationPrompt: `${process.env.skillName} aimerait utiliser votre localisation. Pour activer le partage de connexion, lancez l'application Alexa et suivez les instructions.`,
    noAddressPrompt:
      "Il semble que vous n'avez pas défini votre adresse sur Alexa. Vous pouvez le faire depuis l'application Alexa. Cela me permettra de trouver les mosquées proches de vous.",
    errorPromptforMosqueList: `Vous ne pouvez pas utiliser notre Skill pour l'instant car vous n'avez pas de mosquée MAWAQIT proche de vous. S'il vous plaît, vérifiez votre localisation.`,
    logoUrl:
      "https://play-lh.googleusercontent.com/79-OHFiVzGLTSLg_tXcsS3VwxWd9ZAxL4eAt35IgIljERyMkYvAq92m-fgpDsZ-lNA",
    backgroundImageUrl:
      "https://t4.ftcdn.net/jpg/02/70/87/75/360_F_270877592_QRvRPXe7o3ElW3X0MoRIZW3MG7UpVqrm.jpg",
    titleForMosqueList: `Mosquées ${process.env.skillName}`,
    layoutDirection: "LTR",
    nextPrayerTimeErrorPrompt: `Désolé, je n'ai pas pu trouver l'heure de la prochaine prière pour votre mosquée. Veuillez réessayer s'il vous plaît.`,
    nextPrayerTimePrompt: "La prochaine prière à %s est %s à %s dans %s. Voulez-vous savoir autre chose ?",
    prayerNames: ["Fajr", "Dohr", "Asr", "Maghrib", "Isha"],
    unableToFindMosquePrompt: `Désolé, je n'ai pas pu trouver la mosquée que vous cherchez. S'il vous plaît, choisissez une option valide.`,
    mosqueNotRegisteredPrompt: `Vous n'avez pas enregistré de mosquée pour faire cette reqûete. Veuillez enregistrer une mosquée d'abord.`,
    mosqueSearchWordPrompt: `Pour quel lieu voulez-vous chercher une mosquée ? Vous pouvez dire le nom de la ville.`,
    nextPrayerTimeWithNamePrompt: `à %s, la prière de %s est à %s dans %s. Voulez-vous savoir autre chose ?`, 
    noPrayerTimePrompt: `Désole, il n'y a pas d'horaire pour %s dans cette mosquée.`,
    hoursAndMinutesPrompt: "%s heures et %s minutes",
    minutesPrompt: "%s minutes",
    nextPrayerTimeSpecificPrompt: `à %s, la prière de %s est à %s. Voulez-vous savoir autre chose ?`,
    shuruqPrompt: `à %s, Shourouk est à %s. Voulez-vous savoir autre chose ?`,
    secondsPrompt: "%s seconds",
    errorGeoConversionPrompt: `Sorry, I couldn't convert the address to geolocation. Please try again.`,
    nextIqamaTimePrompt: `The next iqama time at %s is %s at %s in %s. Do you want something more?`
  },
};

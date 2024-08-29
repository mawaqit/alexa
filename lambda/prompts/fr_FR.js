
module.exports = {
  translation: {
    skillName: process.env.skillName, //new
    welcomePrompt: `Salam Aleykoum ! `,
    chooseMosquePrompt: `Quelle mosquée voulez-vous choisir ? Les mosquées les plus proches sont : %s. Vous pouvez choisir en prononçant le numéro associé à la mosquée`,
    chooseMosqueByTouchPrompt: " ou vous pouvez aussi cliquer sur la mosquée de votre choix sur votre écran.",
    helpPrompt: `Vous pouvez me demander de vous donner l'heure de la prochaine prière, ou toute autre prière en disant son nom. Vous pouvez aussi me demander des informations sur votrez mosquée. Je peux aussi lancer l'adhan et changer votre mosquée favorite.`,
    stopPrompt: `Au revoir et qu'Allah vous préserve !`,
    errorPrompt: `Désolé, je n'ai pas bien compris ce que vous avez dit. Veuillez répéter s'il vous plaît.`,
    noDataPrompt: `Désolé, je n'ai pu trouver aucune donnée pour cette reqûete. Veuillez réessayer s'il vous plaît.`,
    noCityPrompt: `Désolé, je n'ai pu trouver aucune mosuée pour cette ville. Veuillez réessayer s'il vous plaît.`,
    thankYouPrompt: `Merci d'utiliser ${process.env.skillName} afin d'avoir les horaires exactes de prière de votre mosquée favorite.`,
    requestForGeoLocationPrompt: `Pour utiliser l'application, vous devez m'autoriser à accéder à votre localisation pour que je puisse trouver les mosquées les plus proches de vous. Ouvrez l'application Alexa sur votre téléphone pour accepter s'il vous plaît.`,
    noAddressPrompt:
      "Il semble que vous n'avez pas défini votre adresse sur Alexa. Vous pouvez le faire depuis l'application Alexa. Cela me permettra de trouver les mosquées proches de vous.",
    errorPromptforMosqueList: `Je suis désolé, je n'ai trouvé aucune mosquée MAWAQIT proche de vous.`,
    logoUrl:
      "https://play-lh.googleusercontent.com/79-OHFiVzGLTSLg_tXcsS3VwxWd9ZAxL4eAt35IgIljERyMkYvAq92m-fgpDsZ-lNA",
    titleForMosqueList: `Mosquées ${process.env.skillName}`,
    layoutDirection: "LTR",
    nextPrayerTimeErrorPrompt: `Désolé, je n'ai pas pu trouver l'heure de la prochaine prière pour votre mosquée. Veuillez réessayer s'il vous plaît.`,
    nextPrayerTimePrompt: "À %s la prochaine prière est %s à %s dans %s. Voulez-vous autre chose ?",
    prayerNames: ["<phoneme alphabet=\"ipa\" ph=\"fadʒr\">Fajr</phoneme>", " <phoneme alphabet=\"ipa\" ph=\"duhr\">Dohr</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"ʕa.sˤr\">Asr</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"maɣ.rɪb\">Maghrib</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"ʔɪʃaːʔ\">Isha</phoneme>","<phoneme alphabet=\"ipa\" ph=\"dʒumʕa\">Jumma</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"ʕiːd\">Eid</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"ʃu.ruːq\">Shuruq</phoneme>"],
    unableToFindMosquePrompt: `Désolé, je n'ai pas pu trouver la mosquée que vous cherchez. S'il vous plaît, choisissez une option valide.`,
    mosqueNotRegisteredPrompt: `Vous n'avez pas enregistré de mosquée pour faire cette reqûete. Veuillez enregistrer une mosquée d'abord. `,
    mosqueSearchWordPrompt: `Pour quel lieu voulez-vous chercher une mosquée ? Vous pouvez dire le nom de la ville.`,
    nextPrayerTimeWithNamePrompt: `à %s, la prière de %s est à %s dans %s. Voulez-vous savoir autre chose ?`, 
    noPrayerTimePrompt: `Désole, il n'y a pas d'horaire pour %s dans cette mosquée.`,
    hoursAndMinutesPrompt: "%s heures et %s minutes",
    minutesPrompt: "%s minutes",
    nextPrayerTimeSpecificPrompt: `à %s, la prière de %s est à %s. Voulez-vous savoir autre chose ?`,
    shuruqPrompt: `à %s, Shourouk est à %s. Voulez-vous savoir autre chose ?`,
    secondsPrompt: "%s secondes",
    errorGeoConversionPrompt: `Désolé, je n'ai pas pu convertir votre adresse en géolocalisation. Veuillez reéssayer.`,
    nextIqamaTimePrompt: `L'iqama pour la prochaine prière %s est dans %s.`,
    selectedMosquePrompt: `Parfait, %s est désormais votre mosquée favorite !`,
    nextPrayerWithoutMosquePrompt: `La prochaine prière est %s à %s dans %s.`,
    iqamaNotEnabledPrompt: "Iqama information is not provided by your mosque.",
    mosqueInfoPrompt: "Votre mosquée est %s. Localisé à %s, à environ %s kilomètres de votre localisation. De plus, le jumua, la prière du Vendredi, est à %s.",
    mosqueInfoErrorPrompt: "Désolé, je n'ai pas pu trouver d'information pour votre mosquée, veuillez reéssayer s'il vous plaît.",
    nextPrayerTimeWithNamePrompt: ` %s à %s dans %s. `,
    allIqamaTimesPrompt: "Pour %s, l'iqama est %s. ", 
    deleteDataPrompt: "Vos données ont bien été supprimées. Relancez l'application pour réutiliser ${process.env.skillName}.",
    okPrompt: "Ok.",
    jummaTimePrompt: "le jumua, la prière du Vendredi, est à %s.",
    noJummaTimePrompt: "Il n'y a pas de prière de jumua dans cette mosquée.",
    none: "None",
  },
};

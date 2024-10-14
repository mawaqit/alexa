module.exports = {
  translation: {
    skillName: process.env.skillName, //new
    welcomePrompt: `Salam Aleikum! `,
    chooseMosquePrompt: `Qual mesquita você gostaria de escolher? As mesquitas mais próximas são: %s. Você pode escolher pronunciando o número associado à mesquita.`,
    chooseMosqueByTouchPrompt: " ou você também pode clicar na mesquita de sua escolha na tela.",
    helpPrompt: `Aqui estão os comandos que você pode usar:\n- Quando é a próxima oração?\n- Você também pode perguntar a hora de cada oração, perguntando, por exemplo, "Quando é a quarta oração?" para o Maghrib\n- Quanto tempo falta até o iqama?\n- Me dê informações sobre a minha mesquita.\n- Mude a minha mesquita favorita.\n- Me dê os horários das orações de hoje.\n- Toque o adhan.\n- Toque o adhan do Fajr.\nEsses comandos também podem ser usados nas suas rotinas da Alexa. Mais comandos estarão disponíveis em breve, inshaAllah.`,
    stopPrompt: `Adeus e que Allah te proteja!`,
    errorPrompt: `Desculpe, eu não entendi bem o que você disse. Poderia repetir, por favor?`,
    noDataPrompt: `Desculpe, não encontrei dados para esta solicitação. Tente novamente, por favor.`,
    noCityPrompt: `Desculpe, não encontrei nenhuma mesquita nesta cidade. Tente novamente, por favor.`,
    requestForGeoLocationPrompt: `Para usar a skill, você precisa me autorizar a acessar sua localização para que eu possa encontrar as mesquitas mais próximas. Abra o aplicativo Alexa no seu telefone para aceitar, por favor.`,
    noAddressPrompt: `Parece que você não definiu seu endereço no Alexa. Você pode fazer isso através do aplicativo Alexa. Isso me permitirá encontrar as mesquitas mais próximas de você.`,
    errorPromptforMosqueList: `Desculpe, não encontrei nenhuma mesquita MAWAQIT perto de você.`,
    logoUrl: "https://play-lh.googleusercontent.com/79-OHFiVzGLTSLg_tXcsS3VwxWd9ZAxL4eAt35IgIljERyMkYvAq92m-fgpDsZ-lNA",
    titleForMosqueList: `Mesquitas ${process.env.skillName}`,
    layoutDirection: "LTR",
    nextPrayerTimeErrorPrompt: `Desculpe, não consegui encontrar o horário da próxima oração para sua mesquita. Tente novamente, por favor.`,
    nextPrayerTimePrompt: "Às %s, a próxima oração é %s às %s em %s. Gostaria de saber mais alguma coisa?",
    prayerNames: ["<phoneme alphabet=\"ipa\" ph=\"fadʒr\">Fajr</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"duhr\">Duhr</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"ʕa.sˤr\">Asr</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"maɣ.rɪb\">Maghrib</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"ʔɪʃaːʔ\">Isha</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"dʒumʕa\">Jumma</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"ʕiːd\">Eid</phoneme>", "<phoneme alphabet=\"ipa\" ph=\"ʃu.ruːq\">Shuruq</phoneme>"],
    unableToFindMosquePrompt: `Desculpe, não consegui encontrar a mesquita que você está procurando. Por favor, escolha uma opção válida.`,
    mosqueNotRegisteredPrompt: `Você não registrou uma mesquita para fazer esta solicitação. Por favor, registre uma mesquita primeiro.`,
    mosqueSearchWordPrompt: `Para qual local você deseja procurar uma mesquita? Você pode dizer o nome da cidade.`,
    noPrayerTimePrompt: `Desculpe, não há horário para %s nesta mesquita.`,
    hoursAndMinutesPrompt: "%s horas e %s minutos",
    minutesPrompt: "%s minutos",
    nextPrayerTimeSpecificPrompt: `Às %s, a oração de %s é às %s. Gostaria de saber mais alguma coisa?`,
    shuruqPrompt: `Às %s, o Shuruq é às %s. Gostaria de saber mais alguma coisa?`,
    secondsPrompt: "%s segundos",
    errorGeoConversionPrompt: `Desculpe, não consegui converter seu endereço em geolocalização. Tente novamente, por favor.`,
    nextIqamaTimePrompt: `O iqama para a próxima oração %s é em %s.`,
    selectedMosquePrompt: `Perfeito, %s agora é sua mesquita favorita!`,
    nextPrayerWithoutMosquePrompt: `A próxima oração é %s às %s em %s.`,
    iqamaNotEnabledPrompt: "Os horários entre o adhan e o iqama não são fornecidos por sua mesquita.",
    mosqueInfoPrompt: "Sua mesquita é %s. Localizada em %s, a aproximadamente %s quilômetros de sua localização. ",
    mosqueInfoErrorPrompt: "Desculpe, não consegui encontrar informações sobre sua mesquita. Tente novamente, por favor.",
    nextPrayerTimeWithNamePrompt: `A oração de %s é às %s em %s.`,
    allIqamaTimesPrompt: "Para %s, o iqama é às %s.",
    deleteDataPrompt: `Seus dados foram excluídos com sucesso. Reinicie a skill para reutilizar ${process.env.skillName}.`,
    okPrompt: "Ok. ",
    jummaTimePrompt: " Além disso, o Jumua, a oração de sexta-feira, é às %s.",
    noJummaTimePrompt: "Não há oração de Jumua nesta mesquita.",
    none: "Nenhum",
    thankYouPrompt: `Obrigado por usar ${process.env.skillName} para obter os horários exatos de oração de sua mesquita favorita.`,
    globalErrorPrompt: "Desculpe, eu não entendi bem o que você disse. Poderia repetir, por favor?",
    fallbackPrompt: "Desculpe, eu não entendi bem o que você disse. Poderia repetir, por favor?",
    allPrayerTimesPrompt: "%s é às %s."
  },
};
// Lambda Function code for Alexa.
// Paste this into your index.js file. 

const Alexa = require('ask-sdk-core');
const Api = require('./api');
const moment = require('moment-timezone');
const persistenceAdapter = require('ask-sdk-s3-persistence-adapter');

moment.tz.setDefault('Europe/Paris');
const s3PersistenceAdapter = new persistenceAdapter.S3PersistenceAdapter({
    bucketName:process.env.S3_PERSISTENCE_BUCKET|| 'mawaqit'
});


const invocationName = "Prière ma-ouaqitte";
const api = new Api();


function getMemoryAttributes() {   const memoryAttributes = {
        "history":[],
        "launchCount":0,
        "lastUseTimestamp":0,
        "lastSpeechOutput":{},
        "nextIntent":[]
    };
    return memoryAttributes;
};

const maxHistorySize = 20; // remember only latest 20 intents 


// 1. Intent Handlers =============================================

const AMAZON_CancelIntent_Handler =  {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.CancelIntent' ;
    },
    handle(handlerInput) {
        const responseBuilder = handlerInput.responseBuilder;
        let say = "<prosody volume='x-soft'>As-salam aleïkom</prosody>";
        //Merci d'avoir utilisé "+invocationName+",

        return responseBuilder
            .speak(say)
            .withShouldEndSession(true)
            .getResponse();
    },
};

const AMAZON_HelpIntent_Handler =  {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.HelpIntent' ;
    },
    handle(handlerInput) {
        const responseBuilder = handlerInput.responseBuilder;

        let say = 'Voici ce que vous pouvez me demander' 
        + '<s>lance la configuration</s>'
        + '<s>quelle est la prochaine prière .</s>'
        + '<s>à quelle heure est salat al fajr ?</s>'

        return responseBuilder
            .speak(say)
            .reprompt('Que souhaitez vous faire ?')
            .getResponse();
    },
};

const AMAZON_StopIntent_Handler =  {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.StopIntent' ;
    },
    handle(handlerInput) {
        const responseBuilder = handlerInput.responseBuilder;
        let say = "<prosody volume='x-soft'>As-salam aleïkom</prosody>";

        return responseBuilder
            .speak(say)
            .withShouldEndSession(true)
            .getResponse();
    },
};

const AMAZON_NavigateHomeIntent_Handler =  {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.NavigateHomeIntent' ;
    },
    handle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        const responseBuilder = handlerInput.responseBuilder;

        let say = 'Hello from AMAZON.NavigateHomeIntent. ';


        return responseBuilder
            .speak(say)
            .reprompt('try again, ' + say)
            .getResponse();
    },
};
const getSavedAttributes = async function(attributesManager) {
    try {
        return await attributesManager.getPersistentAttributes() || {};
    } catch (error) {
        return "";
    }
}
const setPersistentAttributes = async function(attributesManager,attributeName,attributeValue) {
    const attributes = await getSavedAttributes(attributesManager);
    attributes[attributeName]= attributeValue
    attributesManager.setPersistentAttributes({...attributes});

    try {
        await attributesManager.savePersistentAttributes();  
    } catch (error) {
        console.log(error);
    }
}

const GetSalatByDefaultMosque_S_Handler =  {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'GetSalatByDefaultMosque' && request.dialogState === 'STARTED' ;
    },
    async handle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        const responseBuilder = handlerInput.responseBuilder;
        const currentIntent = request.intent;

        return responseBuilder
                .addDelegateDirective(currentIntent)
                .getResponse();
    }
}
const GetSalatByDefaultMosque_C_Handler =  {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'GetSalatByDefaultMosque' && request.dialogState != 'STARTED';
    },
    async handle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        const responseBuilder = handlerInput.responseBuilder;
        let slotValues = getSlotValues(request.intent.slots);
        let say ="";
        const attributes = await getSavedAttributes(handlerInput.attributesManager);

        if(attributes && attributes.mosque && attributes.mosque.uuid ){
            if (slotValues.salatName &&  slotValues.salatName.ERstatus === 'ER_SUCCESS_MATCH') {
                try {
                    say = await getSalatTime(attributes.mosque.uuid, slotValues.salatName.resolved);
                } catch (error) {
                    say = "Une erreur est survenue veuillez réessayer plus tard";
                }
            }else{
                say +=`réessayez s'il vous plait,la prière n'est pas valide`;
            }
            return responseBuilder
                    .speak(say)
                    .getResponse();
        }else{
            const { __return } = sendToConfig("", responseBuilder);
            return __return;
        }
    },
};
const isFriday = function () {
    return new Date().getDay() === 5;
}
const getNextPrayer=function(prayerTimes){
    const currentTimeInMinute = moment.duration(moment().format("HH:mm")).asMinutes();
    let min = Infinity;
    let say="";
    let nextSalat = '';
    let {fajrNextDay,...todayPrayes} = prayerTimes;
    for (const salat in todayPrayes) {
        const prayerTimeInMinutes = moment.duration(prayerTimes[salat]).asMinutes();
        
        if(prayerTimeInMinutes >= currentTimeInMinute && prayerTimeInMinutes < min){
            min = prayerTimeInMinutes;
            nextSalat= salat;
        }
    }
    if(nextSalat===''){
        say = `prochaine prière al-fajr demain à <break time="300ms"/><say-as interpret-as="time">${fajrNextDay}</say-as>`;
    }else{
        say = `prochaine prière al-${nextSalat},à <break time="300ms"/><say-as interpret-as="time">${prayerTimes[nextSalat]}</say-as>`;
    }

    let  nextPrayerTime = moment.duration(prayerTimes[nextSalat]).asMinutes()-currentTimeInMinute;

    if(nextPrayerTime<60 && nextPrayerTime > 0){
        nextPrayerTime =moment.duration(nextPrayerTime, "minutes").locale("fr").humanize(true);
        say = `prochaine prière al-${nextSalat}, <break time="300ms"/> <say-as interpret-as="time">${nextPrayerTime}</say-as>`;
    }
    return say;
}

const LaunchRequest_Handler =  {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'LaunchRequest';
    },
   async handle(handlerInput) {
        const responseBuilder = handlerInput.responseBuilder;
        let say ='As-salam aleïkom,bienvenue au ' + invocationName ;    
        const attributes = await getSavedAttributes(handlerInput.attributesManager);
        
        console.log('***** attributes: ' +  JSON.stringify(attributes, null, 2));
        
        if(attributes && attributes.mosque && attributes.mosque.uuid){
            const greetingHelp = '<s>comment je peux vous aidez ?</s>';
            try {
                say += await getSalatTime(attributes.mosque.uuid,"prochaine")+greetingHelp;
                //reSay = '';
            } catch (error) {
                say = "Une erreur est survenue veuillez réessayer plus tard" + "<s>réessayez s'il vous plait<s>";
            }

            return responseBuilder
                .speak(say)
                .reprompt(greetingHelp)
                .getResponse();
        }else{
            console.log('no config found')
            let __return;
            ({ __return, say } = sendToConfig(say, responseBuilder));
            return __return;
        }
  
    },
};
const SetConfig_Completed_Handler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' 
        && request.intent.name === 'SetConfig'
        && request.intent.slots.mosque.confirmationStatus === "CONFIRMED" 
        && request.dialogState === "COMPLETED"
    },
    async handle(handlerInput) {
        const responseBuilder = handlerInput.responseBuilder;
        let say ="<s>mosquée ajoutée</s>";

        try {
            const attributes = await getSavedAttributes(handlerInput.attributesManager);
            await setPersistentAttributes(handlerInput.attributesManager,"mosque",attributes.tmpMosque);
            say += await getSalatTime(attributes.tmpMosque.uuid,"prochaine");
            
            return responseBuilder
            .speak(say)
            .withShouldEndSession(true)
            .getResponse();

        } catch (error) {
            say = "Une erreur est survenue veuillez réessayer plus tard";
            return responseBuilder
                .speak(say)
                .getResponse();
        }
    },
}
const SetConfig_Confirmation_Handler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' 
        && request.intent.name === 'SetConfig'
        && request.intent.slots.mosque.confirmationStatus === "NONE" 
        && request.dialogState === 'COMPLETED';
    },
    async handle(handlerInput) {
        const responseBuilder = handlerInput.responseBuilder;
        const attributes = await getSavedAttributes(handlerInput.attributesManager);
        console.log("*******tmpMosque:" + JSON.stringify(attributes.tmpMosque));

        const speechText = "Voulez vous ajouter "+attributes.tmpMosque.slug+ " à votre mosquée ?";

        return responseBuilder
            .speak(speechText)
            .reprompt(speechText)
            .addConfirmSlotDirective("mosque")
            .getResponse();
    },
}

const getHeardeAs = function(mosqueType,heardAs,city) {
    if(heardAs==="d'"){
        return mosqueType +" "+heardAs+city;
    }
    return mosqueType +" "+heardAs+" "+city;
}
const SetConfig_Handler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'SetConfig' && request.dialogState !== 'COMPLETED';
    },
    async handle(handlerInput) {
        const responseBuilder = handlerInput.responseBuilder;
        const request = handlerInput.requestEnvelope.request;
        const currentIntent = request.intent;
        let slotValues = getSlotValues(request.intent.slots);
        const city = slotValues.city ? slotValues.city.heardAs:'';
        const mosque_type = slotValues.mosque_type ? slotValues.mosque_type.resolved:'';
console.log("slotValues" + JSON.stringify(slotValues));
        if( slotValues.mosque && slotValues.mosque.heardAs){
            try {
                const word = getHeardeAs(mosque_type +" "+slotValues.mosque.heardAs+" "+city)
                const data = await  api.searchMosque(word);
                if(data && data.length>0){
                    currentIntent.slots.mosque.value = data[0].name;
                    setPersistentAttributes(handlerInput.attributesManager,'tmpMosque',data[0]);
                    return responseBuilder
                        .addDelegateDirective(currentIntent)
                        .getResponse();
                }else{
                    return responseBuilder
                        .addDelegateDirective({
                                name: 'SetConfig',
                                    confirmationStatus: 'NONE',
                                    slots: {
                                        mosque: {
                                            name: "mosque",
                                            value: "",
                                            confirmationStatus: "NONE"
                                        }
                                    }
                        })
                        .speak("je trouve pas "+slotValues.mosque.heardAs)
                        .getResponse();
                }
            } catch (error) {
                let say = "Une erreur est survenue veuillez réessayer plus tard";
                return responseBuilder
                    .speak(say)
                    .getResponse();
            }
        }
        return responseBuilder
                .addDelegateDirective(currentIntent)
                .getResponse();
    },
}
// const YesNo_Handler_Handler = {
//     canHandle(handlerInput) {
//         const request = handlerInput.requestEnvelope.request;
//         return request.type === 'IntentRequest' && (
//                 request.intent.name === 'AMAZON.YesIntent' ||
//                 request.intent.name === 'AMAZON.NoIntent'
//             );
//     },
//     async handle(handlerInput) {
//         const request = handlerInput.requestEnvelope.request;
//         const responseBuilder = handlerInput.responseBuilder;
//         let answer = "yes";
//         let say = "la prochaine prière sera annoncé à l'accueil.";

//         if(request.intent.name === 'AMAZON.NoIntent'){
//             answer = "no";
//             say ="okay!";
//         }
//         try {
//             await setPersistentAttributes(handlerInput.attributesManager,"nextSalatOnLaunch",answer);
            
//         } catch (error) {
//             say = "Une erreur est survenue veuillez réessayer plus tard";
//         }
//         return responseBuilder
//             .speak(say)
//             .getResponse();

//     }
// }
const SessionEndedHandler =  {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);
        return handlerInput.responseBuilder.getResponse();
    }
};

const ErrorHandler =  {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const request = handlerInput.requestEnvelope.request;

        console.log(`Error handled: ${error.message}`);
        // console.log(`Original Request was: ${JSON.stringify(request, null, 2)}`);

        return handlerInput.responseBuilder
            .speak('Sorry, an error occurred.  Please say again.')
            .reprompt('Sorry, an error occurred.  Please say again.')
            .getResponse();
    }
};


// 2. Constants ===========================================================================

    // Here you can define static data, to be used elsewhere in your code.  For example: 
    //    const myString = "Hello World";
    //    const myArray  = [ "orange", "grape", "strawberry" ];
    //    const myObject = { "city": "Boston",  "state":"Massachusetts" };

const APP_ID = undefined;  // TODO replace with your Skill ID (OPTIONAL).



function sendToConfig(say, responseBuilder) {
    say += "<s>vous n'avez pas choisi une mosquée</s><s>quelle est la votre ?</s>";
    return {
    __return: responseBuilder
        .addElicitSlotDirective('mosque', {
            name: 'SetConfig',
            confirmationStatus: 'NONE',
            slots: {}
        })
        .speak(say)
        .getResponse(), say
    };
}

// 3.  Helper Functions ===================================================================

async function getSalatTime(mosqueUUID, resolvedSalatName) {
    let say ="";
    const {toDayTimes,tomorrowTimes} = await api.getPrayerTimesByMosque(mosqueUUID);
    if (resolvedSalatName === "prochaine") {
        const { shuruq, jumua, dhuhr, ...rest } = (toDayTimes);
        if (isFriday()) {
            say = getNextPrayer({ jumua, ...rest });
        }
        else {
            say = getNextPrayer({ dhuhr, ...rest });
        }
    }else {
        const currentTimeInMinute = moment.duration(moment().format("HH:mm")).asMinutes();
        const prayerTimeInMinutes = moment.duration(toDayTimes[resolvedSalatName]).asMinutes();
        let salatTime ="";
        let demain="";
        if( currentTimeInMinute > prayerTimeInMinutes){
            salatTime = tomorrowTimes[resolvedSalatName];
            demain = "demain"
        }else{
            salatTime = toDayTimes[resolvedSalatName];
        }

        say = `salat el ${resolvedSalatName} ${demain} <break time="300ms"/> à <say-as interpret-as="time">${salatTime}</say-as>`;
    }
    return `<s>${say}</s>`;
}

function getSlotValues(filledSlots) { 
    const slotValues = {}; 
 
    Object.keys(filledSlots).forEach((item) => { 
        const name  = filledSlots[item].name; 
 
        if (filledSlots[item] && 
            filledSlots[item].resolutions && 
            filledSlots[item].resolutions.resolutionsPerAuthority[0] && 
            filledSlots[item].resolutions.resolutionsPerAuthority[0].status && 
            filledSlots[item].resolutions.resolutionsPerAuthority[0].status.code) { 
            
            //console.log('***** getSlotValues status'+JSON.stringify(filledSlots[item].resolutions.resolutionsPerAuthority[0].status));
            //console.log('***** getSlotValues value'+JSON.stringify(filledSlots[item].resolutions.resolutionsPerAuthority[0].values[0]));
            switch (filledSlots[item].resolutions.resolutionsPerAuthority[0].status.code) { 
                case 'ER_SUCCESS_MATCH': 
                    slotValues[name] = { 
                        heardAs: filledSlots[item].value, 
                        resolved: filledSlots[item].resolutions.resolutionsPerAuthority[0].values[0].value.name, 
                        id: filledSlots[item].resolutions.resolutionsPerAuthority[0].values[0].value.id, 
                        ERstatus: 'ER_SUCCESS_MATCH' 
                    }; 
                    break; 
                case 'ER_SUCCESS_NO_MATCH': 
                    slotValues[name] = { 
                        heardAs: filledSlots[item].value, 
                        resolved: '', 
                        ERstatus: 'ER_SUCCESS_NO_MATCH' 
                    }; 
                    break; 
                default: 
                    break; 
            } 
        } else { 
            slotValues[name] = { 
                heardAs: filledSlots[item].value, 
                resolved: '', 
                ERstatus: '' 
            }; 
        } 
    }, this); 
 
    return slotValues; 
} 


const InitMemoryAttributesInterceptor = { 
    process(handlerInput) { 
        let sessionAttributes = {}; 
        if(handlerInput.requestEnvelope.session['new']) { 
 
            sessionAttributes = handlerInput.attributesManager.getSessionAttributes(); 
 
            let memoryAttributes = getMemoryAttributes(); 
 
            if(Object.keys(sessionAttributes).length === 0) { 
 
                Object.keys(memoryAttributes).forEach(function(key) {  // initialize all attributes from global list 
 
                    sessionAttributes[key] = memoryAttributes[key]; 
 
                }); 
 
            } 
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes); 
 
 
        } 
    } 
}; 
 
const RequestHistoryInterceptor = { 
    process(handlerInput) { 
 
        const thisRequest = handlerInput.requestEnvelope.request; 
        let sessionAttributes = handlerInput.attributesManager.getSessionAttributes(); 
 
        let history = sessionAttributes['history'] || []; 
 
        let IntentRequest = {}; 
        if (thisRequest.type === 'IntentRequest' ) { 
 
            let slots = []; 
 
            IntentRequest = { 
                'IntentRequest' : thisRequest.intent.name 
            }; 
 
            if (thisRequest.intent.slots) { 
 
                for (let slot in thisRequest.intent.slots) { 
                    let slotObj = {}; 
                    slotObj[slot] = thisRequest.intent.slots[slot].value; 
                    slots.push(slotObj); 
                } 
 
                IntentRequest = { 
                    'IntentRequest' : thisRequest.intent.name, 
                    'slots' : slots 
                }; 
 
            } 
 
        } else { 
            IntentRequest = {'IntentRequest' : thisRequest.type}; 
        } 
        if(history.length > maxHistorySize - 1) { 
            history.shift(); 
        } 
        history.push(IntentRequest); 
 
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes); 
 
    } 
 
}; 
 
// 4. Exports handler function and setup ===================================================
const skillBuilder = Alexa.SkillBuilders.custom();

exports.handler = skillBuilder
    .withPersistenceAdapter(s3PersistenceAdapter)
    .addRequestHandlers(
        AMAZON_CancelIntent_Handler, 
        AMAZON_HelpIntent_Handler, 
        AMAZON_StopIntent_Handler, 
        AMAZON_NavigateHomeIntent_Handler,
        GetSalatByDefaultMosque_C_Handler,
        GetSalatByDefaultMosque_S_Handler,
        LaunchRequest_Handler,
        SetConfig_Handler,
        SetConfig_Confirmation_Handler,
        SetConfig_Completed_Handler,
        SessionEndedHandler
    )
    .addErrorHandlers(ErrorHandler)
    .addRequestInterceptors(InitMemoryAttributesInterceptor)
    .addRequestInterceptors(RequestHistoryInterceptor)
    .lambda();

// End of Skill code -------------------------------------------------------------
// Static Language Model for reference


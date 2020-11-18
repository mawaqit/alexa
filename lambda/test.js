//import your handler file or main file of Lambda
let handler = require('./app');

//Call your exports function with required params
//In AWS lambda these are event, content, and callback
//event and content are JSON object and callback is a function
//In my example i'm using empty JSON

// let request = {"request": {
//     "type": "IntentRequest",
//     "requestId": "amzn1.echo-api.request.11b27cdb-8817-4bfb-9bb8-54a8decc5696",
//     "timestamp": "2019-07-25T22:15:35Z",
//     "locale": "fr-FR",
//     "intent": {
//         "name": "GetNextSalat",
//         "confirmationStatus": "NONE"
//     }
// }
// };
var event = require('./input.json');
handler.handler( event, //event
    {}, //content
    function(data,ss) {  //callback function with two arguments 
        console.log('data'+data);
    });
// Lambda Function code for Alexa.
// Paste this into your index.js file. 
const Alexa = require("ask-sdk-core");
const AWS = require('aws-sdk');
const https = require("https");

const TABLE_NAME = "high-roller-leaderboard-id";

const invocationName = "high roller";

// Session Attributes 

function getMemoryAttributes() {   const memoryAttributes = {
       "history":[],

       "launchCount":0,
       "lastUseTimestamp":0,

       "lastSpeechOutput":{},
       "nextIntent":[],
       "playerName": "anonymous"
       // "favoriteColor":"",
       // "name":"",
       // "namePronounce":"",
       // "email":"",
       // "mobileNumber":"",
       // "city":"",
       // "state":"",
       // "postcode":"",
       // "birthday":"",
       // "bookmark":0,
       // "wishlist":[],
   };
   return memoryAttributes;
};

const maxHistorySize = 20; // remember only latest 20 intents 


// 1. Intent Handlers =============================================


const SetPlayerName_Handler =  {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'SetPlayerName';
            // && getPreviousIntent((handlerInput.attributesManager.getSessionAttributes() === "LaunchRequest"));
    },
    handle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        const responseBuilder = handlerInput.responseBuilder;
        let sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

        let say = '';

        let slotStatus = '';
        let resolvedSlot;

        let slotValues = getSlotValues(request.intent.slots); 
        if (slotValues.name.heardAs) {
            sessionAttributes["playerName"] = slotValues.name.heardAs;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            slotStatus += ' Saving your name as ' + slotValues.name.heardAs + '. The goal of this game is to roll the dice and increase your score.  When you roll a 1, your score will be dropped back down to 0. To start a brand new round say, Roll.  To hear the high scores say, Leaderboard';
        } else {
            slotStatus += 'slot name is empty. ';
        }
        if (slotValues.name.ERstatus === 'ER_SUCCESS_MATCH') {
            slotStatus += 'a valid ';
            if(slotValues.name.resolved !== slotValues.name.heardAs) {
                slotStatus += 'synonym for ' + slotValues.name.resolved + '. '; 
                } else {
                slotStatus += 'match. '
            } // else {
                //
        }
        if (slotValues.name.ERstatus === 'ER_SUCCESS_NO_MATCH') {
            slotStatus += 'which did not match any slot value. ';
            console.log('***** consider adding "' + slotValues.name.heardAs + '" to the custom slot type used by slot name! '); 
        }

        if( (slotValues.name.ERstatus === 'ER_SUCCESS_NO_MATCH') ||  (!slotValues.name.heardAs) ) {
            slotStatus += 'A few valid values are, ' + sayArray(getExampleSlotValues('SetPlayerName','name'), 'or');
        }

        say += slotStatus;


        return responseBuilder
            .speak(say)
            .reprompt('try again, ' + say)
            .getResponse();
    },
};


const Roll_Handler =  {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'Roll' ;
    },
    handle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        const responseBuilder = handlerInput.responseBuilder;
        let sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        /*SESSION ATTRIBUTES
            sessionAttributes.favoriteColor = favoriteColor;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        */
        
        let say = '';
        
        //roll the dice and get the value
        let rollValue = Math.floor( Math.random() * 6 ) +1;
        let prevScore = GetScoreFromAttribs(sessionAttributes);
        console.log("Session Attribs: " + JSON.stringify(sessionAttributes));
        console.log("Roll value: " + rollValue);
        console.log("Prev score: " + prevScore);
        
        //if rolled a 1
        if (rollValue == 1)
        {
            sessionAttributes["score"] = 0;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            say = "You have rolled a 1, resetting your score to 0. Unlucky. To start a brand new round say, Roll.  To hear the high scores say, Leaderboard";
        }
        else
        {
            //add roll value to score
            let score = rollValue + prevScore;
            
            sessionAttributes["score"] = score;
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

            say = "You have rolled a " + rollValue + ", increasing your score to " + score + ".  Your old score was " + prevScore;
            
            //say: "(SFX) You have rolled a ${rollValue}, increasing your score to ${score}."  //POTENTIALLY ADD <audio> You have made it to the Top 10, congratulations # ${rank}
        }
        
        return responseBuilder
            .speak("<audio src=\"soundbank://soundlibrary/rocks/throw/throw_05\"/>" + say)
            .reprompt('try again, ' + say)
            .getResponse();
    },
};


const CashOut_Handler =  {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'CashOut' ;
    },
    handle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        const responseBuilder = handlerInput.responseBuilder;
        let sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        let say = '';
        let currentScore = GetScoreFromAttribs(sessionAttributes);
        
        //reset attribute score to 0
        sessionAttributes["score"] = 0;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        
        //check if made leaderboard
        let playerId = handlerInput.requestEnvelope.session.user.userId;
        let playerName = sessionAttributes.playerName;
        console.log("Player id: " + playerId);
        var docClient = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
            
            
        return new Promise((resolve, reject) => {
            var params = {
                TableName : TABLE_NAME,
            };
            docClient.scan(params, function(err, leaderboardData) {
            if (err) {
                console.error("Unable to query leaderboard. Error:", JSON.stringify(err, null, 2));
                reject();
            } 
            else 
            {
                let wasAddedToLeaderboard = false;
                console.log("Query succeeded.");
                leaderboardData.Items.forEach( (item) =>  
                        {
                            console.log("LB: " + item.score + " named " + item.playerName);
                        });
                        console.log("Len: " + leaderboardData.Items.length);
                //there's nothing in the leaderboard
                if (leaderboardData.Items.length < 10)
                {
                    wasAddedToLeaderboard = true;
                    AddToLeaderboard(docClient, currentScore, playerId, playerName, request.requestId);
                }
                else
                {
                    //sort the leaderboard to find the lowest score
                    leaderboardData.Items.sort((a, b) => (a.score > b.score) ? 1 : -1);
                    leaderboardData.Items.forEach( (item) =>  
                        {
                            console.log("LB: " + item.score + " named " + item.playerName);
                        });
                    console.log("Lowest: "+ leaderboardData.Items[0]);
                    let lowestItem = leaderboardData.Items[0];
                    //this score should be added to the leaderboard
                    if (lowestItem.score <= currentScore)
                    {
                        wasAddedToLeaderboard = true;
                        RemoveFromLeaderboard(docClient, lowestItem);
                        AddToLeaderboard(docClient, currentScore, playerId, playerName, request.requestId);
                    }
                }
                
                if (wasAddedToLeaderboard)
                {
                    resolve(responseBuilder
                        .speak("<audio src=\"soundbank://soundlibrary/magic_spells/magic_spells_14\"/> " + "Congratulations you were added to the top 10 leaderboard with a score of " + currentScore + ". To start a new game you can say, Roll or Leaderboard to hear the top scores")
                        .reprompt('try again, ' + say)
                        .getResponse());
                }
                
                else
                {
                    resolve(responseBuilder
                        .speak("You cashed out with a score of " +currentScore + ".  The leaderboard starts at " + leaderboardData.Items[0].score)
                        .reprompt('try again, ' + say)
                        .getResponse());

                    }
                }
              
            });
            
            
        });
    },
};

const HearLeaderboard_Handler =  {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'HearLeaderboard' ;
    },
    handle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        const responseBuilder = handlerInput.responseBuilder;
        let sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

        let say = 'Hello from HearLeaderboard. ';
        let docClient = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
        let playerId = handlerInput.requestEnvelope.session.user.userId;


        return new Promise((resolve, reject) => {
            var params = {
                TableName : TABLE_NAME,
            };
            docClient.scan(params, function(err, leaderboardData) 
            {
                if (err) {
                    console.error("Unable to query leaderboard. Error:", JSON.stringify(err, null, 2));
                    reject();
                } 
                else 
                {
                    console.log("Query succeeded.");
                    //there's nothing in the leaderboard
                    if (leaderboardData.Items.length == 0)
                    {
                        resolve(responseBuilder
                            .speak("The top 10 leaderboard is currently empty.")
                            .reprompt('try again, ' + say)
                            .getResponse());
                        return;
                    }
                    else
                    {
                        let leaderBoardList = "";
                        //sort the leaderboard to find the lowest score
                        leaderboardData.Items.sort((a, b) => (a.score < b.score) ? 1 : -1);
                        leaderboardData.Items.forEach( (item) =>  
                        {
                            leaderBoardList += item.playerName + " with " + item.score + " points. ";
                        });
                        
                        resolve(responseBuilder
                            .speak("The leaderboard currently looks like this. " + leaderBoardList)
                            .reprompt('try again, ' + say)
                            .getResponse());
                        
                    }
                }
            });
            
        });
    },
};

const AddToLeaderboard = function(docClient, currentScore, playerId, playerName, requestId)
{
    //add this one to the leaderboard
    let params = {
        TableName : TABLE_NAME,
        Item: {
            score: currentScore,
            playerId: playerId+requestId,
            playerName: playerName
        }
    }
    
    docClient.put(params, function(err, data)
    {
        if (err) {
            console.error("Unable to add score to leaderboard. Error:", JSON.stringify(err, null, 2));
        }
    });
}

const RemoveFromLeaderboard = function(docClient, entryToRemove)
{
    console.log("removing: " + JSON.stringify(entryToRemove));
    //add this one to the leaderboard
    let params = {
        TableName : TABLE_NAME,
        Key: {
            
            playerId: entryToRemove.playerId
        }
    }
    
    docClient.delete(params, function(err, data)
    {
        if (err) {
            console.error("Unable to remove score from leaderboard. Error:", JSON.stringify(err, null, 2));
        }
    });
}

const GetScoreFromAttribs = function (sessionAttributes)
{
    let prevScore = 0;
    if ("score" in sessionAttributes)
    {
        prevScore = sessionAttributes["score"];
    }
    return prevScore;
}


const AMAZON_CancelIntent_Handler =  {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.CancelIntent' ;
    },
    handle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        const responseBuilder = handlerInput.responseBuilder;
        let sessionAttributes = handlerInput.attributesManager.getSessionAttributes();


        let say = 'Okay, talk to you later! ';

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
        const request = handlerInput.requestEnvelope.request;
        const responseBuilder = handlerInput.responseBuilder;
        let sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

        let intents = getCustomIntents();
        let sampleIntent = randomElement(intents);

        let say = 'Say Set name, followed by your name to set your name.  Say Leaderboard to hear the top 10 scores.  Say '
        + 'Roll to contnue rolling, or say Cash Out to submit your score to the leaderboards.'; 

        return responseBuilder
            .speak(say)
            .reprompt('try again, ' + say)
            .getResponse();
    },
};

const AMAZON_StopIntent_Handler =  {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.StopIntent' ;
    },
    handle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        const responseBuilder = handlerInput.responseBuilder;
        let sessionAttributes = handlerInput.attributesManager.getSessionAttributes();


        let say = 'Okay, talk to you later! ';

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
        let sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

        let say = 'Hello from AMAZON.NavigateHomeIntent. ';


        return responseBuilder
            .speak(say)
            .reprompt('try again, ' + say)
            .getResponse();
    },
};

const LaunchRequest_Handler =  {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === 'LaunchRequest';
    },
    handle(handlerInput) {
        const responseBuilder = handlerInput.responseBuilder;

        let say = 'hello' + ' and welcome to ' + invocationName + ' ! The get started, tell me your name, or say, anonymous.';

        let skillTitle = capitalize(invocationName);


        return responseBuilder
            .speak(say)
            .reprompt('try again, ' + say)
            .withStandardCard('Welcome!', 
              'Hello!\nThis is a card for your skill, ' + skillTitle,
               welcomeCardImg.smallImageUrl, welcomeCardImg.largeImageUrl)
            .getResponse();
    },
};

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

// 3.  Helper Functions ===================================================================

function capitalize(myString) {

     return myString.replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); }) ;
}

 
function randomElement(myArray) { 
    return(myArray[Math.floor(Math.random() * myArray.length)]); 
} 
 
function stripSpeak(str) { 
    return(str.replace('<speak>', '').replace('</speak>', '')); 
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
            switch (filledSlots[item].resolutions.resolutionsPerAuthority[0].status.code) { 
                case 'ER_SUCCESS_MATCH': 
                    slotValues[name] = { 
                        heardAs: filledSlots[item].value, 
                        resolved: filledSlots[item].resolutions.resolutionsPerAuthority[0].values[0].value.name, 
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
 
function getExampleSlotValues(intentName, slotName) { 
 
    let examples = []; 
    let slotType = ''; 
    let slotValuesFull = []; 
 
    let intents = model.interactionModel.languageModel.intents; 
    for (let i = 0; i < intents.length; i++) { 
        if (intents[i].name == intentName) { 
            let slots = intents[i].slots; 
            for (let j = 0; j < slots.length; j++) { 
                if (slots[j].name === slotName) { 
                    slotType = slots[j].type; 
 
                } 
            } 
        } 
         
    } 
    let types = model.interactionModel.languageModel.types; 
    for (let i = 0; i < types.length; i++) { 
        if (types[i].name === slotType) { 
            slotValuesFull = types[i].values; 
        } 
    } 
 
 
    examples.push(slotValuesFull[0].name.value); 
    examples.push(slotValuesFull[1].name.value); 
    if (slotValuesFull.length > 2) { 
        examples.push(slotValuesFull[2].name.value); 
    } 
 
 
    return examples; 
} 
 
function sayArray(myData, penultimateWord = 'and') { 
    let result = ''; 
 
    myData.forEach(function(element, index, arr) { 
 
        if (index === 0) { 
            result = element; 
        } else if (index === myData.length - 1) { 
            result += ` ${penultimateWord} ${element}`; 
        } else { 
            result += `, ${element}`; 
        } 
    }); 
    return result; 
} 
function supportsDisplay(handlerInput) // returns true if the skill is running on a device with a display (Echo Show, Echo Spot, etc.) 
{                                      //  Enable your skill for display as shown here: https://alexa.design/enabledisplay 
    const hasDisplay = 
        handlerInput.requestEnvelope.context && 
        handlerInput.requestEnvelope.context.System && 
        handlerInput.requestEnvelope.context.System.device && 
        handlerInput.requestEnvelope.context.System.device.supportedInterfaces && 
        handlerInput.requestEnvelope.context.System.device.supportedInterfaces.Display; 
 
    return hasDisplay; 
} 
 
 
const welcomeCardImg = { 
    smallImageUrl: "https://s3.amazonaws.com/skill-images-789/cards/card_plane720_480.png", 
    largeImageUrl: "https://s3.amazonaws.com/skill-images-789/cards/card_plane1200_800.png" 
 
 
}; 
 
const DisplayImg1 = { 
    title: 'Jet Plane', 
    url: 'https://s3.amazonaws.com/skill-images-789/display/plane340_340.png' 
}; 
const DisplayImg2 = { 
    title: 'Starry Sky', 
    url: 'https://s3.amazonaws.com/skill-images-789/display/background1024_600.png' 
 
}; 
 
function getCustomIntents() { 
    const modelIntents = model.interactionModel.languageModel.intents; 
 
    let customIntents = []; 
 
 
    for (let i = 0; i < modelIntents.length; i++) { 
 
        if(modelIntents[i].name.substring(0,7) != "AMAZON." && modelIntents[i].name !== "LaunchRequest" ) { 
            customIntents.push(modelIntents[i]); 
        } 
    } 
    return customIntents; 
} 
 
function getSampleUtterance(intent) { 
 
    return randomElement(intent.samples); 
 
} 
 
function getPreviousIntent(attrs) { 
 
    if (attrs.history && attrs.history.length > 1) { 
        return attrs.history[attrs.history.length - 2].IntentRequest; 
 
    } else { 
        return false; 
    } 
 
} 
 
function getPreviousSpeechOutput(attrs) { 
 
    if (attrs.lastSpeechOutput && attrs.history.length > 1) { 
        return attrs.lastSpeechOutput; 
 
    } else { 
        return false; 
    } 
 
} 
 
function timeDelta(t1, t2) { 
 
    const dt1 = new Date(t1); 
    const dt2 = new Date(t2); 
    const timeSpanMS = dt2.getTime() - dt1.getTime(); 
    const span = { 
        "timeSpanMIN": Math.floor(timeSpanMS / (1000 * 60 )), 
        "timeSpanHR": Math.floor(timeSpanMS / (1000 * 60 * 60)), 
        "timeSpanDAY": Math.floor(timeSpanMS / (1000 * 60 * 60 * 24)), 
        "timeSpanDesc" : "" 
    }; 
 
 
    if (span.timeSpanHR < 2) { 
        span.timeSpanDesc = span.timeSpanMIN + " minutes"; 
    } else if (span.timeSpanDAY < 2) { 
        span.timeSpanDesc = span.timeSpanHR + " hours"; 
    } else { 
        span.timeSpanDesc = span.timeSpanDAY + " days"; 
    } 
 
 
    return span; 
 
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
 
 
 
 
const RequestPersistenceInterceptor = { 
    process(handlerInput) { 
 
        if(handlerInput.requestEnvelope.session['new']) { 
 
            return new Promise((resolve, reject) => { 
 
                handlerInput.attributesManager.getPersistentAttributes() 
 
                    .then((sessionAttributes) => { 
                        sessionAttributes = sessionAttributes || {}; 
 
 
                        sessionAttributes['launchCount'] += 1; 
 
                        handlerInput.attributesManager.setSessionAttributes(sessionAttributes); 
 
                        handlerInput.attributesManager.savePersistentAttributes() 
                            .then(() => { 
                                resolve(); 
                            }) 
                            .catch((err) => { 
                                reject(err); 
                            }); 
                    }); 
 
            }); 
 
        } // end session['new'] 
    } 
}; 
 
 
const ResponseRecordSpeechOutputInterceptor = { 
    process(handlerInput, responseOutput) { 
 
        let sessionAttributes = handlerInput.attributesManager.getSessionAttributes(); 
        let lastSpeechOutput = { 
            "outputSpeech":responseOutput.outputSpeech.ssml, 
            "reprompt":responseOutput.reprompt.outputSpeech.ssml 
        }; 
 
        sessionAttributes['lastSpeechOutput'] = lastSpeechOutput; 
 
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes); 
 
    } 
}; 
 
const ResponsePersistenceInterceptor = { 
    process(handlerInput, responseOutput) { 
 
        const ses = (typeof responseOutput.shouldEndSession == "undefined" ? true : responseOutput.shouldEndSession); 
 
        if(ses || handlerInput.requestEnvelope.request.type == 'SessionEndedRequest') { // skill was stopped or timed out 
 
            let sessionAttributes = handlerInput.attributesManager.getSessionAttributes(); 
 
            sessionAttributes['lastUseTimestamp'] = new Date(handlerInput.requestEnvelope.request.timestamp).getTime(); 
 
            handlerInput.attributesManager.setPersistentAttributes(sessionAttributes); 
 
            return new Promise((resolve, reject) => { 
                handlerInput.attributesManager.savePersistentAttributes() 
                    .then(() => { 
                        resolve(); 
                    }) 
                    .catch((err) => { 
                        reject(err); 
                    }); 
 
            }); 
 
        } 
 
    } 
}; 
 
 
 
// 4. Exports handler function and setup ===================================================
const skillBuilder = Alexa.SkillBuilders.custom();
exports.handler = skillBuilder
    .addRequestHandlers(
        AMAZON_CancelIntent_Handler, 
        AMAZON_HelpIntent_Handler, 
        AMAZON_StopIntent_Handler, 
        Roll_Handler, 
        AMAZON_NavigateHomeIntent_Handler, 
        CashOut_Handler, 
        HearLeaderboard_Handler, 
        SetPlayerName_Handler, 
        LaunchRequest_Handler, 
        SessionEndedHandler
    )
    .addErrorHandlers(ErrorHandler)
    .addRequestInterceptors(InitMemoryAttributesInterceptor)
    .addRequestInterceptors(RequestHistoryInterceptor)

   // .addResponseInterceptors(ResponseRecordSpeechOutputInterceptor)

 // .addRequestInterceptors(RequestPersistenceInterceptor)
 // .addResponseInterceptors(ResponsePersistenceInterceptor)

 // .withTableName("askMemorySkillTable")
 // .withAutoCreateTable(true)

    .lambda();


// End of Skill code -------------------------------------------------------------
// Static Language Model for reference

const model = {
  "interactionModel": {
    "languageModel": {
      "invocationName": "high roller",
      "intents": [
        {
          "name": "AMAZON.CancelIntent",
          "samples": []
        },
        {
          "name": "AMAZON.HelpIntent",
          "samples": []
        },
        {
          "name": "AMAZON.StopIntent",
          "samples": []
        },
        {
          "name": "Roll",
          "slots": [],
          "samples": [
            "let it ride",
            "let's roll",
            "i want to roll",
            "roll please",
            "roll"
          ]
        },
        {
          "name": "AMAZON.NavigateHomeIntent",
          "samples": []
        },
        {
          "name": "CashOut",
          "slots": [],
          "samples": [
            "stop game",
            "exit",
            "cash out"
          ]
        },
        {
          "name": "HearLeaderboard",
          "slots": [],
          "samples": [
            "high scores",
            "what are the high scores",
            "what is the leaderboard",
            "what's the leaderboard",
            "leaderboard"
          ]
        },
        {
          "name": "SetPlayerName",
          "slots": [
            {
              "name": "name",
              "type": "AMAZON.FirstName"
            }
          ],
          "samples": [
            "my name is {name}"
          ]
        },
        {
          "name": "LaunchRequest"
        }
      ],
      "types": []
    }
  }
};

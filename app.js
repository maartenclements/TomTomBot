// START Microsoft Bot Framework setup

//Install dependencies 
"use strict";
var builder = require('botbuilder');
var restify = require('restify');
var request = require('request');

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

//Create chat bot 
var connector = new builder.ChatConnector({
    appId: process.env['MicrosoftAppId'],
    appPassword: process.env['MicrosoftAppPassword']
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen())

// END Microsoft Bot Framework setup


// START TomTom API related Functions

// Convert String Address to Geo Location
var getGeo = function (location, func) {
    // Return into func the actual Geo value of the string address.

    request("https://api.tomtom.com/search/2/geocode/" + encodeURI(location) + ".json?key=" + process.env['TomTomAPIKey'],
        function (error, response, body) {
            //console.log('error:', error); // Print the error if one occurred 
            //console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received 
            //console.log('body:', body); // Print what was returned

            // TO DO: Add error checking

            var value = JSON.parse(body);

            console.log("DEBUG INFO: Called Geocode API on " + location + ", returned value:", value)

            var position;
            var freeformAddress;

            if (value) {
                if (value.results) {
                    if (value.results[0]) {
                        if (value.results[0].position) {
                            position = value.results[0].position.lat + "," + value.results[0].position.lon;
                        }

                        if (value.results[0].address) {
                            freeformAddress = value.results[0].address.freeformAddress;
                        }
                    }
                }
            }

            if (position && freeformAddress)
                func(freeformAddress, position);
            else
                func("ERROR", "ERROR"); // TO DO: Add better error messaging
        });

}

// Bot dialog to display results
bot.dialog('/results', [
    function (session, route) {
        //console.log("DEBUG INFO: User " + session.message.user.id + " route var dump: " + JSON.stringify(route));

        request("https://api.tomtom.com/routing/1/calculateRoute/" + route.startGeo + ":" + route.destGeo + "/json?key=" + process.env['TomTomAPIKey'] + "&computeTravelTimeFor=all&arriveAt=" + route.destTime,
            function (error, response, body) {
                //console.log('error:', error); // Print the error if one occurred 
                //console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received 
                //console.log('body:', body); // Print what was returned

                // TO DO: Add error checking

                var value = JSON.parse(body);

                console.log("DEBUG INFO: User " + session.message.user.id + " called Routing API, returned value:", value);

                if (value) {
                    if (value.error) {
                        session.send("ERROR! TomTom API returned: " + value.error.description);
                    }
                    else {
                        var departureTime;
                        var noTrafficTravelTimeInSeconds, historicTrafficTravelTimeInSeconds, liveTrafficIncidentsTravelTimeInSeconds;

                        if (value.routes) {
                            if (value.routes[0]) {
                                if (value.routes[0].summary) {
                                    console.log("DEBUG INFO: User " + session.message.user.id + " summary value:", value.routes[0].summary);

                                    departureTime = value.routes[0].summary.departureTime;
                                    noTrafficTravelTimeInSeconds = value.routes[0].summary.noTrafficTravelTimeInSeconds;
                                    historicTrafficTravelTimeInSeconds = value.routes[0].summary.historicTrafficTravelTimeInSeconds;
                                    liveTrafficIncidentsTravelTimeInSeconds = value.routes[0].summary.liveTrafficIncidentsTravelTimeInSeconds;
                                }
                            }
                        }

                        if (departureTime) {
                            var dateObject = new Date(departureTime);

                            session.send("Thanks to the TomTom Routing API, I know that (assuming no traffic) it will take you " + secondsToHHMMSS(noTrafficTravelTimeInSeconds) +
                                " to get there. However, historic traffic data suggests it will actually take " + secondsToHHMMSS(historicTrafficTravelTimeInSeconds) +
                                ". Current live traffic reports estimate " + secondsToHHMMSS(liveTrafficIncidentsTravelTimeInSeconds) +
                                ". Thus, in order to get to you destination on time, I suggest leaving by " + dateObject.toString() + "! ");


                        }
                        else {
                            session.send("ERROR! For some reason, I could not calculate departure time. Sorry!");
                        }
                    }
                }
                else {
                    session.send("ERROR! Bot did not get valid JSON back from TomTom API.");
                }

                session.endDialog();
            });

    }
]);

// END TomTom API related functions


// START Conversion Functions

var secondsToHHMMSS = function (str) {
    var num = parseInt(str, 10);
    var hours = Math.floor(num / 3600);
    var minutes = Math.floor((num - (hours * 3600)) / 60);
    var seconds = num - (hours * 3600) - (minutes * 60);

    if (hours < 10) { hours = "0" + hours; }
    if (minutes < 10) { minutes = "0" + minutes; }
    if (seconds < 10) { seconds = "0" + seconds; }
    return hours + ':' + minutes + ':' + seconds;
}

// END ConversionFunctions


// START Main Microsoft Bot Framework dialogs

// Initial dialog
bot.dialog('/', [
    function (session) {
        session.send("Hello! Welcome to the TomTom Online Routing API Bot Framework demo. I can tell you when you need to leave in order to arrive at your destination on time.");

        if (session.userData.route == null) {
            session.userData.route = {}
        }
        session.beginDialog("/demo")
    }
]);

// Demo dialog
bot.dialog('/demo', [
    function (session) {
        //console.log("DEBUG INFO: User "+session.message.user.id+" Userdata dump: "+JSON.stringify(session.userData.route));

        session.beginDialog("/getLocation", true);
    },
    function (session, results) {
        session.beginDialog("/getLocation", false);
    },
    function (session, results) {
        session.beginDialog("/getTime");
    },
    function (session, results) {
        var dateObject = new Date(session.userData.route.destTime);
        session.send("You want to arrive by " + dateObject.toString());

        session.beginDialog("/results", session.userData.route);
    },
    function (session, results) {

        builder.Prompts.choice(session, "Would you like to calculate another route?",
            ["Yes", "Yes, but forget everything I told you before", "No, not right now"]);

    },
    function (session, results) {
        if (results.response.entity == "Yes") {
            session.replaceDialog('/demo')
        }
        else if (results.response.entity == "Yes, but forget everything I told you before") {
            session.userData.route = {};

            session.replaceDialog('/demo');
        }
        else {
            session.send("No? Ok! If you change your mind, send me another message");
            session.endDialog();
        }
    }
]);

// A dialog to get a location
bot.dialog('/getLocation', [
    function (session, direction, next) {
        session.dialogData.direction = direction;

        var str;

        if (direction) {
            session.dialogData.location = session.userData.route.start;

            str = "Are you starting your journey from \"";
        }
        else {
            session.dialogData.location = session.userData.route.dest;

            str = "Are you traveling to \"";
        }

        if (session.dialogData.location) {
            builder.Prompts.confirm(session, str + session.dialogData.location + "\" again?");
        }
        else {
            next(); // Skip to asking if we don't have the location
        }
    },
    function (session, results) {
        if (results.response) {
            session.endDialogWithResult({
                response: { noChange: true }
            });
        }
        else {
            var str;

            if (session.dialogData.direction) {
                str = "you'd like to start from:";
            }
            else {
                str = "of where you'd like to go:";
            }
            builder.Prompts.text(session, "Enter an address " + str);
        }
    },
    function (session, results) {
        if (results.response) {
            getGeo(results.response, function (address, addressGeo) {
                if (address == "ERROR") {
                    session.send("ERROR! Could not validate address.")
                    session.replaceDialog('/getLocation', session.dialogData.direction);
                }
                else {
                    if (session.dialogData.direction) {
                        session.userData.route.start = address;
                        session.userData.route.startGeo = addressGeo;
                    }
                    else {
                        session.userData.route.dest = address;
                        session.userData.route.destGeo = addressGeo;
                    }

                    session.send("Thanks to the TomTom Geocoding API, I think you mean \"" + address +
                        "\" which I know is located at " + addressGeo);

                    session.endDialogWithResult({
                        response: { input: results.response, address: address, addressGeo: addressGeo }
                    });
                }
            });
        } else {
            session.endDialogWithResult({
                resumed: builder.ResumeReason.notCompleted
            });
        }
    }
]);

// A dialog to get the desired arrive by time
bot.dialog('/getTime', [
    function (session) {
        builder.Prompts.time(session, "What time would you like to get there by?");
    },
    function (session, results) {
        if (results.response) {
            var t = builder.EntityRecognizer.resolveTime([results.response]);

            var now = new Date();

            if (t > now) {
                session.dialogData.time = t.toISOString(); //Storing date object as String
                // To get back as Date object: var dateObject = new Date(session.userData.route.time);

                // Return time  
                if (session.dialogData.time) {
                    session.userData.route.destTime = session.dialogData.time;

                    session.endDialogWithResult({
                        response: { time: session.dialogData.time }
                    });
                } else {
                    session.endDialogWithResult({
                        resumed: builder.ResumeReason.notCompleted
                    });
                }
            }
            else {
                session.send("ERROR! Time must be in the future. (My default timezone is GMT)");
                session.replaceDialog('/getTime');
            }
        }
        else {
            // Possibly redundant?
            session.send("ERROR! Could not understand time.");
            session.replaceDialog('/getTime');
        }
    }
]);

// END Main Microsoft Bot Framework dialogs

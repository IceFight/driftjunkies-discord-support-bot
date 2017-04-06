const Discord = require("discord.js");
const client = new Discord.Client();
const SteamID = require('steamid');


const sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database("database.db", sqlite3.OPEN_READONLY);

var helpCommands = ["!help", "Get all commands and explanation",
	"!info [username | steamid]", "Get general information about the user",
	"!myreports", "Get all your wrong doings. !!! Needs a link from discord to steam !!!"];

var generalchat;
var botlog;
var users;

var waitingForAnswer = [];

client.on('ready', () => {
	
	let myGuild = client.guilds.find("name", "Test");
	botlog = myGuild.channels.find("name", "botlog");
	
	writeLog(`Logged in as ${client.user.username}!`);
	writeLog("Setting up unnecessary information", "header");
	client.user.setGame("pm me with !help");
	writeLog("set Game: " + client.user.presence.game.name);
	writeLog("Fetching information", "header");
	generalchat = client.channels.find("name", "general"); 
	writeLog("Got generalchat: " + generalchat.id);
	users = client.users;
	writeLog("Got " + users.array().length + " user");
	writeLog("Bot Started", "header");
	writeLog("Waiting for requests...");
});

client.on('message', (msg) => {
	//if(msg.channel.type == "dm" && msg.author.username != client.user.username) {
	if(msg.channel.type == "dm" && msg.content.indexOf("!") == 0) {
		if(msg.content.indexOf("!info ") == 0) {
			getInfo(msg);
		} else if (msg.content == "!myreports") {
			getReports(msg);
		} else if(msg.content == "!help") {
			getHelp(msg);
		} else if(msg.content == "!yes") {
			checkWaitingAnswers(msg);
		} else if(msg.content == "!no") {
			deleteWaitingAnswer(msg);
		} else {
			unknownCommand(msg);
		}
	}
});

client.on('disconnect', () => {
	console.log("Disconnected");
});

function getReports(msg) {
	console.log("");
	msg.author.fetchProfile().then((profile) => {
		var steamConnection = profile.connections.find("type", "steam");
		writeLog("Got !myreports request from: " + msg.author.username);
		if(steamConnection) {
			var weirdSteamId = new SteamID(steamConnection.id);
			var steamIdLink = SteamID.fromIndividualAccountID(weirdSteamId.accountid);
			var steamid = steamIdLink.getSteamID64();
			
			writeLog("Found linked steamId: " + steamid, "subtask");
			
			db.serialize(function() {
				db.all("SELECT reports.reason, drivers.name, reports.date_report FROM drivers INNER JOIN reports ON drivers.sqlid = reports.target_sqlid WHERE drivers.steamid = ?", [steamid], (err, rows) => {
					if(err) {
						console.log("ERROR: " + err);
					}
					if(rows.length > 0) {
						for(i=0; i<rows.length; i++) {
							var row = rows[i];
							var d = new Date(rows[i].date_report * 1000);
							writeReply(msg, ["Reason", rows[i].reason, "Date", d.toGMTString()]);
							writeLog("Entry found, replying with information", "subtask");
						}
					} else {
						writeReply(msg, ["Nothing there...", "There are no reports against you. Congratulation!"]);
						writeLog("steamId " + steamid + " not found", "subtask");
					}
				});
			});
		} else {
			writeLog("Could not fetch steamid. Replying with information: HOW TO USE", "subtask");
			writeReply(msg, ["I coudn't find a link to Steam" ,"To use this function you have to link your Steam account to discord. Please make sure to checkmark the option display on profile"]);
		}
	});	
}

function writeReply(msg, field, title) {
	
	var Embed = new Discord.RichEmbed();
	
	Embed.setTitle(title ? title :  "");
	Embed.setColor("#ffffff");
	for(i=0; i<field.length; i=i+2) {
		Embed.addField(field[i], "```" + field[i + 1] + "```");
	}
	msg.channel.sendEmbed(Embed);
}

function getHelp(msg) {
	console.log("");
	writeLog("Got !help request from: " + msg.author.username, "task");
	writeLog("Replying with help commands", "subtask");
	var array = [];
	for(i = 0; i<helpCommands.length; i=i+2) {
		array.push(helpCommands[i], helpCommands[i+1]);
	}
	writeReply(msg, array);
	
}

function getInfo(msg) {
	var userArg = escape(msg.content.substr(msg.content.indexOf(" ") + 1, msg.content.length));
	userArg = userArg.replace("%20", " ");
	userArg = userArg.replace("%25", "");
	console.log("");
	writeLog("Got !info request from " + msg.author.username + " with arg: " + userArg);
	db.serialize(function() {
		db.all("SELECT * FROM drivers WHERE steamid = ? OR name LIKE ? ORDER BY minutes_online DESC", [userArg, userArg], (err, rows) => {
			if(err) {
				console.log("ERROR: " + err);
			}
			if(rows.length > 1 && rows.length <= 20) {
				var index = waitingForAnswer.indexOf(msg.author);
				if(index == -1) {
					waitingForAnswer.push(msg.author, rows);
				} else {
					waitingForAnswer[index] = msg.author;
					waitingForAnswer[index + 1] = rows;
				}
				writeLog("Got " + rows.length + " results. Asking author to continue.");
				writeReply(msg, ["I found " + rows.length + " results", "Do you wanna get all results? Answer with `!yes` or `!no` to proceed."]);
			} else if(rows.length == 1) {
				writeLog("Replying the information.", "subtask");
				sendInformation(msg, rows[0]);
			} else {
				writeReply(msg, ["Nothing there...", "The searched user does not exist or was never on our server."]);
				writeLog("user not found", "subtask");
			}
		});
	});
}

function sendInformation(msg, row) {
	var Embed = new Discord.RichEmbed();
	Embed.addField("Name", row.name);			
	Embed.addField("Time played on Driftjunkies", getTime(row.minutes_online));
	var d = new Date(row.date_disconnect * 1000);
	Embed.addField("Last seen",  d.toGMTString());			
	Embed.setColor("#25aac5");
	msg.channel.sendEmbed(Embed);
	writeLog("Entry found, replying with information", "subtask");
}

function deleteWaitingAnswer(msg) {
	console.log("");
	writeLog("Got an answer from: " + msg.author.username);
	var index = waitingForAnswer.indexOf(msg.author);
	if(index != -1) {
		waitingForAnswer.splice(index, 2);
		writeLog("Deleted answer for: " +  index, "subtask");
		writeReply(msg, ["You answered with !no", "Your results got deleted. Have a nice day!"]);
	}
}

function checkWaitingAnswers(msg) {
	console.log("");
	writeLog("Got an answer from: " + msg.author.username);
	var index = waitingForAnswer.indexOf(msg.author);
	if(index != -1) {
		writeLog("Found question asked: " + index, "subtask");
		var rows = waitingForAnswer[index + 1];
		if(rows) {
			for(i=0; i<rows.length; i++) {
				var row = rows[i];
				sendInformation(msg, row);
			}
		}
		waitingForAnswer.splice(index, 2);
	} else {
		writeLog("No question found", "subtask");
		writeReply(msg, ["Did I ask you something?", "I don't remeber."]);
		msg.reply("Did I ask you something? I don't remeber.");
	}
}

function getTime(minutes) {
	var hours = 0;
	var days = 0;
	var weeks = 0;
	if(minutes >= 60) {
		hours = Math.floor(minutes / 60);
		minutes = minutes - (hours * 60);
		if(hours >= 24) {
			days = Math.floor(hours / 24);
			hours = hours - (days * 24);
			if(days >= 7) {
				weeks = Math.floor(days / 7);
				days = days - (weeks * 7);
			}
		}
	}
	return weeks + " weeks " + days + " days " + hours + " hours " + minutes + " minutes";
}

function unknownCommand(msg) {
	writeLog("Unknown command recieved from: " + msg.author.username, "subtask")
	msg.reply("I'm sorry. I don't know this command. Enter `!help` or `/help` for all commands.");
}

function writeLog(message, type) {
	if(!type) {
		type = "task";
	}
	var directionsymbol = "> ";
	switch (type) {
		case "task":
			directionsymbol = "> ";
			break;
		case "subtask":
			directionsymbol = ".....> ";
			break;
		case "subtaskerror":
			directionsymbol = ".....!! ";
			break;
		case "header":
			console.log("");
			var realLength = (46- message.length);
			var realMessage = ""
			for(i = 0; i<realLength; i++) {
				if(i == Math.floor(realLength / 2)) {
					realMessage = realMessage + message;
				}
				realMessage = realMessage + "-"
			}
			message = realMessage;
			directionsymbol = "";
			break;
	}
	botlog.sendMessage(directionsymbol + message);
	console.log(directionsymbol + message);
}


client.login("");




















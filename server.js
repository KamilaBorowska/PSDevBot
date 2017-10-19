"use strict";

var format = require('python-format');
var request = require('request');
var port = +process.env.npm_package_config_webhookport;
var Showdown = require('./showdown');
var parameters = {};
var secret = process.env.npm_package_config_secret;
var client = new Showdown(parameters);
var allowedAuthLevels = new Set("~#*&@%");
var escape = require('escape-html');
var updates = {};
var gitBans = new Set;
var github = require('githubhook')({
	port: port,
	secret: secret,
	logger: console,
});

if (!port) {
	console.error("Start the bot using 'npm start'.");
	return;
}

if (!secret) {
	console.error("Secret not defined, please use 'npm config set psdevbot:secret value'.");
	return;
}

Object.keys(Showdown.keys).forEach(function (key) {
	parameters[key] = process.env[`npm_package_config_${key}`];
});


client.connect();

function shorten(url, callback) {
	function shortenCallback(error, response) {
		var shortenedUrl = url;
		if (!error && response.headers.location) {
			shortenedUrl = response.headers.location;
		}
		callback(shortenedUrl);
	}
	request.post('https://git.io', {form: {url: url}}, shortenCallback);
}

function getRepoName(repo) {
	switch (repo) {
	case 'Pokemon-Showdown':
		return 'server';
	case 'Pokemon-Showdown-Client':
		return 'client';
	case 'Pokemon-Showdown-Dex':
		return 'dex';
	default:
		return repo;
	}
}


github.on('push', function push(repo, ref, result) {
	var url = result.compare;
	var branch = /[^/]+$/.exec(ref)[0];
	shorten(url, function pushShortened(url) {
		var messages = [];
		var message = result.commits.length === 1 ?
			"[<font color='FF00FF'>{}</font>] <font color='909090'>{}</font> {} <b>{}</b> new commit to <font color='800080'>{}</font>: <a href=\"{5}\">{5}</a>" :
			"[<font color='FF00FF'>{}</font>] <font color='909090'>{}</font> {} <b>{}</b> new commits to <font color='800080'>{}</font>: <a href=\"{5}\">{5}</a>";

		messages.push(format(
			message,
			escape(getRepoName(repo)),
			escape(result.pusher.name),
			result.created ? 'pushed <font color="red">in new branch</font>' : result.forced ? '<font color="red">force-pushed</font>' : 'pushed',
			escape(result.commits.length),
			escape(branch),
			escape(url)
		));
		result.commits.forEach(function (commit) {
			var commitMessage = commit.message;
			var shortCommit = /.+/.exec(commitMessage)[0];
			if (commitMessage !== shortCommit) {
				shortCommit += '…';
			}
			messages.push(format(
				"<font color='FF00FF'>{}</font>/<font color='800080'>{}</font> <a href=\"{}\"><font color='606060'>{}</font></a> <font color='909090'>{}</font>: {}",
				escape(getRepoName(repo)),
				escape(branch),
				escape(commit.url),
				escape(commit.id.substring(0, 6)),
				escape(commit.author.name),
				escape(shortCommit)
			));
		});
		client.report('/addhtmlbox ' + messages.join("<br>"));
	});
});

github.on('pull_request', function pullRequest(repo, result) {
	if (gitBans.has(result.sender.login.toLowerCase()) || gitBans.has(result.pull_request.user.login.toLowerCase())) {
		return;
	}
	var COOLDOWN = 10 * 60 * 1000;
	var requestNumber = result.pull_request.number;
	var url = result.pull_request.html_url;
	var action = result.action;
	if (action === 'synchronize') {
		action = 'updated';
	}
	if (action === 'review_requested') {
		action = 'requested a review for';
	}
	// Nobody cares about labels
	if (action === 'labeled' || action === 'unlabeled') {
		return;
	}
	var now = +new Date;
	if (updates[requestNumber] && updates[requestNumber] + COOLDOWN > now) {
		return;
	}
	updates[requestNumber] = now;
	shorten(url, function pullRequestShortened(url) {
		client.report(format(
			"/addhtmlbox [<font color='FF00FF'>{}</font>] <font color='909090'>{}</font> {} pull request <a href=\"{}\">#{}</a>: {}",
			escape(getRepoName(repo)),
			escape(result.sender.login),
			escape(action),
			escape(url),
			escape(requestNumber),
			escape(result.pull_request.title)
		));
	});
});

client.on('message', function (user, message) {
	if (allowedAuthLevels.has(user.charAt(0)) && message.charAt(0) === '.') {
		var parts = message.substring(1).split(' ');
		var command = parts[0];
		var argument = parts.slice(1).join(" ").toLowerCase();
		if (command === "gitban") {
			if (gitBans.has(argument)) {
				client.report(`/modnote '${argument}' is already banned from being reported`);
				return;
			}
			gitBans.add(argument);
			client.report(`/modnote '${argument}' was banned from being reported by this bot`);
		} else if (command === "gitunban") {
			if (!gitBans.has(argument)) {
				client.report(`/modnote '${argument}' is already allowed to be reported`);
				return;
			}
			gitBans.delete(argument);
			client.report(`/modnote '${argument}' was unbanned from being reported by this bot`);
		}
	}
});

github.listen();

/// <reference path="./def/node.d.ts"/>
import Tor61Router = require('./Tor61Router');
import Constant = require('./Constant');
var cluster = require('cluster');

if (process.argv.length < 5) {
	throw 'Invalid number of arguments';
}


var group = parseInt(process.argv[2]);
var instance = parseInt(process.argv[3]);
var port = parseInt(process.argv[4]);

if (isNaN(port) || isNaN(instance) || isNaN(group)) {
	throw 'Illegal argument format!';
}


var router: Tor61Router = new Tor61Router(group, instance, port);

process.on('uncaughtException', (err) => {
	// We recieved an error, so shut down the router
	// to exhaust the async queue
	router.shutdown();

	// Router in error state.
	console.log('Router in error state. Commiting suicide.');
	process.exit(1);
});

process.on('error', (err) => {
	// We recieved an error, so shut down the router
	// to exhaust the async queue
	router.shutdown();

	// Router in error state.
	console.log('Router in error state. Commiting suicide.');
	process.exit(1);
});

router.reboot();
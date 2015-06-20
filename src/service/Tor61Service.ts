/// <reference path="../def/node.d.ts"/>

import events = require('events');

import Constant = require('../Constant');

/**
 * A Tor61Service is a encapsulated unit of functionality
 * which when composed with other services, provides the totality
 * of the Tor61Router functionality.
 */
class Tor61Service extends events.EventEmitter {
	private static ACTIVITY_TIMEOUT: number = 40000;
	private static MONTHS : string[] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	private static LOG_WHITE_LIST: string[] = [
		// Constant.SERVICE_NAMES.CELL,
		Constant.SERVICE_NAMES.CIRCUIT,
		Constant.SERVICE_NAMES.ENTRANCE,
		// Constant.SERVICE_NAMES.ERROR,
		Constant.SERVICE_NAMES.EXIT,
		// Constant.SERVICE_NAMES.PARSING,
		Constant.SERVICE_NAMES.REGISTRATION
		// Constant.SERVICE_NAMES.ROUTING
		// Constant.SERVICE_NAMES.SOCKET
		// Constant.SERVICE_NAMES.PEER_INPUT
	];

	// Activity timers allow us to diagnose when
	// our application may have been shut off.
	private static activityTimeout: any;
	private static watchActivity: boolean;

	// State to know if this service is down
	private isDown: boolean;

	constructor(disableActivityWatch ?: boolean) {
		super();
		Tor61Service.watchActivity = !disableActivityWatch;
		this.isDown = true;
	}

	/**
	 * Shuts down the service
	 */
	public shutdown() {
		this.isDown = true;
	}

	/**
	 * Gets this service's string name
	 * @return {string} The unique name of this service
	 */
	public getName() : string {
		throw 'Service unnamed! Please override the getName method.';
		return 'UnNamedService';
	}

	/**
	 * Called on service start up
	 * @param {Tor61Service[]} peerServices [description]
	 */
	public start(peerServices : Tor61Service[]) {
		this.log('Starting up...');
		for (var i = 0; i < peerServices.length; i++) {
			if (peerServices[i].getName() != this.getName()) {
				this.onBindPeerService(peerServices[i]);
			}
		}
		this.isDown = false;
	}

	/**
	 * Called for each peer service on startup to allow
	 * binding to events, or keeping as state, those services.
	 * @param {Tor61Service} service The peer service
	 */
	protected onBindPeerService(service : Tor61Service) {
		// TODO: any superclass implementation?
	}

	/**
	 * Asynchonously emits an event through the event queue
	 * @param {string} event    The event to emit
	 * @param {any[]}  ...extra The parameters of the event
	 */
	protected aEmit(event : string, ...extra: any[]) {
		var args = arguments;

		this.tick(() => {
			this.emit.apply(this, args);
		});
	}

	/**
	 * Safe way to call process.nextTick for async
	 * event queue placement
	 * @param {Function} fn The function to tick
	 */
	protected tick(fn : Function) {
		setImmediate(() => {
			fn();
		});
	}

	/**
	 * Safe setInteval function
	 * @param {Function} callback The interval function
	 * @param {number} time The timeout
	 */
	protected safeInterval(callback : Function, time : number) {
		if (!this.isDown) {
			return setTimeout(callback, time);
		}
	}

	/**
	 * Logs a message in a pretty way
	 * @param {string} message The message to log
	 */
	protected log(message : string) {
		if (Tor61Service.watchActivity) Tor61Service.onActivity();
		if (Tor61Service.LOG_WHITE_LIST.indexOf(this.getName()) == -1) return;

		var timeStamp = new Date();

		var month = Tor61Service.MONTHS[timeStamp.getMonth()];
		var day = timeStamp.getDate();

		var hour = '' + timeStamp.getHours();
		hour = hour.length > 1 ? hour : '0' + hour;

		var minute = '' + timeStamp.getMinutes();
		minute = minute.length > 1 ? minute : '0' + minute;

		var second = '' + timeStamp.getSeconds();
		second = second.length > 1 ? second : '0' + second;

		var result = day + ' ' + month + ' ' + hour + ':' + minute + ':' + second +
			   		 ' - ' + this.getName() + ' >>> ' + message;

		console.log(result);
	}

	/**
	 * Called when the router has activity. If we don't
	 * have activity often enough, something is wrong and we should reboot.
	 */
	private static onActivity() {
		clearTimeout(Tor61Service.activityTimeout);
		Tor61Service.activityTimeout = setTimeout(() => {
			throw 'Inactivity error: Reboot initiated';
		}, Tor61Service.ACTIVITY_TIMEOUT);
	}
}

export = Tor61Service;
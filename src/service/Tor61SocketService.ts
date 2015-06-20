/// <reference path="../def/node.d.ts"/>

import Tor61Service = require('./Tor61Service');
import Constant = require('../Constant');
import ErrorType = require('../utils/ErrorType');

var uuid = require('node-uuid');
var net = require('net');
var chunkingStreams = require('chunking-streams');

var SizeChunker = chunkingStreams.SizeChunker;
var SeparatorChunker = chunkingStreams.SeparatorChunker;

/**
 * Service to manage Tor61 TCP sockets. Provides an abstracted
 * notion of a connection via a unique connection ID to the rest
 * of the application. Allows safe socket operation to reduce application
 * failure.
 */
class Tor61SocketService extends Tor61Service {
	private static CLIENT_CONNECTION_TIMEOUT: number = 3000;
	private mapping : any;

	constructor(disableActivity ?: boolean) {
		super(disableActivity);
		this.mapping = {};
	}

	/**
	 * Shuts down the service
	 */
	public shutdown() {
		super.shutdown();
		for (var cid in this.mapping) {
			if (this.mapping.hasOwnProperty(cid) && this.mapping[cid]) {
				this.close(cid);
			}
		}
	}

    /**
     * Gets this service's string name
     * @return {string} The unique name of this service
     */
    public getName() : string {
        return Constant.SERVICE_NAMES.SOCKET;
    }

	/**
	 * Begins listening on a open port. Executes callback
	 * with the uuid, server, and port. Returns all null if
	 * there was a problem.
	 * @param {Function} callback [description]
	 */
	public server(callback : Function, port ?: number) : void {
		this.launchServer((server, id) => {
			this.tick(() => {
				if (server){
					callback(id, server, server.address().port);
				} else {
					callback(null, null, null);
				}
			});
		}, port);
	}

	/**
	 * Begins connection to a remote TCP address. Executes callback
	 * with the uuid, and socket. uuid / err will be undefined / null
	 * if there was no problem connecting.
	 * @param {string} host The host
	 * @param {number} port The remote port
	 * @param {Function} callback [description]
	 */
	public client(host : string, port : number, callback : Function) : void {
		this.launchConnection(host, port, (socket, id) => {
			this.tick(() => {
				if (socket) {
					callback(id, socket);
				} else {
					callback(null, null);
				}
			});
		});
	}

	/**
	 * Safely writes to a remote connection. Does nothing
	 * if it is not safe.
	 * @param {string} id The uuid of the connection to write to
	 * @param {Buffer} msg the message to write
	 */
	public write(id : string, msg : Buffer) {
		if (this.mapping[id] && this.mapping[id].write) {
			this.log('Write to: ' + this.mapping[id].remoteAddress);
			try {
				this.mapping[id].write(msg);
			} catch (e) {}
		}
	}

	/**
	 * Safely closes a remote connection. Does nothing
	 * if it is not safe.
	 * @param {string} id The uuid of the connection to close
	 */
	public close(id : string) {
		if (this.mapping[id] && this.mapping[id].close) {
			try {
				this.mapping[id].close((err) => { });
			} catch (e) {}
			this.mapping[id] == undefined;
		} else if (this.mapping[id] && this.mapping[id].end) {
			try {
				this.mapping[id].end((err) => { });
			} catch (e) {}
			this.mapping[id] == undefined;
		}
	}

	/**
	 * Hooks a TOR cell chunker up to a connection and returns it.
	 * @param {string} id The connection
	 * @return {any} The chunker
	 */
	public cellChunker(id : string) {
		if (this.mapping[id]) {
			var chunker = new SizeChunker({
			    chunkSize : Constant.CELL_SIZE,
			    flushTail : false
			});

			this.mapping[id].pipe(chunker);

			return chunker;
		}
	}

	/**
	 * Chunks an http stream on \r\n returning data that is guaranteed to be at least
	 * one whole line of HTTP
	 */
	public httpLineChunker(id : string) {
		if (this.mapping[id]) {
			var chunker = new SeparatorChunker({
			    separator : '\r\n\r\n',
			    flushTail : false
			});

			this.mapping[id].pipe(chunker);

			return chunker;
		}
	}

	public dataStreamer(id : string) {
		if (this.mapping[id]) {
			return this.mapping[id];
		} else {
			this.aEmit('error', ErrorType.BAD_KEY, "DataStreamer accessed with a bad key in SocketService");
		}
	}

	/**
	 * Gets the remote host of a connection id
	 * @param {string} id The connection id
	 * @return {string} The host, if not found null
	 */
	public getRemoteHost(id : string) {
		if (this.mapping[id] && this.mapping[id].remoteAddress) {
			return this.mapping[id].remoteAddress;
		} else {
			return null;
		}
	}

	/**
	 * Gets the remote port of a connection id
	 * @param {string} id The connection id
	 * @return {number} The port, if not found null
	 */
	public getRemotePort(id : string) {
		if (this.mapping[id] && this.mapping[id].remoteAddress) {
			return this.mapping[id].remotePort;
		} else {
			return null;
		}
	}

	/**
	 * Depipes a processor from a connection
	 * @param {string} id The connection
	 * @param {any} The piped
	 */
	public unpipe(id : string, processor : any) {
		if (this.mapping[id] && processor) {
			this.mapping[id].unpipe(processor);
		}
	}

	/**
	 * Generates a unique id to assign to a socket
	 * @return {string} The uuid
	 */
	private generateUUID() : string {
		return uuid.v4() + (new Date().getTime())
	}

	/**
	 * Launches a TCP connection to a remote address
	 * @param {string} host The host
	 * @param {number} port The remote port
	 * @param {Function} callback Callback to call with socket, calls null if connection
	 *                            fails
	 */
	private launchConnection(host : string, port : number, callback : Function) {
		var destination = new net.Socket();
		var id = this.generateUUID();

		destination.setTimeout(Tor61SocketService.CLIENT_CONNECTION_TIMEOUT, () => {
			// Not connected yet?
			if (this.mapping[id] == undefined) {
				callback(null, null);
			}
		});

		destination.on('end', () => {
			this.mapping[id] = undefined;
			this.log('Connection closed (' + id + ') to ' + host + ':' + port);

			this.aEmit('close', id);
			this.aEmit('close:' + id);
		});

		destination.on('error', (err) => {
			this.log('Error connecting to remote ' + host + ':' + port + ' - ' + err);
			// Not connected yet?
			if (this.mapping[id] == undefined) {
				callback(null, null);
			} else {
				this.close(id);
			}
		});

		destination.on('connect', () => {
	    	this.mapping[id] = destination;
	    	this.log('Opened connection (' + id + ') to ' + host + ':' + port);
	    	callback(destination, id);

			this.aEmit('connection', id, destination);
			this.aEmit('connection:' + id, destination);
		});

	    destination.connect(port, host);
	}

	/**
	 * Launches a server on a free port
	 * @param {Function} callback The callback to call with the
	 *                            server
	 */
	private launchServer(callback : Function, port ?: number) {
		var server = net.createServer();

		server.on('listening', () => {
			var id = this.generateUUID();
			this.mapping[id] = server;

			this.log('Created server (' + id + ') on port ' + server.address().port);

			callback(server, id);

			server.on('connection', (socket) => {
				var cid = this.generateUUID();
				this.mapping[cid] = socket;

				this.log('New connection to us (' + cid + ') on server (' + id + ') ');

				socket.on('end', () => {
					this.mapping[cid] = undefined;

					this.log('Connection closed to us (' + cid + ') on server (' + id + ') ');

					this.aEmit('close', id, cid, socket);
					this.aEmit('close:' + id, cid, socket);
				});

				socket.on('error', (err) => {
					this.mapping[cid] = undefined;

					this.log('Connection closed to error (' + cid + ') on server (' + id + ') ');

					this.aEmit('close', id, cid, socket);
					this.aEmit('close:' + id, cid, socket);
					socket.end();
				});

				this.aEmit('connection', id, cid, socket);
				this.aEmit('connection:' + id, cid, socket);
			});

			server.on('close', () => {
				this.log('Server closed (' + id + ')');
				this.mapping[id] = undefined;
			});
		});

		server.on('error', () => {
			server.close();
			this.tick(() => {
				this.launchServer(callback, port);
			});
		});

		server.listen(port ? port : 0);
	}
}

export = Tor61SocketService;
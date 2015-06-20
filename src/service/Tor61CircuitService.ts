/// <reference path="../def/node.d.ts"/>

import Tor61Service = require('./Tor61Service');
import Tor61SocketService = require('./Tor61SocketService');
import Tor61RegistrationService = require('./Tor61RegistrationService');
import Tor61CellService = require('./Tor61CellService');
import Tor61RoutingService = require('./Tor61RoutingService');
import Tor61PeerInputService = require('./Tor61PeerInputService');

import Constant = require('../Constant');

import CellType = require('../utils/CellType');
import RelayCommand = require('../utils/RelayCommand');
import ErrorType = require('../utils/ErrorType');

/**
 * The circuit service handles the administration, creation,
 * and destruction of Tor61 Circuits. It also maintains them,
 * running time analysis to determine if a circuit is no
 * longer optimal and should be closed.
 */
class Tor61CircuitService extends Tor61Service {
	private static START_UP_HOPS : number = 2;
	private static BOGUS_HOST: string = '__not_real_lol__:9992';
	private static KNOWN_HOST: string = 'aaronnech.com:80';
	private static CIRCUIT_TEST_TIMEOUT: number = 1500;
	private static CIRCUIT_TEST_INTERVAL: number = 7000;

	private socketService : Tor61SocketService;
	private registrationService : Tor61RegistrationService;
	private cellService : Tor61CellService;
	private routerService : Tor61RoutingService;
	private inputService: Tor61PeerInputService;

	// Circuit state
	private routers : any[];
	private connections : any;
	private circuitNumberType : any;
	private connectionToRouter : any;
	private startCircuitNumber: number;
	private startRouter: any;
	private peerServer: string;

	private testTimeout: any;

	private oddCount : number;
	private evenCount : number;

	constructor() {
		super();

		this.connections = {};
		this.circuitNumberType = {};
		this.connectionToRouter = {};

		this.oddCount = 1;
		this.evenCount = 2;

		this.startCircuitNumber = null;
		this.startRouter = null;
		this.peerServer = null;
		this.testTimeout = null;
	}

	/**
	 * Called on service start up
	 * @param {Tor61Service[]} peerServices [description]
	 */
	public start(services : Tor61Service[]) {
		super.start(services);

		this.openPeerServer();
	}

	public shutdown() {
		super.shutdown();
		if (this.socketService)
			this.socketService.close(this.peerServer);
	}

	/**
	 * Called for each peer service on startup to allow
	 * binding to events, or keeping as state, those services.
	 * @param {Tor61Service} service The peer service
	 */
	protected onBindPeerService(service : Tor61Service) {
		switch (service.getName()) {
			case Constant.SERVICE_NAMES.SOCKET:
				this.socketService = <Tor61SocketService> service;
				break;

			case Constant.SERVICE_NAMES.REGISTRATION:
				this.registrationService = <Tor61RegistrationService> service;

				this.registrationService.on('receivedRouters', (routers) => {
					this.log('Recieving routers...');
					// Is this our first router list?
					if (this.routers == null) {
						this.routers = routers;

						// We should create our initial circuit when we start
						this.createCompleteCircuit();
					} else {
						// TODO: Diff of available routers?
						this.routers = routers;
					}
				});
				break;
			case Constant.SERVICE_NAMES.CELL:
				this.cellService = <Tor61CellService> service;
				break;

			case Constant.SERVICE_NAMES.PEER_INPUT:
				this.inputService = <Tor61PeerInputService> service;

				service.on('createCell', (cid, cell, raw) => {
					this.onCreateCircuitRequest(cid, cell);
				});

				break;

			case Constant.SERVICE_NAMES.EXIT:
				// When we recieve (and exit!) a extend request, we should
				// try to extend the circuit
				service.on('extendCircuitRequest', (cid, cell) => {
					this.onExtendCircuitRequest(cid, cell);
				});

				break;

			case Constant.SERVICE_NAMES.ROUTING:
				this.routerService = <Tor61RoutingService> service;

				// When we have successfully opened a connection we
				// should hook this so we can add it as a peer connection
				// we can keep as state
				this.routerService.on('openedSent', (cid) => {
					var router = {
						host: this.socketService.getRemoteHost(cid),
						port: this.socketService.getRemotePort(cid)
					};

					this.addRouterConnection(router, cid, true);
				});

				break;
		}
	}

    /**
     * Gets this service's string name
     * @return {string} The unique name of this service
     */
    public getName() : string {
        return Constant.SERVICE_NAMES.CIRCUIT;
    }

    /**
     * Restarts the createCompleteCircuit process
     */
    private restartCircuit() {
    	clearTimeout(this.testTimeout);
		this.destroyStartCircuit();
		this.routers = null;
		this.startRouter = null;
		this.startCircuitNumber = null;
		this.aEmit('getRouterList');
    }

	/**
	 * Opens a peer server to the world for other TOR routers
	 * to connect with
	 */
	private openPeerServer() {
		// Open a server 
		this.socketService.server((id, server, port) => {
			// TODO: Find a way to handle peer client connections to close
			this.aEmit('peerServerStart', server, port);

			this.socketService.on('connection:' + id, (cid) => {
				this.log('New Peer Router connection!');
				this.aEmit('peerConnection', cid, id);
			});

			this.socketService.on('close:' + id, (cid) => {
				this.log('Router disconnected');

				// If our entry circuit has been closed, find a new one
				if (this.startRouter) {
					var firstRouterConnection = this.getRouterConnection(this.startRouter);
					if (firstRouterConnection == cid) {
						this.restartCircuit();
					}
				}
			});

			this.log('Opened PEER Server on port ' + port);

			this.peerServer = id;
		});
	}

	/**
	 * Returns the TCP connection for a given router,
	 * undefined if there is not one.
	 * @param {any} router The router
	 * @return {string} The connection id, undefined if one doesn't exist
	 */
	private getRouterConnection(router : any) : string {
		return this.connections[router.host + ':' + router.port];
	}

	/**
	 * Returns the router for a given TCP connection,
	 * undefined if there is not one.
	 * @param {string} connection The connection id
	 * @return {any} The router, undefined if one doesn't exist
	 */
	private getConnectionRouter(connection : string) : any {
		return this.connectionToRouter[connection];
	}

	/**
	 * Adds a router TCP connection
	 * @param {any} router The router
	 * @param {string} id The connection id
	 */
	private addRouterConnection(router : any, id : string, isOdd : boolean) : void {
		this.connections[router.host + ':' + router.port] = id;
		this.connectionToRouter[id] = router;
		this.circuitNumberType[id] = isOdd;
	}

	/**
	 * Removes a router TCP connection
	 * @param {any} router The router
	 */
	private removeRouterConnection(router : any) : void {
		var connection = this.connections[router.host + ':' + router.port];
		if (connection) {
			this.socketService.close(connection);
			this.connectionToRouter[connection] = undefined;
			this.circuitNumberType[connection] = undefined;
			this.connections[router.host + ':' + router.port] = undefined;
		}
	}

	/**
	 * @return {any} A random router in our system. Null if one not found
	 */
	private getRandomRouter() : any {
		if (this.routers == null || this.routers.length == 0) return null;

		return this.routers[Math.floor(Math.random() * this.routers.length)];
	}

	/**
	 * @param {string} connection The connection id
	 * @return {boolean} True if we should assign odd circuit numbers on this
	 *                        connection, false otherwise
	 */
	private shouldAssignOdd(connection : string) {
		return this.circuitNumberType[connection]
	}

	/**
	 * @return {number} The next odd circuit number
	 */
	private nextOddCircuitNumber() : number {
		var count = this.oddCount;
		this.oddCount += 2;
		if (this.oddCount >= Math.pow(2, 32) - 1) {
			this.oddCount = 1;
		}
		return count;
	}

	/*
	 * @return {number} The next even circuit number
	 */
	private nextEvenCircuitNumber() : number {
		var count = this.evenCount;
		this.evenCount += 2;
		if (this.evenCount >= Math.pow(2, 32) - 1) {
			this.evenCount = 2;
		}
		return count;
	}

	/**
	 * Establishes a TCP connection to a router if one does not
	 * exist, returning the ID. returns the id immediately through
	 * the callback if one already exists.
	 * @param {any} router The Router
	 * @param {Function} callback The callback to call
	 */
	private establishConnection(router : any, callback : Function) {
		if (!this.getRouterConnection(router)) {
			this.log('Connection not already established, connecting as TCP client to peer router ' + router.host + ':' + router.port + '...');

			this.socketService.client(router.host, router.port, (id, socket) => {
				if (socket) {
					this.aEmit('madePeerConnection', id);

					// Notify the router service to send an open cell
					this.aEmit('sendOpen', id);

					var failTimer = setTimeout(() => {
						this.log('No OPENED/FAILED within time. Connection seems to be dead.');
						callback(null);
					}, Tor61CircuitService.CIRCUIT_TEST_TIMEOUT);

					// We got a openFailed back, which means we can't use this connection
					this.inputService.once('openFailedCell:' + id, (cid, cell, raw) => {
						clearTimeout(failTimer);
						callback(null);			
					});

					// Wait for a opened cell back
					this.inputService.once('openedCell:' + id, (cid, cell, raw) => {
						clearTimeout(failTimer);
						this.socketService.once('close:' + id, () => {
							this.removeRouterConnection(router);
						});

						this.addRouterConnection(router, id, false);
						callback(id);
					});
				} else {
					callback(null);
				}
			});
		} else {
			this.log('Connection already established, returning old connection (to avoid multiple)');
			callback(this.getRouterConnection(router));
		}
	}

	/**
	 * Called when we have recieved a "CREATE" request, and should
	 * create a circuit and respond with "CREATED".
	 * @param {string} cid  The client connection id originating the CREATE
	 * @param {any}    cell The parsed CREATE cell
	 */
	private onCreateCircuitRequest(cid : string, cell : any) {
		var sourceNumber = cell.circuitID;

		this.aEmit('sendCreated', cid, sourceNumber);
	}

	/**
	 * Establishes a circuit with a router
	 * @param {any}      router   The router
	 * @param {Function} callback Callback to call with the circuit number
	 */
	private establishCircuit(router : any, callback : Function) {
		var connection : string = this.getRouterConnection(router);

		if (!connection) {
			this.aEmit('error', ErrorType.CONNECTION_NOT_FOUND, 'Establish circuit failed: router offline');
			callback(null);
			return;
		}

		var nextNumber = this.shouldAssignOdd(connection) ? 
					this.nextOddCircuitNumber() : this.nextEvenCircuitNumber();

		this.aEmit('sendCreate', connection, nextNumber);

		var failTimer = setTimeout(() => {
			this.log('No CREATED/FAILED within time. Circuit seems to be dead.');
			callback(null);
		}, Tor61CircuitService.CIRCUIT_TEST_TIMEOUT);

		// Wait for a created cell back
		this.inputService.once('createdCell:' + connection + ':' + nextNumber, (cid, cell, raw) => {
			clearTimeout(failTimer);
			callback(nextNumber);			
		});

		// We got a createFailed cell back.. which means we should retry
		this.inputService.once('createFailedCell:' + connection + ':' + nextNumber, (cid, cell, raw) => {
			clearTimeout(failTimer);
			callback(null);			
		});
	}

	/**
	 * Called when we have recieved a "EXTEND" request and we are the last
	 * stop in the circuit, we should create a new circuit and respond with "EXTENDED".
	 * @param {string} cid  The client connection id originating the EXTEND
	 * @param {any}    cell The parsed EXTEND cell
	 */
	private onExtendCircuitRequest(cid : string, cell : any) {
		var fromCircuit = cell.circuitID;

		var split = cell.host.split(':');
		var host = split[0];
		var port = parseInt(split[1]);

		// TODO: User agent?
		var router = {
			host : host,
			port : port,
			agentID : cell.agentID
		};

		this.establishConnection(router, (id) => {
			if (id) {
				this.establishCircuit(router, (circuitNumber) => {
					this.log('Circuit extended for request!');
					if (circuitNumber) {
						// Create a new circuit entry in the router
						this.aEmit('sendExtended', cid, cell);

						// Go both ways
						this.aEmit('newRoute', fromCircuit, cid, circuitNumber, id);
						this.aEmit('newRoute', circuitNumber, id, fromCircuit, cid);
					} else {
						this.aEmit('sendExtendFailed', cid, cell);
					}
				});
			} else {
				this.aEmit('sendExtendFailed', cid, cell);
			}
		});
	}

	/**
	 * Extends a circuit by N hops
	 * @param {string} 	 cid 		   The connection id the circuit resides on
	 * @param {number}   circuitNumber The circuit number to extend
	 * @param {number}   n             The number of hops to extend by
	 * @param {Function} callback      The callback to call once completed
	 */
	private extendCircuitByN(cid : string, circuitNumber : number, n : number, callback : Function) {
		this.extendCircuit(cid, circuitNumber, (num) => {
			if (!num) {
				callback(num);
			} else {
				if (n > 1) {
					this.tick(() => {
						this.extendCircuitByN(cid, circuitNumber, n - 1, callback);
					});
				} else {
					callback(num);
				}
			}
		});
	}

	/**
	 * Sends a beign BEGIN cell to a bogus host
	 * and expects a BEGIN_FAIL back. If no such reply is
	 * recieved, we will assume the circuit is dead, and establish a new
	 * one.
	 */
	private testStartCircuit() {
		if (this.startCircuitNumber) {
			this.log('Begining entry circuit test (sending BEGIN to both bogus and known hosts)...');
			this.aEmit('testCircuit', Tor61CircuitService.BOGUS_HOST, Tor61CircuitService.KNOWN_HOST, this.startCircuitNumber);

			var failTimer = setTimeout(() => {
				this.log('Test complete. Circuit seems to be dead (timeout).');
				this.restartCircuit();
			}, Tor61CircuitService.CIRCUIT_TEST_TIMEOUT);

			// Expect a test complete event from the router service. If we don't get
			// this we will time out.
			this.routerService.once('testComplete', (pass) => {
				clearTimeout(failTimer);

				if (pass) {
					this.log('Test complete. Circuit is responsive.');
					clearTimeout(this.testTimeout);
					this.testTimeout = setTimeout(() => {
						this.testStartCircuit();
					}, Tor61CircuitService.CIRCUIT_TEST_INTERVAL);
				} else {
					this.log('Test complete. Circuit seems to be dead (incorrectly responding).');
					this.restartCircuit();
				}
			});
		}
	}

	/**
	 * Destroys the active start circuit
	 */
	private destroyStartCircuit() {
		if (this.startCircuitNumber && this.startRouter) {
			this.log('We don\'t like how our circuit is behaving. Destroying start circuit...');
			this.removeRouterConnection(this.startRouter);
			this.aEmit('sendEntryDestroy', this.startCircuitNumber);
			this.startCircuitNumber = null;
			this.startRouter = null;
		}
	}

	/**
	 * Extends a circuit given the circuit number by one hop
	 * @param {string} cid The connection id the circuit resides on
	 * @param {number}   circuitNumber The circuit to extend
	 * @param {Function} callback      The callback to execute on successful extension
	 */
	private extendCircuit(cid : string, circuitNumber : number, callback : Function) {
		var nextRouter = this.getRandomRouter();
		this.log('Extending circuit ' + cid + ' to router ' + nextRouter.host + ':' + nextRouter.port);
		this.aEmit('sendExtend', cid, circuitNumber, nextRouter);

		var failTimer = setTimeout(() => {
			this.log('No extended within time. Circuit seems to be dead.');
			callback(null);
		}, Tor61CircuitService.CIRCUIT_TEST_TIMEOUT);

		// Wait for a extended cell back
		this.inputService.once('relayCell:' + RelayCommand.EXTENDED + ':' + circuitNumber, (cid, cell, raw) => {
			this.log('Extended.');
			clearTimeout(failTimer);
			callback(circuitNumber);		
		});
	}

	/**
	 * Closes the given circuit by number
	 * @param {number} circuitNumber The circuit to close
	 */
	private closeCircuit(circuitNumber : number) {
		this.aEmit('closeCircuit', circuitNumber);
	}

	/**
	 * Creates a 3-hop Tor61 circuit
	 */
	public createCompleteCircuit() : void {
		this.log('Creating start up circuit...');

		var firstRouter = this.getRandomRouter();

		if (firstRouter == null) {
			this.restartCircuit();
			return;
		}

		// Establish a connection
		this.establishConnection(firstRouter, (id) => {

			// Check for success
			if (id) {

				// Now establish a circuit
				this.log('Establishing circuit to first hop...');
				this.establishCircuit(firstRouter, (circuitNumber) => {
					this.log('Established. Now extending');

					// If successful, we need to extend twice
					if (circuitNumber) {
						this.extendCircuitByN(id, circuitNumber, Tor61CircuitService.START_UP_HOPS, (num) => {
							if (!num) {
								this.closeCircuit(circuitNumber);
								this.restartCircuit();
							} else {
								this.log('Entry Circuit Established with ' + Tor61CircuitService.START_UP_HOPS + ' extends.');
								this.startCircuitNumber = num;
								this.startRouter = firstRouter;
								this.aEmit('entryCircuit', num, id);

								// Test our circuit regularly
								setTimeout(() => {
									this.testStartCircuit();
								}, Tor61CircuitService.CIRCUIT_TEST_INTERVAL);
							}
						});
					} else {
						this.restartCircuit();
					}
				});
			} else {
				this.restartCircuit();
			}
		});
	}

}

export = Tor61CircuitService;
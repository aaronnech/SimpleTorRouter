/// <reference path="../def/node.d.ts"/>

import Tor61Service = require('./Tor61Service');
import Tor61CircuitService = require('./Tor61CircuitService');
import Tor61CellService = require('./Tor61CellService');
import Tor61SocketService = require('./Tor61SocketService');
import Tor61ParsingService = require('./Tor61ParsingService');
import Tor61PeerInputService = require('./Tor61PeerInputService');
import Tor61EntranceService = require('./Tor61EntranceService');

import Constant = require('../Constant');

import CellType = require('../utils/CellType');
import RelayCommand = require('../utils/RelayCommand');

/**
 * The routing service is handed incoming cells
 * from peer routers via the PeerInputService, and routes
 * them to the exit, entrance, or other peer routers depending
 * on the router table state. Routing table state is updated from
 * circuit modifications relayed from the CircuitService.
 */
class Tor61RoutingService extends Tor61Service {
	private forwardingTable : any;
	private entryForward : any;

	private userAgent : number;

	private socketService : Tor61SocketService;
	private cellService : Tor61CellService;
	private parsingService : Tor61ParsingService;
	private inputService: Tor61PeerInputService;
    private entranceService: Tor61EntranceService;


	constructor(group : number, instance : number) {
		super();

		this.entryForward = null;
		this.forwardingTable = {};
		this.userAgent = group * Math.pow(2, 16) + instance;
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
			case Constant.SERVICE_NAMES.PEER_INPUT:
				this.inputService = <Tor61PeerInputService> service;

				// When a open cell is sent to us, immediately reply with
				// OPENED
				service.on('openCell', (cid, cell, raw) => {
					this.sendOpened(cid, cell);
				});

				// When a relay cell is sent to us, we need to figure
				// out what we should do with it based on the circuit
				service.on('relayCell', (cid, cell, raw) => {
					this.onIncomingRelayCell(cid, cell, raw);
				});

				// When a relay cell is sent to us, we need to figure
				// out what we should do with it based on the circuit
				service.on('destroyCell', (cid, cell, raw) => {
					this.onIncomingDestroyCell(cid, cell, raw);
				});

				break;

			case Constant.SERVICE_NAMES.CIRCUIT:
				// Hook into all the administrative cell events
				// of the circuit service. We must forfill this events
				// by sending cells
				service.on('sendExtend', (cid, circuitNumber, router) => {
					this.sendExtend(cid, circuitNumber, router);
				});

				service.on('testCircuit', (bogusHost, knownHost, entryCircuitNumber) => {
					this.testEntryCircuit(bogusHost, knownHost, entryCircuitNumber);
				});

				service.on('sendOpen', (id) => {
					this.sendOpen(id, 1000);
				});

				service.on('sendCreate', (id, circuitNumber) => {
					this.sendCreate(id, circuitNumber);
				});

				service.on('sendCreated', (id, circuitNumber) => {
					this.sendCreated(id, circuitNumber);
				});

				service.on('sendEntryDestroy', (entryCircuitNumber) => {
					this.destroyEntry(entryCircuitNumber);
				});

				service.on('sendCreateFailed', (id, circuitNumber) => {
					this.sendCreateFailed(id, circuitNumber);
				});

				service.on('sendExtended', (id, cell) => {
					this.sendExtended(id, cell);
				});

				service.on('sendExtendFailed', (id, cell) => {
					this.sendExtendFailed(id, cell);
				});

				// If a new circuit is created, we should begin to use it in routing
				service.on('newRoute', (fromNumber, fromConnection, toNumber, toConnection) => {
					this.setRoute(fromNumber, fromConnection, toNumber, toConnection);
				});

				// If a new entry circuit (created on startup) is made, we need to set our
				// entry forward address
				service.on('entryCircuit', (toNumber, toConnection) => {
					this.setEntryForward(toNumber, toConnection);
				});

				break;
			case Constant.SERVICE_NAMES.CELL:
				this.cellService = <Tor61CellService> service;
				break;

			case Constant.SERVICE_NAMES.ENTRANCE:
				this.entranceService = <Tor61EntranceService> service;

				// If a cell enters our router, we should forward it on to the
				// entry forwarding address
				service.on('enterCell', (raw) => {
					this.onEnterRelayCell(raw);
				});

				break;

			case Constant.SERVICE_NAMES.EXIT:

				// If our router is acting as an exit, when the remote server responds
				// we convert the response to TOR cells, and then feed them back to
				// the circuit their stream belongs.
				service.on('respond', (cid, raw) => {
					this.onExitResponseCell(cid, raw);
				});

				break;

			case Constant.SERVICE_NAMES.PARSING:
				this.parsingService = <Tor61ParsingService> service;
				break;
		}
	}

    /**
     * Gets this service's string name
     * @return {string} The unique name of this service
     */
    public getName() : string {
        return Constant.SERVICE_NAMES.ROUTING;
    }

	/**
	 * @param {string} cid  [description]
	 * @param {any}    cell [description]
	 * @return {boolean} true if we are the last stop in the circuit
	 *                        for the given cell, false otherwise
	 */
	private isLastStop(cid : string, cell : any) {
		var key = this.getRoutingKey(cid, cell.circuitID);

		return typeof(this.forwardingTable[key]) == 'undefined' ||
			  (this.forwardingTable[key].connection == null &&
			   this.forwardingTable[key].circuit == null);
	}

	/**
	 * @param {string} cid  [description]
	 * @param {any}    cell [description]
	 * @return {boolean} true if we are the last stop in the circuit
	 *                        for the given cell, false otherwise
	 */
	private isForEnter(cid : string, cell : any) {
		var key = this.getRoutingKey(cid, cell.circuitID);

		// See if this cell came from the connection, circuit pair
		// that is the first hop in our router's established circuit.
		// If it is, it will be a cell returning from a remote server
		// and ending at our router in hopes to return to the client 
		// using us as a proxy.
		return this.entryForward &&
			this.entryForward.circuit == cell.circuitID &&
			this.entryForward.connection == cid;
	}

	/**
	 * Exits a relay cell
	 * @param {string} cid  The connection id it came from
	 * @param {any}    cell The parsed relay cell
	 */
	private exitRelayCell(cid : string, cell : any) {
		this.aEmit('exitCell', cid, cell);
	}

	/**
	 * Enters possibly multiple relay cells to the TOR net
	 * @param {Buffer} rawCells The tor cells
	 */
	private onEnterRelayCell(rawCells : Buffer) {
		if (this.entryForward && this.entryForward.connection && this.entryForward.circuit) {
			var destination = this.entryForward.connection;
			var circuit = this.entryForward.circuit;

			if (rawCells && rawCells.length != 0 && rawCells.length % Constant.CELL_SIZE == 0) {
				for (var i = 0; i < rawCells.length / Constant.CELL_SIZE; i++) {
					var start = i * Constant.CELL_SIZE;
					var end = start + Constant.CELL_SIZE;
					var rawCell = rawCells.slice(start, end);


					this.cellService.changeCircuitID(rawCell, circuit);
					this.socketService.write(destination, rawCell);
				}
			}
		}
	}

	/**
	 * Called when a connected remote host has responded and we have
	 * converted the response back to TOR cells. These cells must go back
	 * through the given connection id.
	 * @param {string} cid     The destination of the response cell
	 * @param {Buffer} rawCell The raw cell buffer
	 */
	private onExitResponseCell(cid : string, rawCell : Buffer) {
		this.socketService.write(cid, rawCell);
	}

	/**
	 * Called when we recieve a cell from a peer connection
	 * that is a response to cells that enter at us. E.g.
	 * this cell is for a client that is proxied through our router.
	 * @param {string} cid  The peer connection id
	 * @param {any}    cell The parsed relay cell
	 */
	private entryResponse(cid : string, cell : any) {
		this.aEmit('streamResponse', cell);
	}

	/**
	 * Called when we recieve a cell from a peer connection
	 * that is to be forwarded on a circuit that we are part of.
	 * @param {string} cid  The peer connection id
	 * @param {any}    cell The parsed relay cell
	 * @param {Buffer} raw The raw relay cell
	 */
	private forwardRelayCell(cid : string, cell : any, raw : Buffer) {
		if (cid && cell) {
			var sourceKey : string = this.getRoutingKey(cid, cell.circuitID);
			var destination = this.forwardingTable[sourceKey];

			this.cellService.changeCircuitID(raw, destination.circuit);

			// Forward it
			this.socketService.write(destination.connection, raw);
		}
	}

	/**
	 * Called when we have an incoming relay cell from a peer connection
	 * @param {string} cid  The peer connection id
	 * @param {any}    cell The parsed relay cell
	 * @param {Buffer} raw The raw relay cell
	 */
	private onIncomingRelayCell(cid : string, cell : any, raw : Buffer) {
		this.log('Incoming relay cell!');
		if (this.isLastStop(cid, cell) && this.isForEnter(cid, cell)) {
			this.log('We are the entry for this cell');
			this.entryResponse(cid, cell);
		} else if (this.isLastStop(cid, cell)) {
			this.log('We are the last stop for this cell');
			this.exitRelayCell(cid, cell);
		} else {
			this.log('We are a middle man for this cell');
			this.forwardRelayCell(cid, cell, raw);
		}
	}

	/**
	 * When we recieve a destroy cell this is called. Recieving a destroy cell
	 * means that we should no longer recieve cells from the circuit id.
	 * @param {string} cid  [description]
	 * @param {any}    cell [description]
	 * @param {Buffer} raw  [description]
	 */
	private onIncomingDestroyCell(cid : string, cell : any, raw : Buffer) {
		// For now, do nothing. If a circuit is destroyed, it will no longer
		// send us data, but if it does (e.g. that circuit is being mallicous),
		// we should forward it on regardless, otherwise we will be an exit. We will
		// continue to store the state
	}

	/**
	 * Sets a route from a given circuit, connection pair to another.
	 * @param {number} fromNumber     The circuit number incoming
	 * @param {string} fromConnection The connection incoming
	 * @param {number} toNumber       The outgoing circuit number
	 * @param {string} toConnection   The outgoing connection
	 */
	private setRoute(fromNumber : number, fromConnection : string, toNumber : number, toConnection : string) {
		if (fromNumber && fromConnection && toNumber && toConnection) {
			var key = this.getRoutingKey(fromConnection, fromNumber);
			this.log('Route set:');
			this.log('FROM Circuit: ' + fromNumber + ' Connection: ' + fromConnection);
			this.log('TO Circuit: ' + toNumber + ' Connection: ' + toConnection);

			this.forwardingTable[key] = {
				circuit: toNumber,
				connection: toConnection
			};
		}
	}

	/**
	 * Sets the router's current entry forwarding address. e.g. The first hop into
	 * our router's established circuit.
	 * @param {number} circuitNumber The circuit number
	 * @param {string} connection    The connection
	 */
	private setEntryForward(circuitNumber : number, connection : string) {
		if (circuitNumber && connection) {
			this.log('Entry forwarding address set to: ');
			this.log('Circuit: ' + circuitNumber + ' Connection: ' + connection);

			this.entryForward = {
				circuit: circuitNumber,
				connection: connection
			};

			this.aEmit('readyToSend');
		}
	}

	/**
	 * Destroys the entry circuit. Checks to make sure the given
	 * circuit id is actually the entry circuit.
	 * @param {number} entryCircuitNumber The entry circuit number to verify
	 */
	private destroyEntry(entryCircuitNumber : number) {
		if (this.entryForward && this.entryForward.circuit == entryCircuitNumber) {
			this.aEmit('notReadyToSend');
			this.cellService.getCell(entryCircuitNumber, CellType.DESTROY, (cell) => {
				if (cell) {
					this.socketService.write(this.entryForward.connection, cell);
				}
				this.entryForward = null;
			});
		}
	}

	/**
	 * Tests the entry circuit by sending a couple beign BEGIN cells and test
	 * our circuit's behavior.
	 * @param {string} bogusHost The fake host to BEGIN
	 * @param {string} knownHost The known host to BEGIN
	 * @param {number} entryCircuitNumber The circuit number we know as the entry circuit
	 */
	private testEntryCircuit(bogusHost : string, knownHost : string, entryCircuitNumber : number) {
		if (this.entryForward) {
			var circuit = this.entryForward.circuit;
			var connection = this.entryForward.connection;
			var completeCount = 2;

			var testFinished = (pass) => {
				this.log('Test partially finished. Test result: pass=' + pass);
				if (!pass) {
					completeCount = 0;
					this.aEmit('testComplete', false);
				} else if (completeCount > 0) {
					completeCount--;
					if (completeCount == 0) {
						this.aEmit('testComplete', true);
					}
				}
			};

			if (entryCircuitNumber != circuit) {
				this.log('Test fail - believedCircuit: ' + entryCircuitNumber + ' actual circuit: ' + circuit);
				this.aEmit('testComplete', false);
			} else {
				var bogusStream = this.entranceService.getStreamID();
				var knownStream = this.entranceService.getStreamID();

				this.cellService.getRelayCell(circuit, bogusStream, RelayCommand.BEGIN, { host: bogusHost }, (begin) => {
					if (begin) {
						this.onEnterRelayCell(begin);

						// Expect begin failed
						this.inputService.once('relayCell:' + RelayCommand.BEGIN_FAILED + ':' + circuit + ':' + bogusStream, (cid, cell, raw) => {
							testFinished(true);
						});
					}
				});

				this.cellService.getRelayCell(circuit, knownStream, RelayCommand.BEGIN, { host: knownHost }, (begin) => {
					if (begin) {
						this.onEnterRelayCell(begin);

						// Expect connected
						this.inputService.once('relayCell:' + RelayCommand.CONNECTED + ':' + circuit + ':' + knownStream, (cid, cell, raw) => {
							testFinished(true);
						});
					}
				});
			}
		}
	}

	/**
	 * Called when we failed to create a circuit with a requesting peer router.
	 * We must send CREATE_FAILED.
	 * @param {string} id The connection id
	 * @param {number} circuitNumber The circuit number we failed to create
	 */
	private sendCreateFailed(id : string, circuitNumber : number) {
		this.cellService.getCell(circuitNumber, CellType.CREATE_FAILED, (cell) => {
			if (cell) {
				this.socketService.write(id, cell);
			}
		});
	}

	/**
	 * Called when we want to create a new circuit with a peer router.
	 * We must send CREATE to this router and await CREATED.
	 * @param {string} id The connection id
	 * @param {number} circuitNumber The created circuit number
	 */
	private sendCreate(id : string, circuitNumber : number) {
		this.cellService.getCell(circuitNumber, CellType.CREATE, (cell) => {
			if (cell) {
				this.socketService.write(id, cell);
			}
		});
	}

	/**
	 * Sends a cell to extend the given circuit on the given connection
	 * to the given router choice.
	 * @param {string} cid           The connection the circuit resides on
	 * @param {number} circuitNumber The circuit number to extend
	 * @param {any}    router        The router to extend to
	 */
	private sendExtend(cid : string, circuitNumber : number, router : any) {
		this.cellService.getRelayCell(circuitNumber, 0, RelayCommand.EXTEND, {
			host : router.host + ':' + router.port,
			agentID : router.agentID
		}, (cell) => {
			if (cell) {
				this.socketService.write(cid, cell);
			}
		});
	}

	/**
	 * Called when we extended a circuit by adding a peer router.
	 * We must send EXTENDED.
	 * @param {string} id The connection id
	 * @param {any} cell The EXTEND cell we used to extend the circuit
	 */
	private sendExtended(id : string, cell : any) {
		this.cellService.getRelayCell(cell.circuitID, cell.streamID, RelayCommand.EXTENDED, {}, (ext) => {
			if (ext) {
				this.socketService.write(id, ext);
			}
		});
	}

	/**
	 * Called when we want to send a OPENED Cell in response to an OPEN
	 * @param {string} id The connection id originating the OPEN cell
	 * @param {any} cell The OPEN cell we recieved
	 */
	private sendOpened(id : string, cell : any) {
		this.cellService.getOpenCell(CellType.OPENED, cell.openerID, this.userAgent, (cell) => {
			if (cell) {
				this.aEmit('openedSent', id);
				this.socketService.write(id, cell);
			}
		});
	}

	/**
	 * Called when we failed to extend a circuit by adding a peer router.
	 * We must send EXTEND_FAILED.
	 * @param {string} id The connection id
	 * @param {any} cell The EXTEND cell we used to try to extend the circuit
	 */
	private sendExtendFailed(id : string, cell : any) {
		this.cellService.getRelayCell(cell.circuitID, cell.streamID, RelayCommand.EXTEND_FAILED, {}, (ext) => {
			if (cell) {
				this.socketService.write(id, ext);
			}
		});
	}

	/**
	 * Called when we created a new circuit with a peer router.
	 * We must send CREATED.
	 * @param {string} id The connection id
	 * @param {number} circuitNumber The created circuit number
	 */
	private sendCreated(id : string, circuitNumber : number) {
		this.cellService.getCell(circuitNumber, CellType.CREATED, (cell) => {
			if (cell) {
				this.socketService.write(id, cell);
			}
		});
	}

	/**
	 * Called when a TOR connection is made to a peer router. We must send
	 * OPEN to this router and await a OPENED cell.
	 * @param {string} id The connection id.
	 */
	private sendOpen(id : string, openedId : number) {
		this.cellService.getOpenCell(CellType.OPEN, this.userAgent, openedId, (cell) => {
			if (cell) {
				this.socketService.write(id, cell);
			}
		});
	}


	/**
	 * Returns the unique routing key for the given connection / circuit number
	 * @param {string} connectionId  The connection id
	 * @param {number} circuitNumber The circuit number
	 * @return {string} The key
	 */
	private getRoutingKey(connectionId : string, circuitNumber : number) : string {
		return connectionId + ',' + circuitNumber;
	}
}

export = Tor61RoutingService;
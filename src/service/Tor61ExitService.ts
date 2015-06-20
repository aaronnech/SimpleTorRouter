/// <reference path="../def/node.d.ts"/>

import Tor61Service = require('./Tor61Service');
import Tor61SocketService = require('./Tor61SocketService');
import Tor61RoutingService = require('./Tor61RoutingService');
import Tor61CellService = require('./Tor61CellService');
import CellType = require('../utils/CellType');
import RelayCommand = require('../utils/RelayCommand');
import ErrorType = require('../utils/ErrorType');

import Constant = require('../Constant');

/**
 * Provides a service to exit Tor61 cells to remote
 * hosts from the Tor61 network.
 */
class Tor61ExitService extends Tor61Service {
	private socketService: Tor61SocketService;
	private routerService: Tor61RoutingService;
	private cellService: Tor61CellService;

	private connections: any;

	constructor() {
		super();

		this.connections = {};
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
			case Constant.SERVICE_NAMES.CELL:
				this.cellService = <Tor61CellService> service;
				break;
			case Constant.SERVICE_NAMES.ROUTING:
				this.routerService = <Tor61RoutingService> service;

				this.routerService.on('exitCell', (cid, cell) => {
					this.onExitRelayCell(cid, cell);
				});
				break;
		}
	}

    /**
     * Gets this service's string name
     * @return {string} The unique name of this service
     */
    public getName() : string {
        return Constant.SERVICE_NAMES.EXIT;
    }

    /**
     * Gets the connection associated with a cell's stream and circuit.
     * If no such connection exists, it will be created. Returns null through
     * the callback if there was an error.
     * @param {string} cid The connection id that originated the cell
     * @param {any} cell The cell
     * @param {Function} callback The callback
     */
    private getExitCellConnection(cid : string, cell : any, callback : Function) {
		var key = this.getConnectionKey(cell.streamID, cell.circuitID);

		if (this.connections[key]) {
			callback(this.connections[key]);
		} else {
			if (cell.host) {
				this.log('connecting to remote exit server ' + cell.host);
				var split = cell.host.split(':');
				var host = split[0];
				var port = parseInt(split[1]);
				if (!port || isNaN(port)) {
					port = 80;
				}

				this.socketService.client(host, port, (id, socket) => {
					if (!id || !socket) {
						this.log('Unable to connect to remote host');
						callback(null);
					} else {
						this.log('Connected to remote host: ' + host + ':' + port);
						this.connections[key] = id;

						// On remote close, we want to remove our connection and
						// notify the client that the connection closed with an END cell.
						this.socketService.once('close:' + id, () => {
							this.connections[key] = undefined;

							this.cellService.getRelayCell(cell.circuitID, cell.streamID, RelayCommand.END, {}, (response) => {
								this.aEmit('respond', cid, response);
							});
						});

						// When we get a response from the server, convert it to a series of data
						// cells and send them as a response through the tor network
						var remoteData = this.socketService.dataStreamer(id);
						remoteData.on('data', (raw) => {
							this.cellService.getDataCells(raw, cell.streamID, cell.circuitID, (rawCells) => {

								// Integrity check of our cell block
								if (rawCells && rawCells.length != 0 && rawCells.length % Constant.CELL_SIZE == 0) {
									for (var i = 0; i < rawCells.length / Constant.CELL_SIZE; i++) {
										var start = i * Constant.CELL_SIZE;
										var end = start + Constant.CELL_SIZE;

										this.aEmit('respond', cid, rawCells.slice(start, end));
									}
								} else {
									// We failed to encode the response, close the stream.
									this.aEmit('error', ErrorType.EXIT_RESPONSE, 'Error encoding response to data cell');
									this.cellService.getRelayCell(cell.circuitID, cell.streamID, RelayCommand.END, {}, (response) => {
										this.aEmit('respond', cid, response);
									});
								}
							});
						});

						callback(id);
					}
				});
			} else {
				callback(null);
			}
		}
    }

	/**
	 * Returns the unique key for the given stream / circuit combination
	 * @param {number} streamId  The stream id
	 * @param {number} circuitNumber The circuit number
	 * @return {string} The key
	 */
	private getConnectionKey(streamId : string, circuitNumber : number) : string {
		return streamId + ',' + circuitNumber;
	}

	/**
	 * Exits a begin cell
     * @param {string} cid The connection id the cell came from
     * @param {any} cell The cell to exit
	 */
	private exitBeginCell(cid : string, cell : any) {
		this.log('Exiting BEGIN cell');

		// Will force a connection open if one does not
		// exist
		this.getExitCellConnection(cid, cell, (id) => {
			if (id) {
				this.log('Successful connection to remote host.');
				// Send back a connect cell on success
				this.cellService.getRelayCell(cell.circuitID, cell.streamID, RelayCommand.CONNECTED, {}, (response) => {
					this.aEmit('respond', cid, response);
				});
			} else {
				// Send back a BEGIN_FAILED cell on failure
				this.cellService.getRelayCell(cell.circuitID, cell.streamID, RelayCommand.BEGIN_FAILED, {}, (response) => {
					this.aEmit('respond', cid, response);
				});
			}
		});
	}

	/**
	 * Exits a begin cell
     * @param {string} cid The connection id the cell came from
     * @param {any} cell The cell to exit
	 */
	private exitDataCell(cid : string, cell : any) {
		this.log('Exiting DATA cell');

		this.getExitCellConnection(cid, cell, (id) => {
			if (id) {
				this.socketService.write(id, cell.data);
				this.log('DATA cell written to remote host');
			} else {
				this.aEmit('error', ErrorType.CONNECTION_NOT_FOUND, 'Connection not found to remote server on DATA cell');
			}
		});
	}

	/**
	 * Exits a end cell
     * @param {string} cid The connection id the cell came from
     * @param {any} cell The cell to exit
	 */
	private exitEndCell(cid : string, cell : any) {
		this.log('Exiting END cell');

		// Will force a connection open if one does not
		// exist
		this.getExitCellConnection(cid, cell, (id) => {
			if (id) {
				this.socketService.close(id);
			}
		});
	}

	/**
	 * Exits an extend cell
     * @param {string} cid The connection id the cell came from
     * @param {any} cell The cell to exit
	 */
	private exitExtendCell(cid : string, cell : any) {
		this.log('Exiting EXTEND cell');

		this.aEmit('extendCircuitRequest', cid, cell);
	}

    /**
     * Called when we should exit a relay cell.
     * @param {string} cid The connection id the cell came from
     * @param {any} cell The cell to exit
     */
    private onExitRelayCell(cid : string, cell : any) {
    	switch (cell.relayCommand) {
			case RelayCommand.EXTEND:
				this.exitExtendCell(cid, cell);
				break;
			case RelayCommand.BEGIN:
				this.exitBeginCell(cid, cell);
				break;
			case RelayCommand.DATA:
				this.exitDataCell(cid, cell);
				break;
			case RelayCommand.END:
				this.exitEndCell(cid, cell);
				break;
    	}
    }
}

export = Tor61ExitService;
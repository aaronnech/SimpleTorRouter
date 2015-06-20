/// <reference path="../def/node.d.ts"/>

import Tor61Service = require('./Tor61Service');
import Tor61SocketService = require('./Tor61SocketService');
import Tor61RoutingService = require('./Tor61RoutingService');
import Tor61ParsingService = require('./Tor61ParsingService');
import Tor61CircuitService = require('./Tor61CircuitService');

import CellType = require('../utils/CellType');
import RelayCommand = require('../utils/RelayCommand');

import Constant = require('../Constant');

/**
 * Listens to all peer router connections and emits cells
 * that input to our router from these connections
 */
class Tor61PeerInputService extends Tor61Service {
	private socketService: Tor61SocketService;
	private circuitService: Tor61CircuitService;
	private parsingService: Tor61ParsingService;

	constructor() {
		super();
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

			case Constant.SERVICE_NAMES.PARSING:
				this.parsingService = <Tor61ParsingService> service;
				break;

			case Constant.SERVICE_NAMES.CIRCUIT:
				this.circuitService = <Tor61CircuitService> service;

				this.circuitService.on('peerConnection', (peerCid, serverCid) => {
					this.watchConnection(peerCid);
				});

				this.circuitService.on('madePeerConnection', (peerCid) => {
					this.watchConnection(peerCid);
				});
				break;
		}
	}

    /**
     * Gets this service's string name
     * @return {string} The unique name of this service
     */
    public getName() : string {
        return Constant.SERVICE_NAMES.PEER_INPUT;
    }

    /**
     * Called when this type of cell arrives through a connection.
     * We will emit specific events describing this cell such that
     * other services can listen for a specific cell response or arrival.
     * @param {string} cid  The connection ID it arrived on
     * @param {any}    cell The parsed cell that arrived
     * @param {Buffer} raw  The raw cell buffer that arrived
     */
    private onRelayCell(cid : string, cell : any, raw : Buffer) {
		this.log('RELAY(' + cell.relayCommand + ') cell in');

		this.aEmit('relayCell', cid, cell, raw);
		this.aEmit('relayCell:' + cell.relayCommand + ':' + cell.circuitID, cid, cell, raw);
		this.aEmit('relayCell:' + cell.relayCommand + ':' + cell.circuitID + ':' + cell.streamID, cid, cell, raw);
    }

    /**
     * Called when this type of cell arrives through a connection.
     * We will emit specific events describing this cell such that
     * other services can listen for a specific cell response or arrival.
     * @param {string} cid  The connection ID it arrived on
     * @param {any}    cell The parsed cell that arrived
     * @param {Buffer} raw  The raw cell buffer that arrived
     */
    private onCreateCell(cid : string, cell : any, raw : Buffer) {
		this.log('CREATE cell in');

    	this.aEmit('createCell', cid, cell, raw);
		this.aEmit('createCell:' + cid + ':' + cell.circuitID, cid, cell, raw);
    }

    /**
     * Called when this type of cell arrives through a connection.
     * We will emit specific events describing this cell such that
     * other services can listen for a specific cell response or arrival.
     * @param {string} cid  The connection ID it arrived on
     * @param {any}    cell The parsed cell that arrived
     * @param {Buffer} raw  The raw cell buffer that arrived
     */
    private onCreatedCell(cid : string, cell : any, raw : Buffer) {
    	this.log('CREATED cell in');

		this.aEmit('createdCell', cid, cell, raw);
		this.aEmit('createdCell:' + cid + ':' + cell.circuitID, cid, cell, raw);
    }

    /**
     * Called when this type of cell arrives through a connection.
     * We will emit specific events describing this cell such that
     * other services can listen for a specific cell response or arrival.
     * @param {string} cid  The connection ID it arrived on
     * @param {any}    cell The parsed cell that arrived
     * @param {Buffer} raw  The raw cell buffer that arrived
     */
    private onCreateFailedCell(cid : string, cell : any, raw : Buffer) {
    	this.log('CREATE_FAILED cell in');

		this.aEmit('createFailedCell', cid, cell, raw);
		this.aEmit('createFailedCell:' + cell.circuitID, cid, cell, raw);
    }

    /**
     * Called when this type of cell arrives through a connection.
     * We will emit specific events describing this cell such that
     * other services can listen for a specific cell response or arrival.
     * @param {string} cid  The connection ID it arrived on
     * @param {any}    cell The parsed cell that arrived
     * @param {Buffer} raw  The raw cell buffer that arrived
     */
    private onDestroyCell(cid : string, cell : any, raw : Buffer) {
    	this.log('DESTROY cell in');

		this.aEmit('destroyCell', cid, cell, raw);
		this.aEmit('destroyCell:' + cell.circuitID, cid, cell, raw);
    }

    /**
     * Called when this type of cell arrives through a connection.
     * We will emit specific events describing this cell such that
     * other services can listen for a specific cell response or arrival.
     * @param {string} cid  The connection ID it arrived on
     * @param {any}    cell The parsed cell that arrived
     * @param {Buffer} raw  The raw cell buffer that arrived
     */
    private onOpenCell(cid : string, cell : any, raw : Buffer) {
    	this.log('OPEN cell in');

		this.aEmit('openCell', cid, cell, raw);
    }

    /**
     * Called when this type of cell arrives through a connection.
     * We will emit specific events describing this cell such that
     * other services can listen for a specific cell response or arrival.
     * @param {string} cid  The connection ID it arrived on
     * @param {any}    cell The parsed cell that arrived
     * @param {Buffer} raw  The raw cell buffer that arrived
     */
    private onOpenedCell(cid : string, cell : any, raw : Buffer) {
    	this.log('OPENED cell in');

		this.aEmit('openedCell', cid, cell, raw);
		this.aEmit('openedCell:' + cid, cid, cell, raw);
    }

    /**
     * Called when this type of cell arrives through a connection.
     * We will emit specific events describing this cell such that
     * other services can listen for a specific cell response or arrival.
     * @param {string} cid  The connection ID it arrived on
     * @param {any}    cell The parsed cell that arrived
     * @param {Buffer} raw  The raw cell buffer that arrived
     */
    private onOpenFailedCell(cid : string, cell : any, raw : Buffer) {
    	this.log('OPEN_FAILED cell in');

		this.aEmit('openFailedCell', cid, cell, raw);
    }

    /**
     * Watches a connection for incoming cells. If a cell is recieved
     * it will emit the appropriate events.
     * @param {string} id The connection id to watch for cells
     */
    private watchConnection(id : string) {
		var chunker = this.socketService.cellChunker(id);

		if (chunker) {

			// Listen for tor cell chunks
			chunker.on('data', (chunk) => {

				// Chunker should guarentee that this is 512 bytes, but just
				// to make sure we are double checking.
				if (chunk.data && chunk.data.length == Constant.CELL_SIZE) {
					this.parsingService.parseTor61Cell(chunk.data, (cell) => {
						if (cell) {
							// General cell emission
							this.aEmit('cell', id, cell);

							// This is a valid cell, we should route it
							// to the correct specific emitter method.
							switch (cell.cellType) {
								case CellType.RELAY:
									this.onRelayCell(id, cell, chunk.data);
									break;

								case CellType.CREATE:
									this.onCreateCell(id, cell, chunk.data);
									break;

								case CellType.CREATED:
									this.onCreatedCell(id, cell, chunk.data);
									break;

								case CellType.CREATE_FAILED:
									this.onCreateFailedCell(id, cell, chunk.data);
									break;

								case CellType.DESTROY:
									this.onDestroyCell(id, cell, chunk.data);
									break;

								case CellType.OPEN:
									this.onOpenCell(id, cell, chunk.data);
									break;

								case CellType.OPENED:
									this.onOpenedCell(id, cell, chunk.data);
									break;

								case CellType.OPEN_FAILED:
									this.onOpenFailedCell(id, cell, chunk.data);
									break;
							}
						} else {
							// TODO: Handle incorrect cell
							this.log('Invalid cell from connection!');
						}
					})
				}
			});

			this.log('Watching peer connection ' + id + ' for cells');
		}
    }

}

export = Tor61PeerInputService;
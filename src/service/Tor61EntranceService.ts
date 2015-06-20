/// <reference path="../def/node.d.ts"/>

import CellType = require('../utils/CellType');
import Constant = require('../Constant');
import ErrorType = require('../utils/ErrorType');
import RelayCommand = require('../utils/RelayCommand');
import Tor61Service = require('./Tor61Service');
import Tor61CellService = require('./Tor61CellService');
import Tor61ParsingService = require('./Tor61ParsingService');
import Tor61RoutingService = require('./Tor61RoutingService');
import Tor61SocketService = require('./Tor61SocketService');

import http = require('http');

/**
 * Class that handles all incoming requests to a tor61 node from a
 * source that is NOT another tor61 node. Exposes a proxy HTTP server
 * to the world for use.
 */
class Tor61EntranceService extends Tor61Service {
    // Numerical constants
    private MAX_STREAM_ID : number = Math.pow(2,32) - 1;
    private MAX_RETRY : number = 5;

    // Field structures
    private canSend : boolean;
    private earlySendQueue : number[];
    private nextStreamID : number;
    private port : number;
    private serverID : string;

    // Mapping strucures. streamMap is a map from streamID to information about that
    // stream. connectionMap is a map from the socket service's connectionID to the
    // corresponding streamID.
    private streamMap : { [key:number] : any; };
    private connectionMap : { [key:string] : number };

    // Utility services
    private cellService : Tor61CellService;
    private parsingService : Tor61ParsingService;
    private routingService : Tor61RoutingService;
    private socketService : Tor61SocketService;

    constructor(port : number) {
        super();
        this.nextStreamID = 0;
        this.serverID = "";
        this.canSend = false;
        this.earlySendQueue = [];
        this.streamMap = {};
        this.connectionMap = {};
        this.port = port;
    }

    /**
     * Called on service start up. This method gets a TCP server from the socket
     * service and puts listeners on the connect and close events.
     *
     * @param {Tor61Service[]} peerServices - a list of this service's peers
     */
    public start(services : Tor61Service[]) {
        super.start(services);

        this.socketService.server((id, server, port) => {
            if (id == null || server == null || port == null) {
                this.aEmit('error', ErrorType.SOCKET_CREATE_FAIL, "Server creation failed in socket service");
            } else {
                this.log("Entrance server created");
                this.aEmit('entranceServerStart', server, port);
                this.serverID = id;

                // Listener that fires when our TCP server has a new connection
                this.socketService.on('connection:' + id, (cid) => {
                    this.log("New connection from client " + cid);
                    this.aEmit('clientConnection', cid, id);

                    this.onNewClientConnection(cid);
                });

                // Listener that fires when a client closes a connection to our TCP server
                this.socketService.on('close:' + id, (cid, socket) => {
                    if (this.connectionMap[cid]) {
                        this.log("Client closing connection " + this.connectionMap[cid]);
                        this.emitEndCell(this.connectionMap[cid]);
                    }
                });
            }
        }, this.port);
    }

    /**
     * A shutdown method that unreferences everything and closes the server.
     *
     * This method is usually called on reboot.
     */
    public shutdown() : void {
        super.shutdown();
        this.earlySendQueue = null;
        this.streamMap = null;
        this.connectionMap = null;
        this.cellService = null;
        this.parsingService = null;
        this.routingService = null;
        if (this.socketService) {
            this.socketService.close(this.serverID);
        }
        this.socketService = null;
    }

    /**
     * Handles the binding of peer services
     *
     * @param {Tor61Service} service - the peer service being bound
     */
    protected onBindPeerService(service : Tor61Service) : void {
        switch (service.getName()) {
            case Constant.SERVICE_NAMES.ROUTING:
                this.routingService = <Tor61RoutingService> service;
                this.routingService.on('readyToSend', () => {
                    // now that we are ready to send, we must attempt to send a begin
                    // cell for each existing stream that has been preloaded
                    this.canSend = true;
                    for (var key in this.streamMap) {
                        this.attemptToSendBegin(key);
                    }
                });
                this.routingService.on('streamResponse', (data) => {
                    if (data) {
                        this.processResponseCell(data);
                    }
                });
                break;
            case Constant.SERVICE_NAMES.PARSING:
                this.parsingService = <Tor61ParsingService> service;
                break;
            case Constant.SERVICE_NAMES.CELL:
                this.cellService = <Tor61CellService> service;
                break;
            case Constant.SERVICE_NAMES.SOCKET:
                this.socketService = <Tor61SocketService> service;
            default:
                // do nothing
                break;
        }
    }

    /**
     * Gets this service's string name
     * @return {string} The unique name of this service
     */
    public getName() : string {
        return Constant.SERVICE_NAMES.ENTRANCE;
    }

    /**
     * Helper method to handle new client connection. Allocates a new streamID and updates
     * the two mappings appropriately. Creates a data listener for the connection.
     *
     * @param {string} cid - the connectionID of the connection
     */
    private onNewClientConnection(cid : string) {
        this.log('New client connection to HTTP PROXY');

        var streamID : number = this.getStreamID();
        this.log("Allocated streamID " + streamID);

        this.streamMap[streamID] = {
            "host" : "",
            "cid" : cid,
            "connected" : false,
            "reqBuffer" : new Buffer(0),
            "sentReqCellBuffer" : new Buffer(0),
            "beginCounter" : 0
        };
        this.connectionMap[cid] = streamID;

        // Listener for new data from the client. This data is returned in the form of
        // entire packets.
        var stream = this.socketService.httpLineChunker(cid);
        stream.on('data', (data) => {
            var dataString = data.toString() + '\r\n\r\n';

            this.getHeaderInfo(dataString, (currData, host) => {
                this.streamMap[streamID].host = host;

                if (this.canSend && this.streamMap[streamID].connected) {
                    this.log('SENDING STRAIGHT');
                    // we are allowed to send and the stream is connected
                    this.sendRequest(streamID,  currData);
                } else if (this.canSend && !this.streamMap[streamID].connected) {
                    this.log('BUFFERING');
                    // we are allowed to send but the stream is not yet connected
                    // buffer the packet and attempt to send a begin request if one has
                    // not been sent.
                    this.streamMap[streamID].reqBuffer = Buffer.concat([this.streamMap[streamID].reqBuffer, currData]);

                    if (this.streamMap[streamID].beginCounter == 0 && this.streamMap[streamID].host != "") {
                        this.attemptToSendBegin(streamID);
                    }
                } else {
                    this.log('BUFFERING');
                    // we are not allowed to send so we buffer the request
                    this.streamMap[streamID].reqBuffer = Buffer.concat([this.streamMap[streamID].reqBuffer, currData]);
                }
            });
        });
    }

    /**
     * Helper method that checks conditions to send a BEGIN cell
     *
     * @param {number} streamID - the streamID we are trying to begin
     */
    private attemptToSendBegin(streamID : number) {
        if (this.streamMap[streamID] && this.streamMap[streamID].host != "") {
            this.log('SENDING BEGIN TO ' + this.streamMap[streamID].host);
            // send a begin cell
            this.emitBeginCell(this.streamMap[streamID].host, streamID);
        }
    }

    /**
     * Helper method that safely returns an unused stream id for the current connection
     *
     * @return {number} the next safe stream id
     */
    public getStreamID() : number {
        this.nextStreamID++;
        if (this.nextStreamID > this.MAX_STREAM_ID) {
            this.nextStreamID = 0;
        }
        while (this.streamMap[this.nextStreamID]) {
            this.nextStreamID++;
        }
        return this.nextStreamID;
    }

    /**
     * Safely emits a begin cell for the given destination and stream number
     * @param {string} url      the destination of the stream
     * @param {number} streamID the stream number
     */
    private emitBeginCell(url: string, streamID : number) : void {
        this.cellService.getRelayCell(0, streamID, RelayCommand.BEGIN, {"host" : url}, (cell : Buffer) => {
            if (cell) {
                this.streamMap[streamID].beginCounter++;
                this.safeEmitCell(cell, streamID);
            }
        });
    }

    /**
     * Emits an end cell. Called when a client closes a connection to the
     * proxy server.
     * @param {number} streamID the stream number
     */
    private emitEndCell(streamID : number) : void {
        this.cellService.getRelayCell(0, streamID, RelayCommand.END, {}, (cell) => {
            this.log("Destroying streamID " + streamID);
            // emit the end cell and destroy the stream
            this.safeEmitCell(cell, streamID);
            this.destroyStream(streamID);
        });
    }

    /**
     * Destorys the connection running over the given stream number
     * @param {number} streamID - the stream number
     */
    private destroyStream(streamID : number) {
        if (this.streamMap[streamID]) {
            this.log("Destorying stream " + streamID);
            var cidToDestroy = this.streamMap[streamID].cid;
            this.socketService.close(cidToDestroy);
            this.connectionMap[cidToDestroy] = undefined;
            this.streamMap[streamID] = undefined;
        }
    }

    /**
     * Sends the request as a stacked sequence of emitted cells on the event queue. The routing service will
     * listen for these events and route the cells to the proper destination.
     * @param {number} streamID - The stream id of these cells
     */
    private sendRequest(streamID : number, reqData : Buffer) : void {
        if (this.streamMap[streamID] && reqData.length > 0) {
            this.cellService.getDataCells(reqData, streamID, 0, (cellBuffer : Buffer) => {
                this.safeEmitCell(cellBuffer, streamID);
                this.streamMap[streamID].sentReqCellBuffer = Buffer.concat([this.streamMap[streamID].sentReqCellBuffer, this.streamMap[streamID].reqBuffer]);
                this.streamMap[streamID].reqBuffer = new Buffer(0);
            });
        } else {
            this.aEmit("could not send data on stream " + streamID);
            this.log(streamID.toString());
        }
    }

    /**
     * Safely emits the cell, catching errors in the cell creation process along the way
     * @param {Buffer} cell [description]
     */
    private safeEmitCell(cell : Buffer, streamID : number) : void {
        if (cell == null) {
            this.aEmit('error', ErrorType.NULL_CELL, "ENTRANCE service got null cell when trying to send request");
        } else {
            this.log('Entering data with byte length ' + cell.length + ' on stream ' + streamID);
            this.aEmit("enterCell", cell);
        }
    }

    /**
     * Utility method to get header information from a packet, returns a
     * modified version of the packet via the callback
     * @param {string}   packet - the packet
     * @param {Function} callback
     */
    private getHeaderInfo(packet : string, callback : Function) {
        var host : string = "";
        // get the host and port
        var lowerHeader : string = packet.toLowerCase();
        var splitHeader : string[] = lowerHeader.split(/\n|\r/);
        for (var i : number = 0; i < splitHeader.length; i++) {
            if (splitHeader[i].indexOf("host: ") != -1) {
                // we are at the right entry
                host = splitHeader[i].substring(5).trim();
            }
        }

        var split : string[] = host.split(":");
        if (split.length == 1) {
            // we need to slap on a port
            host += ":80";
        }

        // turn off keep-alive and set HTTP 1.0
        var header : string = packet;
        header = header.replace(/keep-alive/, "close");
        header = header.replace(/HTTP\/.\../, "HTTP/1.0");

        var dataBuf : Buffer = new Buffer(header.length);
        dataBuf.write(header);
        callback(dataBuf, host);
    }

    /**
     * Processes the parsed response cell sent from the routing service
     * @param {any} data - the parsed response cell
     */
    private processResponseCell(data : any) : void {
        // data is a PARSED cell
        if (data.cellType == CellType.RELAY) {
            var streamID = data.streamID;
            if (typeof(streamID) == 'undefined') {
                this.log("GOT UNDEFINED DATA");
                this.log(data);
            }

            switch (data.relayCommand) {
                case RelayCommand.BEGIN_FAILED:
                    this.log('Recieved BEGIN_FAILED');
                    this.destroyStream(streamID);
                    break;
                case RelayCommand.CONNECTED:
                    this.log('Recieved CONNECTED');
                    if (this.streamMap[streamID]) {
                        this.streamMap[streamID].connected = true;
                        // This means that the stream is established
                        this.sendRequest(streamID, this.streamMap[streamID].reqBuffer);
                    }
                    break;
                case RelayCommand.DATA:
                    // this is a response, pipe the data from this response
                    // to the client if the stream is valid
                    if (this.streamMap[streamID]) {
                        this.log('Recieved DATA on streamID ' + streamID);
                        this.socketService.write(this.streamMap[streamID].cid, data.data);
                    }
                    break;
                case RelayCommand.END:
                    // close the stream, and
                    this.log('Recieved END on streamID ' + streamID);
                    this.destroyStream(streamID);
                    break;
                default:
                    // this is the wrong type of relay command, emit an error
                    this.aEmit('error', ErrorType.CELL_TYPE, 'Invalid type of relay cell returned to Tor61EntranceService');
                    break;
            }
        } else {
            // this is the wrong type of cell, emit an error
            this.aEmit('error', ErrorType.CELL_TYPE, 'Invalid cell type returned Tor61EntranceService');
        }
    }
}

export = Tor61EntranceService;
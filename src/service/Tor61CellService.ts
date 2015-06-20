/// <reference path="../def/node.d.ts"/>

import Tor61Service = require('./Tor61Service');
import CellType = require('../utils/CellType');
import ErrorType = require('../utils/ErrorType');
import RelayCommand = require('../utils/RelayCommand');

import Constant = require('../Constant');

var dns = require('dns');

/**
 * Service that generates cell buffers based on
 * parameters.
 */
class Tor61CellService extends Tor61Service {
    // Default constructor baby
    constructor() {
        super();
    }

    /**
     * Gets this service's string name
     * @return {string} The unique name of this service
     */
    public getName() : string {
        return Constant.SERVICE_NAMES.CELL;
    }

    /**
     * Returns a cell of the type CREATE, CREATED, CREATE_FAILED, or DESTROY.
     * @param {number} the circuit ID
     * @param {CellType} the type of cell requested
     * @param {Function} callback
     */
    public getCell(circuitID : number, type : CellType, callback : Function) {
        switch (type) {
            case CellType.CREATE:
            case CellType.CREATED:
            case CellType.CREATE_FAILED:
            case CellType.DESTROY:
                var buf: Buffer = new Buffer(Constant.CELL_SIZE);
                buf.writeUInt16BE(circuitID, 0);
                buf.writeUInt8(type, 2);

                callback(buf);
                break;
            default:
                this.aEmit('error', ErrorType.CELL_TYPE, "CREATE*/DESTROY cell creation: invalid CellType");
                callback(null);
                break;
        }
    }

    /**
     * Returns a cell of the type OPEN, OPENED, or OPEN_FAILED
     * @param {number} the circuit ID
     * @param {CellType} the type of cell requested
     * @param {number} the opener ID
     * @param {number} the opened ID
     * @param {Function} callback
     */
    public getOpenCell(type : CellType, openerID : number, openedID : number, callback : Function) {
        switch (type) {
            case CellType.OPEN:
            case CellType.OPENED:
            case CellType.OPEN_FAILED:
                var buf : Buffer = new Buffer(Constant.CELL_SIZE);
                buf.writeUInt16BE(0, 0);
                buf.writeUInt8(type, 2);
                buf.writeUInt32BE(openerID, 3);
                buf.writeUInt32BE(openedID, 7);

                callback(buf);
                break;
            default:
                this.aEmit('error', ErrorType.CELL_TYPE, "OPEN* cell creation: invalid CellType");
                callback(null);
                break;
        }
    }

    /**
     * Helper function to check if a string is
     * a IP address.
     * @param {string} ip The ip to check
     */
    private checkIsIP(ip : string) {
        var blocks = ip.split(".");
        if(blocks.length === 4) {
            return blocks.every((block) => {
                    return !isNaN(parseInt(block)) && parseInt(block,10) >=0 && parseInt(block,10) <= 255;
            });
        }
        return false;
    }

    /**
     * Returns a cell of type RELAY. Appropriate body members can be stored in "extras", where they will be safely added to the cell.
     * @param {number} the circuit ID
     * @param {number} the stream ID
     * @param {number} the digest
     * @param {RelayCommand} the relay command
     * @param {any} extras - a JSON object containing anything to be put in
     *  the body. The valid keys for this object are "host", "agentID", and
     *  "data".
     * @param {Function} callback
     */
    public getRelayCell(circuitID : number, streamID : number, cmd : RelayCommand, extras : any, callback : Function) {
        var buf : Buffer = new Buffer(Constant.CELL_SIZE);
        buf.writeUInt16BE(circuitID, 0);
        buf.writeUInt8(CellType.RELAY, 2);
        buf.writeUInt16BE(streamID, 3);
        buf.writeUInt16BE(0, 5);
        buf.writeUInt32BE(0, 7);
        buf.writeUInt8(cmd, 13);

        // process the aditional parameters
        switch (cmd) {
            case RelayCommand.BEGIN:
                var host : string = extras["host"];
                if (typeof(host) == "undefined" || host.indexOf(':') == -1) {
                    this.aEmit('error', ErrorType.CELL_FORMAT, "RELAY->BEGIN cell creation: host is undefined");
                    callback(null);
                    return;
                }
                var hostname = host.split(':')[0];
                var port = host.split(':')[1];

                if (!this.checkIsIP(hostname)) {
                    dns.lookup(hostname, 4, ((err, address) => {
                        var finalAddress = address + ':' + port;
                        buf.writeUInt16BE(finalAddress.length + 1, 11);
                        buf.write(finalAddress, Constant.RELAY_HEADER_SIZE, finalAddress.length, 'ascii');
                        // write the null terminator
                        buf.writeUInt8(0, Constant.RELAY_HEADER_SIZE + finalAddress.length);
                        callback(buf);
                    }));

                    return;
                } else {
                    var finalAddress = host;
                    buf.writeUInt16BE(finalAddress.length + 1, 11);
                    buf.write(finalAddress, Constant.RELAY_HEADER_SIZE, finalAddress.length, 'ascii');
                    // write the null terminator
                    buf.writeUInt8(0, Constant.RELAY_HEADER_SIZE + finalAddress.length);
                }

                break;
            case RelayCommand.DATA:
                var data : Buffer = extras["data"];
                if (typeof(data) == "undefined") {
                    this.aEmit('error', ErrorType.CELL_FORMAT, "RELAY->DATA cell creation: Data is undefined");
                    callback(null);
                    return;
                } else if (data.length > Constant.CELL_SIZE - Constant.RELAY_HEADER_SIZE) {
                    this.aEmit('error', ErrorType.CELL_SIZE, "RELAY->DATA cell creation: Data too long for cell");
                    callback(null);
                    return;
                }
                buf.writeUInt16BE(data.length, 11);
                data.copy(buf, Constant.RELAY_HEADER_SIZE, 0, data.length);
                break;
            case RelayCommand.EXTEND:
                var host : string = extras["host"];
                var agentID : number = extras["agentID"];
                if (typeof(host) == "undefined") {
                    this.aEmit('error', ErrorType.CELL_FORMAT, "RELAY->EXTEND cell creation: host is undefined");
                    callback(null);
                    return;
                } else if (typeof(agentID) == "undefined") {
                    this.aEmit('error', ErrorType.CELL_FORMAT, "RELAY->EXTEND cell creation: agentID is undefined");
                    callback(null);
                    return;
                }
                buf.write(host, Constant.RELAY_HEADER_SIZE, host.length, 'ascii');
                buf.writeUInt8(0, Constant.RELAY_HEADER_SIZE + host.length);
                buf.writeUInt32BE(agentID, Constant.RELAY_HEADER_SIZE + host.length + 1);
                buf.writeUInt16BE(host.length + 5, 11);
                break;
            default:
                buf.writeUInt16BE(0, 11);
                break;
        }
        callback(buf);
    }

    /**
     * Turns a data buffer into an array of data cells that contain that buffer split in
     * sequential order in the body of the cells
     */
    public getDataCells(data : Buffer, streamID : number, circuitID : number, callback : Function) {
        var dataPerCell : number = Constant.CELL_SIZE - Constant.RELAY_HEADER_SIZE;

        var cells: Buffer[] = [];

        for (var i = 0; i < data.length; i += dataPerCell) {
            if (data.length - i < dataPerCell) {
                this.getRelayCell(circuitID, streamID, RelayCommand.DATA, {"data" : data.slice(i)}, (cell : Buffer) => {
                    cells.push(cell);
                });
            } else {
                this.getRelayCell(circuitID, streamID, RelayCommand.DATA, {"data" : data.slice(i, i + dataPerCell)}, (cell : Buffer) => {
                    cells.push(cell);
                });
            }
        }

        callback(Buffer.concat(cells));
    }

    /**
     * Changes the circuitID of the given cell
     * @param {Buffer} cell - the cell whose circuit ID we are changing
     * @param {number} newCircuitID - the new circuit ID
     */
    public changeCircuitID(cell : Buffer, newCircuitID : number) {
        cell.writeUInt16BE(newCircuitID, 0);
    }
}

export = Tor61CellService;
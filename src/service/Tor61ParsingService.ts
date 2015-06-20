import Tor61Service = require('./Tor61Service');
import CellType = require('../utils/CellType');
import ErrorType = require('../utils/ErrorType');
import RelayCommand = require('../utils/RelayCommand');
var HttpParser = require('http-string-parser');

import Constant = require('../Constant');

/**
 * Service that parses various raw data forms
 * into directly usable JSON objects
 */
class Tor61ParsingService extends Tor61Service {
    /**
     * Default constructor baby
     */
    constructor() {
        super();
    }

    /**
     * Gets this service's string name
     * @return {string} The unique name of this service
     */
    public getName() : string {
        return Constant.SERVICE_NAMES.PARSING;
    }

    /**
     * Returns a JSON object with all the information contained in a Tor61 cell
     * @param  {Buffer} The buffer containing the cell
     * @param  {Function} The callback function we use to notify the caller
     * @return {any} A JSON object with the relevant fields for the given cell
     */
    public parseTor61Cell(cell : Buffer, callback : Function) : any {
        var circuitID : number = cell.readUInt16BE(0);
        var cellType : number = cell.readUInt8(2);

        switch (cellType) {
            case CellType.RELAY:
                var check : number = cell.readUInt16BE(5);
                var bodyLength : number = cell.readUInt16BE(11);
                if (check != 0 || bodyLength + Constant.RELAY_HEADER_SIZE > Constant.CELL_SIZE) {
                    // we have an error, return null
                    this.aEmit('error', ErrorType.CELL_SIZE, "Cell passed in to parser has body length that is too long");
                    this.tick(() => {
                        callback(null);
                    });
                    return;
                }

                var streamID : number = cell.readUInt16BE(3);
                var digest : number = cell.readUInt32BE(7);
                var relayCommand : number = cell.readUInt8(13);
                switch (relayCommand) {
                    case RelayCommand.BEGIN:
                        var host : string = cell.toString('utf8', Constant.RELAY_HEADER_SIZE, Constant.RELAY_HEADER_SIZE + bodyLength).replace(/\0/g, '');
                        this.tick(() => {
                            callback({
                                "circuitID" : circuitID,
                                "cellType" : cellType,
                                "streamID" : streamID,
                                "digest" : digest,
                                "relayCommand" : relayCommand,
                                "host" : host
                            });
                        });
                        break;
                    case RelayCommand.EXTEND:
                        var host : string = cell.toString('utf8', Constant.RELAY_HEADER_SIZE, Constant.RELAY_HEADER_SIZE + bodyLength - 4).replace(/\0/g, '');
                        var agentID : number = cell.readUInt32BE(10 + bodyLength);
                        this.tick(() => {
                            callback({
                                "circuitID" : circuitID,
                                "cellType" : cellType,
                                "streamID" : streamID,
                                "digest" : digest,
                                "relayCommand" : relayCommand,
                                "host" : host,
                                "agentID" : agentID
                            });
                        });
                        break;
                    case RelayCommand.DATA:
                        var data : Buffer = cell.slice(Constant.RELAY_HEADER_SIZE, Constant.RELAY_HEADER_SIZE + bodyLength)
                        this.tick(() => {
                            callback({
                                "circuitID" : circuitID,
                                "cellType" : cellType,
                                "streamID" : streamID,
                                "digest" : digest,
                                "relayCommand" : relayCommand,
                                "data" : data
                            });
                        });
                        break;
                    default:
                        this.tick(() => {
                            callback({
                                "circuitID" : circuitID,
                                "cellType" : cellType,
                                "streamID" : streamID,
                                "digest" : digest,
                                "relayCommand" : relayCommand
                            });
                        });
                        break;
                }
                break;
            case CellType.OPEN:
            case CellType.OPENED:
            case CellType.OPEN_FAILED:
                if (circuitID != 0) {
                    // we have an error, return null
                    this.aEmit('error', ErrorType.CELL_FORMAT, "OPEN* Cell passed to parser has invalid circuitID field");
                    this.tick(() => {
                        callback(null);
                    });
                    return
                }
                var openerID : number = cell.readUInt32BE(3);
                var openedID : number = cell.readUInt32BE(7);
                this.tick(() => {
                    callback({
                        "cellType" : cellType,
                        "openerID" : openerID,
                        "openedID" : openedID
                    });
                });
                break;
            default:
                // all others contain no additional information
                this.tick(() => {
                    callback({
                        "circuitID" : circuitID,
                        "cellType" : cellType,
                    });
                });
                break;
        }
    }

    /**
     * [parseHTTPHeader description]
     * @param  {Buffer}
     * @param  {Function}
     * @return {any}
     */
    public parseHTTPHeader(request : Buffer, callback : Function) : any {
        var headerString : string = request.toString();

        // catch packets whose first line is not properly formatted
        if (headerString.search(/(GET |HEAD |POST |PUT |DELETE |TRACE |CONNECT ).*HTTP.*(\r|\n)/) == -1) {
            this.tick(() => {
                callback(null);
            });
            return;
        }

        var lowerHeader : string = headerString.toLowerCase();
        var splitHeader : string[] = lowerHeader.split(/\r|\n/);
        var command : string = splitHeader[0].trim().split(" ")[0].toUpperCase();

        var hostLine : string = "";
        var port : number = 0;

        for (var i = 0; i < splitHeader.length; i++) {
            if (splitHeader[i].indexOf("host: ") != -1) {
                // we are at the right entry
                hostLine = splitHeader[i].substring(5).trim();
            }
        }
        // Catch packets with no host
        if (hostLine == "") {
            this.aEmit('error', ErrorType.HTTP_FORMAT, "HTTP request passed to parser has no host");
            this.tick(() => {
                callback(null);
            });
            return;
        }

        var split : string[] = hostLine.split(":");
        var host : string = split[0];
        port = parseInt(split[split.length - 1]);
        if (isNaN(port)) {
            port = lowerHeader.search("https") != -1 ? 443 : 80;
        }

        callback({
            "command" : command,
            "host" : host,
            "port" : port
        });
    }

    /**
     * Parses a HTTP response using the external library.
     *
     * calls back with a JSON object, an example of which is below:
     * {
     *  "protocolVersion": "HTTP/1.1"
     *  "statusCode": "200",
     *  "statusMessage": "OK",
     *  "headers": {
     *      "content-type": "application/json",
     *      "date": "Wed, 03 Jul 2013 13:30:53 GMT",
     *      "server": "gunicorn/0.17.4",
     *      "content-length": "30",
     *      "connection": "keep-alive"
     *  },
     *  "body": "{\n  \"origin\": \"94.113.241.2\"\n}"
     * }
     *
     *
     * @param  {Buffer}   response - the buffered response
     * @param  {Function} callback
     */
    public parseHTTPResponse(response : Buffer, callback : Function) : any {
        var resp = HttpParser.parseResponse(response.toString());
        var headers : any = resp.headers;
        var headersCopy : any = {};
        for (var key in headers) {
            headersCopy[key.toLowerCase()] = headers[key];
        }
        resp.headers = headersCopy;

        callback(resp);
    }

    /**
     * Finds the HTTP host from a input request buffer
     * @param  {Buffer}   request The request from the client
     * @param  {Function} callback Callback to call with the host, calls with Null if not found.
     */
    public findHTTPHost(request : Buffer, callback: Function) : void {
        var req = HttpParser.parseResponse(request.toString());
        var headers = req.headers;
        var headersCopy : any = {};
        for (var key in headers) {
            headersCopy[key.toLowerCase()] = headers[key];
        }

        callback(headersCopy.host || null);
    }
}

export = Tor61ParsingService;
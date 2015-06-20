import Tor61ParsingService = require('../Tor61ParsingService');
import CellType = require('../../utils/CellType');
import RelayCommand = require('../../utils/RelayCommand');

var parser : Tor61ParsingService = new Tor61ParsingService();
// disable emitting for the purposes of testing
(<any> parser).aEmit = function() {};
var CELL_SIZE : number = 512;
var RELAY_HEADER_SIZE : number = 14;

/**
 * Returns a random int that can fit in the given number of bytes (with min value of 1)
 * @param  {number} the number of bytes
 */
function getRandInt(numBytes : number) : number {
    var max : number = Math.pow(2, 8 * numBytes) - 1;
    return Math.floor(Math.random() * (max - 1)) + 1;
}

class Tor61ParsingServiceTest {

	public static testParseOpen(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var openerAgent : number = getRandInt(4);
        var openedAgent : number = getRandInt(4);
        buf.writeUInt16BE(0, 0);
        buf.writeUInt8(CellType.OPEN, 2);
        buf.writeUInt32BE(openerAgent, 3);
        buf.writeUInt32BE(openedAgent, 7);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(4);
            test.notEqual(data, null);
            test.equal(openerAgent, data.openerID);
            test.equal(openedAgent, data.openedID);
            test.equal(CellType.OPEN, data.cellType);
            test.done();
        });
	}

    public static testParseOpened(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var openerAgent : number = getRandInt(4);
        var openedAgent : number = getRandInt(4);
        buf.writeUInt16BE(0, 0);
        buf.writeUInt8(CellType.OPENED, 2);
        buf.writeUInt32BE(openerAgent, 3);
        buf.writeUInt32BE(openedAgent, 7);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(4);
            test.notEqual(data, null);
            test.equal(openerAgent, data.openerID);
            test.equal(openedAgent, data.openedID);
            test.equal(CellType.OPENED, data.cellType);
            test.done();
        });
    }

    public static testParseOpenFailed(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var openerAgent : number = getRandInt(4);
        var openedAgent : number = getRandInt(4);
        buf.writeUInt16BE(0, 0);
        buf.writeUInt8(CellType.OPEN_FAILED, 2);
        buf.writeUInt32BE(openerAgent, 3);
        buf.writeUInt32BE(openedAgent, 7);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(4);
            test.notEqual(data, null);
            test.equal(openerAgent, data.openerID);
            test.equal(openedAgent, data.openedID);
            test.equal(CellType.OPEN_FAILED, data.cellType);
            test.done();
        });
    }

    public static testParseOpenError(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var openerAgent : number = getRandInt(4);
        var openedAgent : number = getRandInt(4);
        buf.writeUInt16BE(getRandInt(2), 0);
        buf.writeUInt8(CellType.OPEN, 2);
        buf.writeUInt32BE(openerAgent, 3);
        buf.writeUInt32BE(openedAgent, 7);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(1);
            test.equal(data, null);
            test.done();
        });
    }

    public static testParseCreate(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var circuitID : number = getRandInt(2);
        buf.writeUInt16BE(circuitID, 0);
        buf.writeUInt8(CellType.CREATE, 2);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(3);
            test.notEqual(data, null);
            test.equal(circuitID, data.circuitID);
            test.equal(CellType.CREATE, data.cellType);
            test.done();
        });
    }

    public static testParseCreated(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var circuitID : number = getRandInt(2);
        buf.writeUInt16BE(circuitID, 0);
        buf.writeUInt8(CellType.CREATED, 2);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(3);
            test.notEqual(data, null);
            test.equal(circuitID, data.circuitID);
            test.equal(CellType.CREATED, data.cellType);
            test.done();
        });
    }

    public static testParseCreateFailed(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var circuitID : number = getRandInt(2);
        buf.writeUInt16BE(circuitID, 0);
        buf.writeUInt8(CellType.CREATE_FAILED, 2);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(3);
            test.notEqual(data, null);
            test.equal(circuitID, data.circuitID);
            test.equal(CellType.CREATE_FAILED, data.cellType);
            test.done();
        });
    }

    public static testParseDestroy(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var circuitID : number = getRandInt(2);
        buf.writeUInt16BE(circuitID, 0);
        buf.writeUInt8(CellType.DESTROY, 2);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(3);
            test.notEqual(data, null);
            test.equal(circuitID, data.circuitID);
            test.equal(CellType.DESTROY, data.cellType);
            test.done();
        });
    }

    public static testParseRelay(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var circuitID : number = getRandInt(2);
        buf.writeUInt16BE(circuitID, 0);
        buf.writeUInt8(CellType.RELAY, 2);
        buf.writeUInt16BE(0, 5);

        // set the body length to 0
        buf.writeUInt16BE(0, 11);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(3);
            test.notEqual(data, null);
            test.equal(circuitID, data.circuitID);
            test.equal(CellType.RELAY, data.cellType);
            test.done();
        });
    }

    public static testParseRelayWriteError(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var circuitID : number = getRandInt(2);
        buf.writeUInt16BE(circuitID, 0);
        buf.writeUInt8(CellType.RELAY, 2);
        buf.writeUInt16BE(getRandInt(2), 5);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(1);
            test.equal(data, null);
            test.done();
        });
    }

    public static testParseRelayLengthError(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var circuitID : number = getRandInt(2);
        buf.writeUInt16BE(circuitID, 0);
        buf.writeUInt8(CellType.RELAY, 2);
        buf.writeUInt16BE(0, 5);
        buf.writeUInt16BE(600, 11);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(1);
            test.equal(data, null);
            test.done();
        });
    }

    public static testParseRelayBegin(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        var digest : number = getRandInt(4);
        buf.writeUInt16BE(circuitID, 0);
        buf.writeUInt8(CellType.RELAY, 2);
        buf.writeUInt16BE(streamID, 3);
        buf.writeUInt16BE(0, 5);
        buf.writeUInt32BE(digest, 7);
        buf.writeUInt8(RelayCommand.BEGIN, 13);

        var host : string = "www.google.com:443";
        buf.writeUInt16BE(host.length, 11);
        buf.write(host, 14);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(7);
            test.notEqual(data, null);
            test.equal(circuitID, data.circuitID);
            test.equal(CellType.RELAY, data.cellType);
            test.equal(streamID, data.streamID);
            test.equal(digest, data.digest);
            test.equal(RelayCommand.BEGIN, data.relayCommand);
            test.equal(host, data.host);
            test.done();
        });
    }

    public static testParseRelayData(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        var digest : number = getRandInt(4);
        buf.writeUInt16BE(circuitID, 0);
        buf.writeUInt8(CellType.RELAY, 2);
        buf.writeUInt16BE(streamID, 3);
        buf.writeUInt16BE(0, 5);
        buf.writeUInt32BE(digest, 7)
        buf.writeUInt8(RelayCommand.DATA, 13);

        // choose a random body length
        var bodyLength = Math.floor(Math.random() * (CELL_SIZE - 15)) + 1;
        for (var i = RELAY_HEADER_SIZE; i < bodyLength; i++) {
            buf[i] = getRandInt(1);
        }

        var bodyCopy : Buffer = buf.slice(RELAY_HEADER_SIZE, RELAY_HEADER_SIZE + bodyLength);

        buf.writeUInt16BE(bodyLength, 11);


        parser.parseTor61Cell(buf, (data) => {
            test.expect(7);
            test.notEqual(data, null);
            test.equal(circuitID, data.circuitID);
            test.equal(CellType.RELAY, data.cellType);
            test.equal(streamID, data.streamID);
            test.equal(digest, data.digest);
            test.equal(RelayCommand.DATA, data.relayCommand);
            test.ok(bodyCopy.equals(data.data));
            test.done();
        });
    }

    public static testParseRelayEnd(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        var digest : number = getRandInt(4);
        buf.writeUInt16BE(circuitID, 0);
        buf.writeUInt8(CellType.RELAY, 2);
        buf.writeUInt16BE(streamID, 3);
        buf.writeUInt16BE(0, 5);
        buf.writeUInt32BE(digest, 7)
        buf.writeUInt16BE(0,11);
        buf.writeUInt8(RelayCommand.END, 13);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(6);
            test.notEqual(data, null);
            test.equal(circuitID, data.circuitID);
            test.equal(CellType.RELAY, data.cellType);
            test.equal(streamID, data.streamID);
            test.equal(digest, data.digest);
            test.equal(RelayCommand.END, data.relayCommand);
            test.done();
        });
    }

    public static testParseRelayConnected(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        var digest : number = getRandInt(4);
        buf.writeUInt16BE(circuitID, 0);
        buf.writeUInt8(CellType.RELAY, 2);
        buf.writeUInt16BE(streamID, 3);
        buf.writeUInt16BE(0, 5);
        buf.writeUInt32BE(digest, 7);
        buf.writeUInt16BE(0,11);
        buf.writeUInt8(RelayCommand.CONNECTED, 13);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(6);
            test.notEqual(data, null);
            test.equal(circuitID, data.circuitID);
            test.equal(CellType.RELAY, data.cellType);
            test.equal(streamID, data.streamID);
            test.equal(digest, data.digest);
            test.equal(RelayCommand.CONNECTED, data.relayCommand);
            test.done();
        });
    }

    public static testParseRelayExtend(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        var digest : number = getRandInt(4);
        buf.writeUInt16BE(circuitID, 0);
        buf.writeUInt8(CellType.RELAY, 2);
        buf.writeUInt16BE(streamID, 3);
        buf.writeUInt16BE(0, 5);
        buf.writeUInt32BE(digest, 7);
        buf.writeUInt8(RelayCommand.EXTEND, 13);

        var host : string = "www.google.com:443";
        buf.write(host, RELAY_HEADER_SIZE);

        var agentID : number = getRandInt(4);
        buf.writeUInt32BE(agentID, RELAY_HEADER_SIZE + host.length);

        buf.writeUInt16BE(host.length + 4, 11);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(8);
            test.notEqual(data, null);
            test.equal(circuitID, data.circuitID);
            test.equal(CellType.RELAY, data.cellType);
            test.equal(streamID, data.streamID);
            test.equal(digest, data.digest);
            test.equal(RelayCommand.EXTEND, data.relayCommand);
            test.equal(host, data.host);
            test.equal(agentID, data.agentID);
            test.done();
        });
    }

    public static testParseRelayExtended(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        var digest : number = getRandInt(4);
        buf.writeUInt16BE(circuitID, 0);
        buf.writeUInt8(CellType.RELAY, 2);
        buf.writeUInt16BE(streamID, 3);
        buf.writeUInt16BE(0, 5);
        buf.writeUInt32BE(digest, 7);
        buf.writeUInt16BE(0,11);
        buf.writeUInt8(RelayCommand.EXTENDED, 13);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(6);
            test.notEqual(data, null);
            test.equal(circuitID, data.circuitID);
            test.equal(CellType.RELAY, data.cellType);
            test.equal(streamID, data.streamID);
            test.equal(digest, data.digest);
            test.equal(RelayCommand.EXTENDED, data.relayCommand);
            test.done();
        });
    }

    public static testParseRelayBeginFailed(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        var digest : number = getRandInt(4);
        buf.writeUInt16BE(circuitID, 0);
        buf.writeUInt8(CellType.RELAY, 2);
        buf.writeUInt16BE(streamID, 3);
        buf.writeUInt16BE(0, 5);
        buf.writeUInt32BE(digest, 7);
        buf.writeUInt16BE(0,11);
        buf.writeUInt8(RelayCommand.BEGIN_FAILED, 13);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(6);
            test.notEqual(data, null);
            test.equal(circuitID, data.circuitID);
            test.equal(CellType.RELAY, data.cellType);
            test.equal(streamID, data.streamID);
            test.equal(digest, data.digest);
            test.equal(RelayCommand.BEGIN_FAILED, data.relayCommand);
            test.done();
        });
    }

    public static testParseRelayExtendFailed(test) {
        var buf : Buffer = new Buffer(CELL_SIZE);
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        var digest : number = getRandInt(4);
        buf.writeUInt16BE(circuitID, 0);
        buf.writeUInt8(CellType.RELAY, 2);
        buf.writeUInt16BE(streamID, 3);
        buf.writeUInt16BE(0, 5);
        buf.writeUInt32BE(digest, 7);
        buf.writeUInt16BE(0,11);
        buf.writeUInt8(RelayCommand.EXTEND_FAILED, 13);

        parser.parseTor61Cell(buf, (data) => {
            test.expect(6);
            test.notEqual(data, null);
            test.equal(circuitID, data.circuitID);
            test.equal(CellType.RELAY, data.cellType);
            test.equal(streamID, data.streamID);
            test.equal(digest, data.digest);
            test.equal(RelayCommand.EXTEND_FAILED, data.relayCommand);
            test.done();
        });
    }

    public static testParseHTTPHeader(test) {
        var request = "GET http://www.my.example.page.com/ HTTP/1.1 \r\nHost: www.my.example.page.com\r\nUser-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:26.0) Gecko/20100101 Firefox/26.0\r\nAccept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\nAccept-Language: en-US,en;q=0.5\r\nAccept-Encoding: gzip, deflate\r\nConnection: keep-alive\r\n\r\n";
        var buf = new Buffer(request);

        parser.parseHTTPHeader(buf, (data) => {
            test.expect(4)
            test.notEqual(data, null);
            test.equal("GET", data.command);
            test.equal("www.my.example.page.com", data.host);
            test.equal(80, data.port);
            test.done();
        });
    }

    public static testParseHTTPHeaderPortParse(test) {
        var request = "GET http://www.my.example.page.com/ HTTP/1.1 \r\nHost: www.my.example.page.com:684\r\nUser-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:26.0) Gecko/20100101 Firefox/26.0\r\nAccept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\nAccept-Language: en-US,en;q=0.5\r\nAccept-Encoding: gzip, deflate\r\nConnection: keep-alive\r\n\r\n";
        var buf = new Buffer(request);

        parser.parseHTTPHeader(buf, (data) => {
            test.expect(4)
            test.notEqual(data, null);
            test.equal("GET", data.command);
            test.equal("www.my.example.page.com", data.host);
            test.equal(684, data.port);
            test.done();
        });
    }

    public static testParseHTTPHeaderProtocolError(test) {
        var request = "GETT http://www.my.example.page.com/ HTTP/1.1 \r\nHost: www.my.example.page.com:684\r\nUser-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:26.0) Gecko/20100101 Firefox/26.0\r\nAccept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\nAccept-Language: en-US,en;q=0.5\r\nAccept-Encoding: gzip, deflate\r\nConnection: keep-alive\r\n\r\n";
        var buf = new Buffer(request);

        parser.parseHTTPHeader(buf, (data) => {
            test.expect(1)
            test.equal(data, null);
            test.done();
        });
    }

    public static testParseHTTPHeaderHostError(test) {
        var request = "GET http://www.my.example.page.com/ HTTP/1.1 \r\nUser-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:26.0) Gecko/20100101 Firefox/26.0\r\nAccept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\nAccept-Language: en-US,en;q=0.5\r\nAccept-Encoding: gzip, deflate\r\nConnection: keep-alive\r\n\r\n";
        var buf = new Buffer(request);

        parser.parseHTTPHeader(buf, (data) => {
            test.expect(1)
            test.equal(data, null);
            test.done();
        });
    }

    public static testParseHTTPResponse(test) {
        var response = "HTTP/1.1 200 OK\r\nContent-Length: 50\r\nContent-type: text/html\r\nDate: Sun, 20 Oct 2002 22:52:35 GMT\r\n\r\n<HTML>\r\n<BODY>\r\n\r\nHello World.\r\n\r\n</BODY>\r\n</HTML>"
        var buf = new Buffer(response);
        parser.parseHTTPResponse(buf, (data) => {
            test.expect(6);
            test.notEqual(data, null);
            test.equal("HTTP/1.1", data.protocolVersion);
            test.equal("200", data.statusCode);
            test.equal("OK", data.statusMessage);
            test.equal("50", data.headers["content-length"]);
            test.equal("<HTML>\r\n<BODY>\r\n\r\nHello World.\r\n\r\n</BODY>\r\n</HTML>", data.body);
            test.done();
        });
    }

}

export = Tor61ParsingServiceTest;
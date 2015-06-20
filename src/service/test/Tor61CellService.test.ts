import Tor61CellService = require('../Tor61CellService');
import Tor61ParsingService = require('../Tor61ParsingService');
import CellType = require('../../utils/CellType');
import RelayCommand = require('../../utils/RelayCommand');
import Constant = require('../../Constant');

var service : Tor61CellService = new Tor61CellService();
// disable emitting for the purposes of testing
(<any> service).aEmit = function() {};
var parser : Tor61ParsingService = new Tor61ParsingService();
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

class Tor61CellServiceTest {
    public static testCellSize(test) {
        service.getCell(getRandInt(2), CellType.CREATE, (cell) => {
            test.expect(1);
            test.equal(cell.length, CELL_SIZE);
            test.done();
        });
    }

    public static testOpenCellSize(test) {
        service.getOpenCell(CellType.OPEN, getRandInt(4), getRandInt(4), (cell) => {
            test.expect(1);
            test.equal(cell.length, CELL_SIZE);
            test.done();
        });
    }

    public static testRelayCellSize(test) {
        service.getRelayCell(getRandInt(2), getRandInt(2), RelayCommand.NONE, {}, (cell) => {
            test.expect(1);
            test.equal(cell.length, CELL_SIZE);
            test.done();
        });
    }

	public static testGetCellCreate(test) {
        var circuitID = getRandInt(2);
        service.getCell(circuitID, CellType.CREATE, (cell) => {
            parser.parseTor61Cell(cell, (data) => {
                test.expect(3);
                test.notEqual(data, null);
                test.equal(circuitID, data.circuitID);
                test.equal(CellType.CREATE, data.cellType);
                test.done();
            });
        });
	}

    public static testGetCellCreated(test) {
        var circuitID = getRandInt(2);
        service.getCell(circuitID, CellType.CREATED, (cell) => {
            parser.parseTor61Cell(cell, (data) => {
                test.expect(3);
                test.notEqual(data, null);
                test.equal(circuitID, data.circuitID);
                test.equal(CellType.CREATED, data.cellType);
                test.done();
            });
        });
    }

    public static testGetCellCreateFailed(test) {
        var circuitID = getRandInt(2);
        service.getCell(circuitID, CellType.CREATE_FAILED, (cell) => {
            parser.parseTor61Cell(cell, (data) => {
                test.expect(3);
                test.notEqual(data, null);
                test.equal(circuitID, data.circuitID);
                test.equal(CellType.CREATE_FAILED, data.cellType);
                test.done();
            });
        });
    }

    public static testGetCellDestroy(test) {
        var circuitID = getRandInt(2);
        service.getCell(circuitID, CellType.DESTROY, (cell) => {
            parser.parseTor61Cell(cell, (data) => {
                test.expect(3);
                test.notEqual(data, null);
                test.equal(circuitID, data.circuitID);
                test.equal(CellType.DESTROY, data.cellType);
                test.done();
            });
        });
    }

    public static testGetCellInvalidCellType(test) {
        var circuitID = getRandInt(2);
        service.getCell(circuitID, CellType.OPEN, (cell) => {
            test.expect(1);
            test.equal(cell, null);
            test.done();
        });
    }

    public static testGetOpenCellOpen(test) {
        var openerAgent : number = getRandInt(4);
        var openedAgent : number = getRandInt(4);
        service.getOpenCell(CellType.OPEN, openerAgent, openedAgent, (cell) => {
            parser.parseTor61Cell(cell, (data) => {
                test.expect(4);
                test.notEqual(data, null);
                test.equal(openerAgent, data.openerID);
                test.equal(openedAgent, data.openedID);
                test.equal(CellType.OPEN, data.cellType);
                test.done();
            });
        });
    }

    public static testGetOpenCellOpened(test) {
        var openerAgent : number = getRandInt(4);
        var openedAgent : number = getRandInt(4);
        service.getOpenCell(CellType.OPENED, openerAgent, openedAgent, (cell) => {
            parser.parseTor61Cell(cell, (data) => {
                test.expect(4);
                test.notEqual(data, null);
                test.equal(openerAgent, data.openerID);
                test.equal(openedAgent, data.openedID);
                test.equal(CellType.OPENED, data.cellType);
                test.done();
            });
        });
    }

    public static testGetOpenCellOpenFailed(test) {
        var openerAgent : number = getRandInt(4);
        var openedAgent : number = getRandInt(4);
        service.getOpenCell(CellType.OPEN_FAILED, openerAgent, openedAgent, (cell) => {
            parser.parseTor61Cell(cell, (data) => {
                test.expect(4);
                test.notEqual(data, null);
                test.equal(openerAgent, data.openerID);
                test.equal(openedAgent, data.openedID);
                test.equal(CellType.OPEN_FAILED, data.cellType);
                test.done();
            });
        });
    }

    public static testGetOpenCellInvalidCellType(test) {
        var openerAgent: number = getRandInt(4);
        var openedAgent: number = getRandInt(4);
        service.getOpenCell(CellType.DESTROY, openerAgent, openedAgent, (cell) => {
            test.expect(1);
            test.equal(cell, null);
            test.done();
        });
    }

    public static testGetRelayCellBegin(test) {
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        var host = "www.google.com:443";
        service.getRelayCell(circuitID, streamID, RelayCommand.BEGIN, {
                "host" : host
            }, (cell) => {
            parser.parseTor61Cell(cell, (data) => {
                test.expect(6);
                test.notEqual(data, null);
                test.equal(circuitID, data.circuitID);
                test.equal(CellType.RELAY, data.cellType);
                test.equal(streamID, data.streamID);
                test.equal(RelayCommand.BEGIN, data.relayCommand);
                test.equal(host, data.host);
                test.done();
            });
        });
    }

    public static testGetRelayCellData(test) {
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);

        // choose a random body length
        var bodyLength = Math.floor(Math.random() * (CELL_SIZE - 15)) + 1;
        var buf : Buffer = new Buffer(bodyLength);
        for (var i = RELAY_HEADER_SIZE; i < bodyLength; i++) {
            buf[i] = getRandInt(1);
        }
        service.getRelayCell(circuitID, streamID, RelayCommand.DATA, {
                "data" : buf
            }, (cell) => {
            parser.parseTor61Cell(cell, (data) => {
                test.expect(6);
                test.notEqual(data, null);
                test.equal(circuitID, data.circuitID);
                test.equal(CellType.RELAY, data.cellType);
                test.equal(streamID, data.streamID);
                test.equal(RelayCommand.DATA, data.relayCommand);
                test.ok(buf.equals(data.data));
                test.done();
            });
        });
    }

    public static testGetRelayCellEnd(test) {
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        service.getRelayCell(circuitID, streamID, RelayCommand.END, {}, (cell) => {
            parser.parseTor61Cell(cell, (data) => {
                test.expect(5);
                test.notEqual(data, null);
                test.equal(circuitID, data.circuitID);
                test.equal(CellType.RELAY, data.cellType);
                test.equal(streamID, data.streamID);
                test.equal(RelayCommand.END, data.relayCommand);
                test.done();
            });
        });
    }

    public static testGetRelayCellConnected(test) {
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        service.getRelayCell(circuitID, streamID, RelayCommand.CONNECTED, {}, (cell) => {
            parser.parseTor61Cell(cell, (data) => {
                test.expect(5);
                test.notEqual(data, null);
                test.equal(circuitID, data.circuitID);
                test.equal(CellType.RELAY, data.cellType);
                test.equal(streamID, data.streamID);
                test.equal(RelayCommand.CONNECTED, data.relayCommand);
                test.done();
            });
        });
    }

    public static testGetRelayCellExtend(test) {
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        var host : string = "www.google.com:443";
        var agentID = getRandInt(4);
        service.getRelayCell(circuitID, streamID, RelayCommand.EXTEND, {
                "host" : host,
                "agentID" : agentID
            }, (cell) => {
            parser.parseTor61Cell(cell, (data) => {
                test.expect(7);
                test.notEqual(data, null);
                test.equal(circuitID, data.circuitID);
                test.equal(CellType.RELAY, data.cellType);
                test.equal(streamID, data.streamID);
                test.equal(RelayCommand.EXTEND, data.relayCommand);
                test.equal(host, data.host);
                test.equal(agentID, data.agentID);
                test.done();
            });
        });
    }

    public static testGetRelayCellExtended(test) {
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        service.getRelayCell(circuitID, streamID, RelayCommand.EXTENDED, {}, (cell) => {
            parser.parseTor61Cell(cell, (data) => {
                test.expect(5);
                test.notEqual(data, null);
                test.equal(circuitID, data.circuitID);
                test.equal(CellType.RELAY, data.cellType);
                test.equal(streamID, data.streamID);
                test.equal(RelayCommand.EXTENDED, data.relayCommand);
                test.done();
            });
        });
    }

    public static testGetRelayCellBeginFailed(test) {
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        service.getRelayCell(circuitID, streamID, RelayCommand.BEGIN_FAILED, {}, (cell) => {
            parser.parseTor61Cell(cell, (data) => {
                test.expect(5);
                test.notEqual(data, null);
                test.equal(circuitID, data.circuitID);
                test.equal(CellType.RELAY, data.cellType);
                test.equal(streamID, data.streamID);
                test.equal(RelayCommand.BEGIN_FAILED, data.relayCommand);
                test.done();
            });
        });
    }

    public static testGetRelayCellExtendFailed(test) {
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        service.getRelayCell(circuitID, streamID, RelayCommand.EXTEND_FAILED, {}, (cell) => {
            parser.parseTor61Cell(cell, (data) => {
                test.expect(5);
                test.notEqual(data, null);
                test.equal(circuitID, data.circuitID);
                test.equal(CellType.RELAY, data.cellType);
                test.equal(streamID, data.streamID);
                test.equal(RelayCommand.EXTEND_FAILED, data.relayCommand);
                test.done();
            });
        });
    }

    public static testGetRelayCellBeginExtrasError(test) {
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        service.getRelayCell(circuitID, streamID, RelayCommand.BEGIN, {}, (cell) => {
            test.expect(1)
            test.equal(cell, null);
            test.done();
        });
    }

    public static testGetRelayCellDataExtrasError(test) {
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        service.getRelayCell(circuitID, streamID, RelayCommand.DATA, {}, (cell) => {
            test.expect(1)
            test.equal(cell, null);
            test.done();
        });
    }

    public static testGetRelayCellExtendExtrasError(test) {
        var circuitID : number = getRandInt(2);
        var streamID : number = getRandInt(2);
        service.getRelayCell(circuitID, streamID, RelayCommand.EXTEND, {}, (cell) => {
            test.expect(1)
            test.equal(cell, null);
            test.done();
        });
    }

    public static testChangeCircuitID(test) {
        var circuitID : number = getRandInt(2);
        var newCircuitID : number = circuitID - 1;
        service.getCell(circuitID, CellType.CREATE, (cell) => {
            var newCell = service.changeCircuitID(cell, newCircuitID);
            parser.parseTor61Cell(cell, (data) => {
                test.expect(3);
                test.notEqual(data, null);
                test.equal(newCircuitID, data.circuitID);
                test.notEqual(circuitID, data.circuitID);
                test.done();
            });
        });
    }

    public static testGetDataCellsLengthOne(test) {
        var buf : Buffer = new Buffer(300);
        service.getDataCells(buf, getRandInt(2), 0, (cells) => {
            test.expect(1);
            test.equal(cells.length, Constant.CELL_SIZE);
            test.done();
        });
    }

    public static testGetDataCellsLengthMany(test) {
        var buf : Buffer = new Buffer(1200);
        service.getDataCells(buf, getRandInt(2), 0, (cells) => {
            test.expect(1);
            test.equal(cells.length, 3 * Constant.CELL_SIZE);
            test.done();
        });
    }
}

export = Tor61CellServiceTest;
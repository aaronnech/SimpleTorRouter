/**
 * Global Constants for the Tor61 Application
 */
class Constant {
	public static SERVICE_NAMES: any = {
		CELL: 'CellService',
		CIRCUIT: 'CircuitService',
		ENTRANCE: 'EntranceService',
		ERROR: 'ErrorService',
		EXIT: 'ExitService',
		PARSING: 'ParsingService',
		REGISTRATION: 'RegistrationService',
		ROUTING: 'RoutingService',
		SOCKET: 'SocketService',
		PEER_INPUT: 'PeerInputService'
	};

	public static CELL_SIZE : number = 512;
	public static RELAY_HEADER_SIZE : number = 14;
}

export = Constant;
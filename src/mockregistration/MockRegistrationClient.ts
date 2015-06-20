import Tor61SocketService = require('../service/Tor61SocketService');

/**
 * Utility client to help test the routers. Connects
 * and registers with the MockRegistrationServer running
 * in a seperate process
 */
class MockRegistrationClient {
	private static MOCK_SERVER_PORT: number = 1337;

	private socketService: Tor61SocketService;
	private registrationConnection: string;

	private port: number;
	private routerName: string;
	private agentID: number;

	constructor(port : number, routerName : string, agentID : number) {
		this.socketService = new Tor61SocketService();
		this.registrationConnection = null;

		this.port = port;
		this.routerName = routerName;
		this.agentID = agentID;
	}

	/**
	 * Registers with the MockRegistrationServer
	 * @param {Function} callback The callback function
	 */
	public register(callback : Function) : void {
		this.socketService.client('127.0.0.1', MockRegistrationClient.MOCK_SERVER_PORT, (cid, socket) => {
			this.registrationConnection = cid;

			var message: string =
				'reg:'
				+ this.port + ' '
				+ this.routerName + ' '
				+ this.agentID;

			this.socketService.write(cid, new Buffer(message));

			var stream = this.socketService.dataStreamer(this.registrationConnection);
			stream.once('data', (resp) => {
				if (resp.toString() == 'ok')
					callback();
			});
		});
	}

	/**
	 * Unregisters with the MockRegistrationServer
	 */
	public unregister() : void {
		if (this.registrationConnection) {
			this.socketService.write(this.registrationConnection, new Buffer('unreg'));
			this.socketService.close(this.registrationConnection);
			this.registrationConnection = null;
		}
	}

	/**
	 * Returns a list of registered routers
	 * @param {Function} callback The callback function
	 * @return {string[]} The registered routers list
	 */
	public fetch(callback : Function) : void {
		if (this.registrationConnection) {
			var stream = this.socketService.dataStreamer(this.registrationConnection);
			stream.once('data', (resp) => {
				callback(resp.toString().split(';'));
			});

			this.socketService.write(this.registrationConnection, new Buffer('list'));
		} else {
			callback(null);
		}
	}
}

export = MockRegistrationClient;
import Tor61SocketService = require('../service/Tor61SocketService');

/**
 * Utility server to help test the routers. Acts
 * as a fake, local registration server
 */
class MockRegistrationServer {
	private static MOCK_SERVER_PORT: number = 1337;

	private socketService: Tor61SocketService;
	private registered: any;

	constructor() {
		this.socketService = new Tor61SocketService(true);
		this.registered = {};

		this.launchServer();
	}	

	/**
	 * Launches the mock server
	 */
	private launchServer() {
		this.socketService.server((id, server, port) => {
			console.log('Registration service up on port ' + port);

			this.socketService.on('connection:' + id, (cid) => {
				console.log('Peer router connection: ' + cid);

				var stream = this.socketService.dataStreamer(cid);
				stream.on('data', (data) => {
					this.handleRouterData(cid, data);
				});
			});

			this.socketService.once('close:' + id, (closedId) => {
				this.registered[closedId] = undefined;
			});

		}, MockRegistrationServer.MOCK_SERVER_PORT);
	}

	/**
	 * Called when a router sends data to us
	 * @param {string} cid  Router connection id
	 * @param {Buffer} data Router data
	 */
	private handleRouterData(cid : string, data : Buffer) {
		var str = data.toString();

		if (str.substr(0, 4) == 'reg:') {
			var registration = str.split(':')[1];

			console.log('router ' + cid + ' registered with ' + registration);

			this.registered[cid] = registration;

			this.socketService.write(cid, new Buffer('ok'));
		} else if(str.substr(0, 5) == 'unreg') {
			if (this.registered[cid]) {
				this.socketService.write(cid, new Buffer('ok'));
				this.registered[cid] = undefined;
			}
		} else {
			var connections = [];

			for (var key in this.registered) {
				if (this.registered.hasOwnProperty(key) && this.registered[key]) {
					connections.push(this.registered[key]);
				}
			}

			console.log('router ' + cid + ' requested list. Sending back:');
			console.log(connections.join(';'));

			this.socketService.write(cid, new Buffer(connections.join(';')));
		}
	}

}

export = MockRegistrationServer;
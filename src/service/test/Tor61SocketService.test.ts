import Tor61SocketService = require('../Tor61SocketService');

var service : Tor61SocketService = new Tor61SocketService();

class Tor61SocketServiceTest {
	public static createServer(test) {
		service.server((id, server, port) => {
			if (port) {
				setTimeout(() => {
					service.close(id);
				}, 500);
				test.done();
			}
		});
	}

	public static connectToGoogle(test) {
		service.client("www.google.com", 80, (id, socket) => {
			if (socket) {
				setTimeout(() => {
					service.close(id);
				}, 500);
				test.done();
			}
		});
	}


	public static testConnectEvent(test) {
		service.once('connection', (id, sock) => {
			setTimeout(() => {
				service.close(id);
			}, 500);
			test.done();
		});

		service.client("www.google.com", 80, (id, socket) => {});
	}
}

export = Tor61SocketServiceTest;
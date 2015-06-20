import Tor61CellService = require('./service/Tor61CellService');
import Tor61CircuitService = require('./service/Tor61CircuitService');
import Tor61EntranceService = require('./service/Tor61EntranceService');
import Tor61ErrorService = require('./service/Tor61ErrorService');
import Tor61ExitService = require('./service/Tor61ExitService');
import Tor61ParsingService = require('./service/Tor61ParsingService');
import Tor61RegistrationService = require('./service/Tor61RegistrationService');
import Tor61RoutingService = require('./service/Tor61RoutingService');
import Tor61PeerInputService = require('./service/Tor61PeerInputService');
import Tor61Service = require('./service/Tor61Service');
import Tor61SocketService = require('./service/Tor61SocketService');

/**
 * The Tor61Router - Encompasses all the functionality of the Tor61 Router
 * specification as a composition of router services.
 */
class Tor61Router {
	private httpProxyPort: number;
	private groupNumber: number;
	private instanceNumber: number;
	private services: Tor61Service[];

	constructor(groupNumber : number, instanceNumber : number, httpProxyPort : number) {
		this.httpProxyPort = httpProxyPort;
		this.groupNumber = groupNumber;
		this.instanceNumber = instanceNumber;
		this.services = null;
	}

	/**
	 * Allocates all the services of the router
	 */
	private allocateServices() {
		this.services = [
			new Tor61CellService(),
			new Tor61CircuitService(),
			new Tor61PeerInputService(),
			new Tor61EntranceService(this.httpProxyPort),
			new Tor61ErrorService(),
			new Tor61ExitService(),
			new Tor61ParsingService(),
			new Tor61RegistrationService(this.groupNumber, this.instanceNumber),
			new Tor61RoutingService(this.groupNumber, this.instanceNumber),
			new Tor61SocketService()
		];
	}

	/**
	 * Starts the services in the router
	 */
	private startServices() {
		for (var i = 0; i < this.services.length; i++) {
			this.services[i].start(this.services);
		}
	}

	/**
	 * Shuts down the router safely
	 */
	public shutdown() {
		if (this.services && this.services.length) {
			for (var i = 0; i < this.services.length; i++) {
				this.services[i].removeAllListeners();
				this.services[i].shutdown();
			}

			this.services = null;
		}
	}

	/**
	 * Reboots the router
	 */
	public reboot() {
		this.shutdown();
		this.allocateServices();
		this.startServices();
	}
}

export = Tor61Router;
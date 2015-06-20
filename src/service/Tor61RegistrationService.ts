/// <reference path="../def/node.d.ts"/>

import Tor61Service = require('./Tor61Service');
import Tor61CircuitService = require('./Tor61CircuitService');
import MockRegistrationClient = require('../mockregistration/MockRegistrationClient');
import ErrorType = require('../utils/ErrorType');

import Constant = require('../Constant');
var spawn = require('child_process').spawn;
var sprintf = require("sprintf-js").sprintf;

var fetchClientPath : string = "./vendor/fetch.py";
var regClientPath : string = "./vendor/registration_client.py";

/**
 * Registers with the router registration central server,
 * provides functionality to retrieve router lists.
 */
class Tor61RegistrationService extends Tor61Service {
    private nameString : string;
    private fetchClient : any;
    private registerClient : any;
    private groupID : number;
    private instanceID : number;
    private port : number;
    private agentID : number;

    private static DEBUG = false;
    private mockRegistrationClient : MockRegistrationClient;

	constructor(group : number, instance : number) {
		super();
        this.nameString = "Tor61";
        this.groupID = group;
        if (instance > 9999) {
            this.aEmit('error', ErrorType.BOUNDS, "Instance is too high to be unique");
        }
        this.instanceID = instance;
        this.agentID = this.groupID * Math.pow(2, 16) + this.instanceID;
	}

    /**
     * Called on service start up
     * @param {Tor61Service[]} peerServices [description]
     */
    public start(services : Tor61Service[]) {
        super.start(services);
    }

    /**
     * Shuts down the service
     */
    public shutdown() {
        super.shutdown();
        this.killNodeRegistration();
        this.killNodeListFetch();
        this.fetchClient = null;
        this.registerClient = null;
    }

    /**
     * Runs the provided python client to fetch the list of current nodes.
     */
    public fetchNodeList() : void {
        if (Tor61RegistrationService.DEBUG) {
            this.mockRegistrationClient.fetch((list) => {
                if (list != null) {
                    this.aEmit('receivedRouters', list.map((router) => {
                        var split = router.split(' ');
                        return {
                            'host' : '127.0.0.1',
                            'port' : parseInt(split[0]),
                            'agentID' : parseInt(split[2])
                        };
                    }));
                } else {
                    this.aEmit('error', ErrorType.REGISTRATION_FETCH, "Mock registration service did not return a router list");
                }
            });
        } else {
            var allData : string = '';
            this.fetchClient = spawn('python', [fetchClientPath, this.nameString]);
            this.fetchClient.stdout.on('data', (data) => {
                allData += data;
            });
            this.fetchClient.stdout.on('end', () => {
                var entries : string[] = allData.split("\n");
                var routers : any[] = [];
                for (var i = 0; i < entries.length - 1; i++) {
                    if (entries[i] && entries[i] != '') {
                        var curr : string[] = entries[i].trim().split("\t");
                        routers[i] = {
                            "host" : curr[0],
                            "port" : curr[1],
                            "agentID" : curr[2]
                        };
                    }
                }

                if (routers.length == 0) {
                    this.log('Registration-fetch failed');
                    this.tick(() => {
                        this.killNodeRegistration();
                        this.killNodeListFetch();

                        this.log("Registering node");
                        this.registerNodeWithService(() => {
                            this.log("Node registered");
                            this.fetchNodeList();
                        });
                    });
                } else {
                    this.aEmit('receivedRouters', routers);
                }
            });
            this.fetchClient.stderr.on('data', (data) => {
                this.aEmit('error', ErrorType.REGISTRATION_FETCH, data);
            });
        }
    }

    /**
     * Registers our node with the class' central service by using
     * @param {Function} callback [description]
     */
    public registerNodeWithService(callback : Function) : void {
        if (Tor61RegistrationService.DEBUG) {
            this.mockRegistrationClient.register(callback);
        } else {
            this.registerClient = spawn('python', [regClientPath, this.port, this.generateRouterName(), this.agentID]);
            this.registerClient.stdout.on('data', (data) => {
                var splitData = data.toString().split("\n");
                for (var i = 0; i < splitData.length; i++) {
                    this.log(splitData[i]);
                }
            });
            this.registerClient.stderr.on('data', (data) => {
                this.aEmit('error', ErrorType.REGISTRATION_REGISTER, data);
            });

            this.tick(() => {
                callback();
            });
        }
    }

    /**
     * Kills the python process running the registration services
     */
    public killNodeRegistration() : void {
        if (Tor61RegistrationService.DEBUG) {
            this.mockRegistrationClient.unregister();
        } else {
            if (this.registerClient)
                this.registerClient.kill('SIGINT');
        }
    }

    /**
     * Kills the python process running the node list fetch
     */
    public killNodeListFetch() : void {
        if (this.fetchClient)
            this.fetchClient.kill('SIGINT');
    }

    /**
     * Helper method that returns the routure name given the group id and the
     * instance id
     */
    private generateRouterName() : string {
        return sprintf("Tor61Router-%04d-%04d", this.groupID, this.instanceID);
    }

    /**
     * Handlers for binding to other services
     */
    protected onBindPeerService(service : Tor61Service) : void {
        switch (service.getName()) {
            case Constant.SERVICE_NAMES.CIRCUIT:
                var circuitService : Tor61CircuitService = <Tor61CircuitService> service;
                circuitService.on('peerServerStart', (server, p) => {
                    this.port = p;

                    if (Tor61RegistrationService.DEBUG) {
                        this.mockRegistrationClient =
                            new MockRegistrationClient(this.port, this.generateRouterName(), this.agentID);
                    }

                    this.registerNodeWithService(() => {
                        this.log("Node registered");
                        this.fetchNodeList();
                    });
                });
                circuitService.on('getRouterList', () => {
                    this.log('Getting router list for circuit service...');
                    this.fetchNodeList();
                });
                break;
        }
    }

    /**
     * Gets this service's string name
     * @return {string} The unique name of this service
     */
    public getName() : string {
        return Constant.SERVICE_NAMES.REGISTRATION;
    }
}

export = Tor61RegistrationService;

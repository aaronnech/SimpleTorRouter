/// <reference path="../def/node.d.ts"/>

import Tor61Service = require('./Tor61Service');
import ErrorType = require('../utils/ErrorType');

import Constant = require('../Constant');

class Tor61ErrorService extends Tor61Service {

    constructor() {
        super();
    }

    /**
     * Gets this service's string name
     * @return {string} The unique name of this service
     */
    public getName() : string {
        return Constant.SERVICE_NAMES.ERROR;
    }

    protected onBindPeerService(service : Tor61Service) : void {
        service.on('error', (errType : ErrorType, msg : string) => {
            this.log(msg);
            console.trace();
            switch (service.getName()) {
                case Constant.SERVICE_NAMES.CELL:
                    this.processCellError(errType, msg);
                    break;
                case Constant.SERVICE_NAMES.CIRCUIT:
                    this.processCircuitError(errType, msg);
                    break;
                case Constant.SERVICE_NAMES.ENTRANCE:
                    this.processEntranceError(errType, msg);
                    break;
                case Constant.SERVICE_NAMES.EXIT:
                    this.processExitError(errType, msg);
                    break;
                case Constant.SERVICE_NAMES.PARSING:
                    this.processRoutingError(errType, msg);
                    break;
                case Constant.SERVICE_NAMES.REGISTRATION:
                    this.processRoutingError(errType, msg);
                    break;
                case Constant.SERVICE_NAMES.ROUTING:
                    this.processRoutingError(errType, msg);
                    break;
                case Constant.SERVICE_NAMES.SOCKET:
                    this.processSocketError(errType, msg);
                    break;
                default:
                    break;
            }
        });
    }

    /**
     * For the below methods, we switch on the error type; we then enumerate
     * the specific errors the merit a reboot in the case declarations.
     *
     * The default behavior is to not reboot.
     */

    private processCellError(err_id : number, msg : string) : void {
        switch (err_id) {
            // we dont want to reboot for errors in the cellService
            default:
                // Do nothing
                break;
        }
    }

    private processCircuitError(err_id : number, msg : string) {
        switch (err_id) {
            case ErrorType.START_CIRCUIT_FAILED:
                throw 'Error: forcing reboot';
                break;
            default:
                // Do nothing
                break;
        }
    }

    private processEntranceError(err_id : number, msg : string) {
        switch (err_id) {
            case ErrorType.SOCKET_CREATE_FAIL:
                throw 'Error: forcing reboot';
                break;
            default:
                // Do nothing
                break;
        }
    }

    private processExitError(err_id : number, msg : string) {
        switch (err_id) {
            // we dont want to reboot for errors in the exit service
            default:
                // Do nothing
                break;
        }
    }

    private processParsingError(err_id : number, msg : string) {
        switch (err_id) {
            // we dont want to reboot for errors in the parsing service
            default:
                // Do nothing
                break;
        }
    }

    private processRegistrationError(err_id : number, msg : string) {
        switch (err_id) {
            case ErrorType.REGISTRATION_REGISTER:
                throw 'Error: forcing reboot';
                break;
            default:
                // Do nothing
                break;
        }
    }

    private processRoutingError(err_id : number, msg : string) {
        switch (err_id) {
            // We dont throw errors as of yet
            default:
                // Do nothing
                break;
        }
    }

    private processSocketError(err_id : number, msg : string) {
        switch (err_id) {
            // we emit no errors, but probably should
            default:
                // Do nothing
                break;
        }
    }
}

export = Tor61ErrorService;
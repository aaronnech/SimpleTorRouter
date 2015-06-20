
/**
 * Enum containing error types
 */
enum ErrorType {
    CELL_FORMAT = 0,
    CELL_SIZE = 1,
    CELL_TYPE = 2,
    CLIENT_DISCONNECT = 3,
    NULL_CELL = 4,
    HTTP_FORMAT = 5,
    REGISTRATION_FETCH = 6,
    BOUNDS = 7,
    REGISTRATION_REGISTER = 8,
    SOCKET_CREATE_FAIL = 9,
    BAD_KEY = 10,
    CONNECTION_NOT_FOUND = 11,
    START_CIRCUIT_FAILED = 12,
    EXIT_RESPONSE = 13
}

export = ErrorType;
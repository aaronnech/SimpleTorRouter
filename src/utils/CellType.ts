
/**
 * Enum containing all the possible things a cell could be
 */
enum CellType {
    OPEN = 0x05,
    OPENED = 0x06,
    OPEN_FAILED = 0x07,
    CREATE = 0x01,
    CREATED = 0x02,
    CREATE_FAILED = 0x08,
    DESTROY = 0x04,
    RELAY = 0x03
};

export = CellType;
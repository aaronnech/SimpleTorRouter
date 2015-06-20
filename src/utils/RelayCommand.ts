/**
 * Enum that contains the subtypes of the RELAY cell
 */
enum RelayCommand {
    NONE = 0x00,
    BEGIN = 0x01,
    DATA = 0x02,
    END = 0x03,
    CONNECTED = 0x04,
    EXTEND = 0x06,
    EXTENDED = 0x07,
    BEGIN_FAILED = 0x0b,
    EXTEND_FAILED = 0x0c
};

export = RelayCommand;
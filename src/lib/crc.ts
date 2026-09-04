const CRC_TABLE = (() => {
  const table = new Uint16Array(256);
  for (let byte = 0; byte < 256; byte += 1) {
    let value = byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? (value >> 1) ^ 0xa001 : value >> 1;
    }
    table[byte] = value;
  }
  return table;
})();

export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = (crc >> 8) ^ CRC_TABLE[(crc ^ bytes[index]) & 0xff];
  }
  return crc & 0xffff;
}

export function appendCrc(bytes: Uint8Array): Uint8Array {
  const crc = crc16(bytes);
  const result = new Uint8Array(bytes.length + 2);
  result.set(bytes);
  result[bytes.length] = crc & 0xff;
  result[bytes.length + 1] = crc >> 8;
  return result;
}

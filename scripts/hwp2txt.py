"""Minimal HWP5 text extractor: paragraphs in order, table cells marked with ' | '."""
import olefile, zlib, struct, sys
def extract(path):
    ole = olefile.OleFileIO(path)
    compressed = struct.unpack('<I', ole.openstream('FileHeader').read()[36:40])[0] & 1
    secs = sorted([s for s in ole.listdir() if s[0] == 'BodyText'], key=lambda s: int(s[1][7:]))
    out = []
    for s in secs:
        data = ole.openstream(s).read()
        if compressed: data = zlib.decompress(data, -15)
        i = 0
        while i < len(data):
            h = struct.unpack('<I', data[i:i+4])[0]; i += 4
            tag, level, size = h & 0x3ff, (h >> 10) & 0x3ff, h >> 20
            if size == 0xfff: size = struct.unpack('<I', data[i:i+4])[0]; i += 4
            body = data[i:i+size]; i += size
            if tag == 72:  # LIST_HEADER (table cell etc.)
                out.append('\x00CELL')
            elif tag == 67:  # PARA_TEXT
                chars, j = [], 0
                while j < len(body):
                    c = struct.unpack('<H', body[j:j+2])[0]
                    if c < 32:
                        if c in (0, 10, 13) or 24 <= c <= 31:
                            j += 2
                            if c in (10, 13): chars.append('\n')
                        else:
                            j += 16
                            if c == 9: chars.append('\t')
                    else:
                        chars.append(chr(c)); j += 2
                out.append(''.join(chars).strip())
    txt = []
    for p in out:
        if p == '\x00CELL': txt.append(' | ')
        elif p: txt.append(p + ' ')
    return ''.join(txt).replace(' |  | ', ' | ')
if __name__ == '__main__':
    print(extract(sys.argv[1]))

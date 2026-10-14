import struct
import zlib
import os

def create_png_with_badge(size, filename):
    # Create RGBA buffer
    width = size
    height = size
    pixels = []

    # Colors
    bg_color = (0, 120, 212, 255)       # Microsoft Blue #0078D4
    border_color = (0, 90, 158, 255)   # Darker Blue #005A9E
    white = (255, 255, 255, 255)
    key_gold = (255, 215, 0, 255)

    center = size / 2.0
    radius = (size / 2.0) - 1.0

    raw = b''
    for y in range(height):
        row = b'\x00' # Filter byte 0 (None)
        for x in range(width):
            dx = x - center + 0.5
            dy = y - center + 0.5
            dist = (dx*dx + dy*dy) ** 0.5

            if dist > radius:
                # Outside circle - transparent
                row += bytes([0, 0, 0, 0])
            elif dist > radius - 1.0:
                # Smooth outer edge
                alpha = int(255 * (radius - dist))
                row += bytes([bg_color[0], bg_color[1], bg_color[2], alpha])
            else:
                # Inside circle
                # Draw letter "O" or key lock graphic depending on size
                # Normalize coordinates to [-1, 1]
                nx = dx / radius
                ny = dy / radius
                
                # Draw a clean stylized "O" (envelope / lock)
                # Outer ring of O
                dist_o = (nx*nx + ny*ny) ** 0.5
                if 0.45 <= dist_o <= 0.75:
                    row += bytes(white)
                # Key notch inside O
                elif -0.15 <= nx <= 0.15 and -0.15 <= ny <= 0.15:
                    row += bytes(key_gold)
                else:
                    # Subtle vertical gradient background
                    grad = int(bg_color[1] * (1.0 - ny * 0.2))
                    grad = max(0, min(255, grad))
                    row += bytes([bg_color[0], grad, bg_color[2], 255])
        raw += row

    header = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0) # 8-bit RGBA
    ihdr_crc = struct.pack('>I', zlib.crc32(b'IHDR' + ihdr_data))
    ihdr = struct.pack('>I', len(ihdr_data)) + b'IHDR' + ihdr_data + ihdr_crc

    compressed = zlib.compress(raw)
    idat_crc = struct.pack('>I', zlib.crc32(b'IDAT' + compressed))
    idat = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + idat_crc

    iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', zlib.crc32(b'IEND'))

    png_bytes = header + ihdr + idat + iend
    with open(filename, 'wb') as f:
        f.write(png_bytes)
    print(f"Generated {filename} ({size}x{size})")

create_png_with_badge(16, "icon16.png")
create_png_with_badge(48, "icon48.png")
create_png_with_badge(128, "icon128.png")
create_png_with_badge(128, "icon.png")

from PIL import Image, ImageDraw
import math, os

base = os.path.dirname(os.path.abspath(__file__))

def draw_logo(size):
    # Use 4x supersampling for smooth edges
    ss = 4
    s = size * ss
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = s / 2, s / 2
    pad = s * 0.04

    # Background rounded rect - dark navy
    r = s * 0.2
    d.rounded_rectangle([pad, pad, s - pad, s - pad], radius=r, fill=(15, 23, 42, 255))

    # === OUTER GEAR ===
    gear_r = s * 0.30
    inner_r = s * 0.22
    teeth = 8
    tooth_w = s * 0.042
    tooth_h = s * 0.065
    teal = (6, 182, 212, 255)
    teal2 = (14, 165, 233, 255)

    # Draw gear teeth
    for i in range(teeth):
        angle = (2 * math.pi / teeth) * i - math.pi / teeth
        tx = cx + (gear_r + tooth_h * 0.4) * math.cos(angle)
        ty = cy + (gear_r + tooth_h * 0.4) * math.sin(angle)
        cos_a = math.cos(angle)
        sin_a = math.sin(angle)
        cos_p = math.cos(angle + math.pi / 2)
        sin_p = math.sin(angle + math.pi / 2)
        hw, hh = tooth_w, tooth_h
        corners = [
            (tx - cos_p * hw - cos_a * hh, ty - sin_p * hw - sin_a * hh),
            (tx + cos_p * hw - cos_a * hh, ty + sin_p * hw - sin_a * hh),
            (tx + cos_p * hw + cos_a * hh, ty + sin_p * hw + sin_a * hh),
            (tx - cos_p * hw + cos_a * hh, ty - sin_p * hw + sin_a * hh),
        ]
        d.polygon(corners, fill=teal)

    # Gear ring
    ring_w = max(2, int(s * 0.048))
    d.ellipse([cx - gear_r, cy - gear_r, cx + gear_r, cy + gear_r],
              outline=teal, width=ring_w)

    # Inner dark circle cutout
    d.ellipse([cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r],
              fill=(15, 23, 42, 255))

    # Subtle inner ring accent
    acc_r = inner_r * 0.93
    acc_w = max(1, int(s * 0.008))
    d.ellipse([cx - acc_r, cy - acc_r, cx + acc_r, cy + acc_r],
              outline=(16, 185, 129, 80), width=acc_w)

    # === CODE BRACKETS { } ===
    bracket_color = (224, 242, 254, 240)
    bw = max(2, int(s * 0.018))
    bh = s * 0.13  # half-height of bracket
    bx_off = s * 0.07  # horizontal offset from center
    bd = s * 0.03  # depth of curve
    bp = s * 0.025  # point depth (curly part)

    # Left bracket {
    lx = cx - bx_off
    left_pts = [
        (lx, cy - bh),
        (lx - bd, cy - bh * 0.6),
        (lx - bd, cy - bh * 0.2),
        (lx - bd - bp, cy),
        (lx - bd, cy + bh * 0.2),
        (lx - bd, cy + bh * 0.6),
        (lx, cy + bh),
    ]
    d.line(left_pts, fill=bracket_color, width=bw, joint='curve')

    # Right bracket }
    rx = cx + bx_off
    right_pts = [
        (rx, cy - bh),
        (rx + bd, cy - bh * 0.6),
        (rx + bd, cy - bh * 0.2),
        (rx + bd + bp, cy),
        (rx + bd, cy + bh * 0.2),
        (rx + bd, cy + bh * 0.6),
        (rx, cy + bh),
    ]
    d.line(right_pts, fill=bracket_color, width=bw, joint='curve')

    # Center tilde ~
    wave_color = (52, 211, 153, 240)
    ww = max(2, int(s * 0.015))
    wave_pts = []
    for t in range(30):
        tt = (t - 15) / 15.0
        x = cx + tt * s * 0.04
        y = cy - math.sin(tt * math.pi) * s * 0.018
        wave_pts.append((x, y))
    d.line(wave_pts, fill=wave_color, width=ww)

    # === CIRCULAR ARROWS (sync/automation) ===
    arrow_color = (52, 211, 153, 230)
    arrow_color2 = (34, 211, 238, 230)
    aw = max(2, int(s * 0.016))
    ar = s * 0.175

    # Top-right arc with arrowhead
    arc1 = []
    for t in range(25):
        angle = -math.pi * 0.6 + (math.pi * 0.8) * t / 24
        x = cx + ar * math.cos(angle)
        y = cy + ar * math.sin(angle)
        arc1.append((x, y))
    d.line(arc1, fill=arrow_color, width=aw)
    # Arrowhead
    end1 = arc1[-1]
    ah = s * 0.028
    ea1 = -math.pi * 0.6 + math.pi * 0.8
    d.polygon([
        end1,
        (end1[0] - ah * math.cos(ea1 - 0.6), end1[1] - ah * math.sin(ea1 - 0.6)),
        (end1[0] - ah * math.cos(ea1 + 0.6), end1[1] - ah * math.sin(ea1 + 0.6)),
    ], fill=arrow_color)

    # Bottom-left arc with arrowhead
    arc2 = []
    for t in range(25):
        angle = math.pi * 0.4 + (math.pi * 0.8) * t / 24
        x = cx + ar * math.cos(angle)
        y = cy + ar * math.sin(angle)
        arc2.append((x, y))
    d.line(arc2, fill=arrow_color2, width=aw)
    # Arrowhead
    end2 = arc2[-1]
    ea2 = math.pi * 0.4 + math.pi * 0.8
    d.polygon([
        end2,
        (end2[0] - ah * math.cos(ea2 - 0.6), end2[1] - ah * math.sin(ea2 - 0.6)),
        (end2[0] - ah * math.cos(ea2 + 0.6), end2[1] - ah * math.sin(ea2 + 0.6)),
    ], fill=arrow_color2)

    # Downsample with antialiasing
    img = img.resize((size, size), Image.LANCZOS)
    return img


for sz in [128, 48, 32, 16]:
    img = draw_logo(sz)
    img.save(os.path.join(base, f'{sz}.png'))
    print(f'{sz}.png saved ({sz}x{sz})')

print('All icons generated!')

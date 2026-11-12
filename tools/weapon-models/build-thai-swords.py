"""Build the eight MONTRA Thai sword GLBs from the approved side profiles.

Run with Python 3.12: py tools/weapon-models/build-thai-swords.py
The grip is centred at the origin and the blade points along +Y. The default
scene contains the drawn sword. The second scene also shows its separate scabbard.
"""

import json
import math
import random
import struct
import zlib
from pathlib import Path


OUTPUT = Path(__file__).resolve().parents[2] / "assets" / "weapons"

# Stations are (distance along the blade, spine X, cutting edge X).
# Negative X is the spine; the cross-section keeps one polished cutting bevel.
PROFILES = (
    ("lotus-tip", .34, .010, 19, 0, [
        (.14, -.041, .043), (.45, -.041, .044), (.72, -.045, .039),
        (.84, -.050, .028), (.93, -.057, .007), (.99, -.064, -.024),
        (1.035, -.073, -.072),
    ]),
    ("angular-tip", .30, .009, 19, 0, [
        (.14, -.031, .032), (.81, -.029, .030), (.92, -.028, .028),
        (1.050, -.001, .000),
    ]),
    ("upswept-tip", .32, .010, 18, 0, [
        (.14, -.043, .043), (.42, -.045, .041), (.67, -.062, .027),
        (.83, -.089, .004), (.94, -.116, -.027), (1.016, -.147, -.075),
        (1.075, -.175, -.174),
    ]),
    ("square-tip", .30, .012, 13, 0, [
        (.14, -.052, .053), (.48, -.055, .054), (.88, -.055, .053),
        (.985, -.053, .051),
    ]),
    ("humped-spine", .38, .011, 22, 0, [
        (.14, -.038, .043), (.32, -.057, .043), (.47, -.091, .044),
        (.57, -.108, .044), (.66, -.103, .043), (.77, -.076, .038),
        (.88, -.055, .026), (.96, -.045, .010), (1.035, -.044, -.043),
    ]),
    ("grass-leaf", .32, .008, 21, 0, [
        (.14, -.027, .028), (.49, -.027, .028), (.77, -.032, .021),
        (.93, -.040, .005), (1.03, -.050, -.013), (1.123, -.061, -.060),
    ]),
    ("diagonal-tip", .33, .010, 13, .085, [
        (.14, -.043, .042), (.51, -.045, .044), (.87, -.044, .041),
        (1.025, -.046, .037),
    ]),
    ("round-tip", .32, .012, 18, 0, [
        (.14, -.049, .050), (.57, -.051, .052), (.94, -.052, .052),
        *[(.94 + .052 * math.sin(a), -.052 * math.cos(a), .052 * math.cos(a))
          for a in (.31, .63, .94, 1.25, 1.56)],
    ]),
)


def unit(vector):
    magnitude = math.sqrt(sum(value * value for value in vector))
    return tuple(value / magnitude for value in vector)


def normal(a, b, c):
    x, y, z = (end - start for start, end in zip(a, b))
    u, v, w = (end - start for start, end in zip(a, c))
    return unit((y * w - z * v, z * u - x * w, x * v - y * u))


def smooth_profile(profile):
    """Interpolate the curves without overshooting their drawn stations."""
    stations = list(zip(*profile))
    distances = stations[0]
    spans = [b - a for a, b in zip(distances, distances[1:])]
    gradients = []
    for contour in stations[1:]:
        slopes = [(b - a) / span for a, b, span in zip(contour, contour[1:], spans)]
        # Flat tangents at a change of direction preserve the crests and troughs.
        gradients.append([slopes[0], *(2 * a * b / (a + b) if a * b > 0 else 0
                                      for a, b in zip(slopes, slopes[1:])), slopes[-1]])
    result = []
    for i, span in enumerate(spans):
        subdivisions = max(2, math.ceil(span / .105))
        for step in range(subdivisions):
            t = step / subdivisions
            t2, t3 = t * t, t * t * t
            contour = [
                (2 * t3 - 3 * t2 + 1) * x[i] + (-2 * t3 + 3 * t2) * x[i + 1]
                + span * ((t3 - 2 * t2 + t) * g[i] + (t3 - t2) * g[i + 1])
                for x, g in zip(stations[1:], gradients)
            ]
            result.append((distances[i] + t * span, *contour))
    return [*result, profile[-1]]


class Surface:
    def __init__(self):
        self.positions, self.normals, self.uvs, self.indices = [], [], [], []
        self.vertices = {}

    def face(self, points, uvs, normals=None):
        face_normals = normals or [normal(*points[:3])] * len(points)
        indices = []
        for point, uv, direction in zip(points, uvs, face_normals):
            vertex = (point, uv, direction)
            if vertex not in self.vertices:
                self.vertices[vertex] = len(self.positions)
                self.positions.append(point)
                self.uvs.append(uv)
                self.normals.append(direction)
            indices.append(self.vertices[vertex])
        for i in range(1, len(points) - 1):
            self.indices.extend((indices[0], indices[i], indices[i + 1]))


def cap(surface, ring, reverse):
    points = ring[::-1] if reverse else ring
    # A centre fan also handles the thin rectangular spine and bevel at the blade tip.
    centre = tuple(sum(values) / len(points) for values in zip(*points))
    for i, point in enumerate(points):
        surface.face((centre, point, points[(i + 1) % len(points)]),
                     ((.5, .5), (.2, .4), (.8, .4)))


def blade_surfaces(profile, thickness, rake):
    steel, bevel = Surface(), Surface()
    section = ((0, .65), (.06, 1), (.67, .72), (1, .07), (1, -.07),
               (.67, -.72), (.06, -1), (0, -.65))
    start, end = profile[0][0], profile[-1][0]
    rings = []
    for index, (y, spine, edge) in enumerate(profile):
        progress = (y - start) / (end - start)
        point_taper = max(.12, min(1, (edge - spine) / .032))
        depth = thickness * (1 - .38 * progress ** 1.4) * point_taper
        rings.append([
            (spine + (edge - spine) * u, y - u * rake if index == len(profile) - 1 else y, depth * z)
            for u, z in section
        ])
    # Smooth along the blade while preserving the hard edge between its planes.
    for i, (u0, _) in enumerate(section):
        j = (i + 1) % len(section)
        u1 = section[j][0]
        surface = bevel if i in (2, 3, 4) else steel
        quads = [(low[i], low[j], high[j], high[i]) for low, high in zip(rings, rings[1:])]
        face_normals = [normal(*points[:3]) for points in quads]
        blend = [unit(tuple(a + b for a, b in zip(n0, n1)))
                 for n0, n1 in zip(face_normals, face_normals[1:])]
        normals = [face_normals[0], *blend, face_normals[-1]]
        for index, points in enumerate(quads):
            low, high = normals[index:index + 2]
            uvs = tuple((u, (y - start) / (end - start))
                        for u, (_, y, _) in zip((u0, u1, u1, u0), points))
            surface.face(points, uvs, (low, low, high, high))
    cap(steel, rings[0], True)
    cap(steel, rings[-1], False)
    return steel, bevel


def oval_ring(y, centre, rx, rz, sides, rake=0):
    points = []
    for i in range(sides):
        angle = i / sides * math.tau
        x = math.cos(angle)
        points.append((centre + rx * x, y - rake * (1 + x) / 2, -rz * math.sin(angle)))
    return points


def connect_rings(surface, lower, upper, v0, v1, normals=None):
    count = len(lower)
    for i in range(count):
        j = (i + 1) % count
        u0, u1 = i / count, (i + 1) / count
        directions = None
        if normals:
            low, high = normals
            directions = (low[i], low[j], high[j], high[i])
        surface.face((lower[i], lower[j], upper[j], upper[i]),
                     ((u0, v0), (u1, v0), (u1, v1), (u0, v1)), directions)


def grip_section(surface, stations, sides=10):
    rings = [oval_ring(y, 0, radius, radius * .84, sides) for y, radius in stations]
    radial = [unit(point) for point in oval_ring(0, 0, 1, 1 / .84, sides)]
    start, end = stations[0][0], stations[-1][0]
    for i, (lower, upper) in enumerate(zip(rings, rings[1:])):
        v0, v1 = ((stations[j][0] - start) / (end - start) for j in (i, i + 1))
        connect_rings(surface, lower, upper, v0, v1, (radial, radial))
    cap(surface, rings[0], True)
    cap(surface, rings[-1], False)


def wind_binding(surface, start, end, turns, radius):
    """A continuous strip rising around the handle with a narrow overlap."""
    sides = 8
    pitch = (end - start) / (turns + 1)
    steps = turns * sides
    cross_section = ((-.53, 0, -.44), (0, .0025, 0), (.53, .0005, .44))

    def strip(step):
        turn = step / sides
        angle = math.tau * turn
        x, z = math.cos(angle), -math.sin(angle)
        y = start + (.53 + turn) * pitch
        taper = min(1, step / 2, (steps - step) / 2)
        points, normals = [], []
        for offset, depth, tilt in cross_section:
            r = radius + depth * taper - .004 * (1 - taper)
            points.append((r * x, y + offset * pitch, r * .84 * z))
            normals.append(unit((x, tilt, z / .84)))
        return points, normals

    left, left_normals = strip(0)
    for step in range(1, steps + 1):
        right, right_normals = strip(step)
        u0, u1 = (step - 1) / sides, step / sides
        for i in range(2):
            v0, v1 = i / 2, (i + 1) / 2
            surface.face((left[i], right[i], right[i + 1], left[i + 1]),
                         ((u0, v0), (u1, v0), (u1, v1), (u0, v1)),
                         (left_normals[i], right_normals[i], right_normals[i + 1], left_normals[i + 1]))
        left, left_normals = right, right_normals


def loft_normals(rings, i):
    ring = rings[i]
    lower, upper = rings[max(0, i - 1)], rings[min(i + 1, len(rings) - 1)]
    directions = []
    for j in range(len(ring)):
        before, after = ring[j - 1], ring[(j + 1) % len(ring)]
        around = tuple(b - a for a, b in zip(before, after))
        lengthwise = tuple(b - a for a, b in zip(lower[j], upper[j]))
        directions.append(normal((0, 0, 0), around, lengthwise))
    return directions


def scabbard_surface(profile, rake, binding_bands=(), round_start=None):
    wood, fittings = Surface(), Surface()
    rings = []
    mouth_y = profile[0][0] - .015
    spine, edge = profile[0][1:]
    centre = (spine + edge) / 2
    half_width = (edge - spine) / 2
    mouth = oval_ring(mouth_y, centre, half_width + .013, .024, 12)
    rings.append(mouth)
    shell = profile if round_start is None else [station for station in profile if station[0] <= round_start]
    tip_pad = .006 if round_start is None else 0
    for i, (y, spine, edge) in enumerate(shell):
        centre, half_width = (spine + edge) / 2, (edge - spine) / 2
        end = i == len(shell) - 1
        rings.append(oval_ring(y + (tip_pad if end else 0), centre, half_width + .011,
                               min(.024, .014 + half_width * .18), 12, rake if end else 0))
    # A short rounded end closes the wood beyond the steel tip, including the clipped profiles.
    y, spine, edge = shell[-1]
    centre, half_width = (spine + edge) / 2, (edge - spine) / 2
    cap_length = .016 if round_start is None else profile[-1][0] + .022 - y
    angles = (.48, 1.04, 1.50) if round_start is None else (.28, .55, .82, 1.08, 1.32, 1.51)
    for angle in angles:
        rounding = math.cos(angle)
        cap_rake = rake * rounding
        height = y + tip_pad + cap_length * math.sin(angle) - (rake - cap_rake) / 2
        rings.append(oval_ring(height, centre,
                               (half_width + .011) * rounding, min(.024, .014 + half_width * .18) * rounding,
                               12, cap_rake))
    normals = [loft_normals(rings, i) for i in range(len(rings))]
    for i, (lower, upper) in enumerate(zip(rings, rings[1:])):
        connect_rings(wood, lower, upper, lower[0][1], upper[0][1], normals[i:i + 2])
    cap(wood, rings[-1], False)

    spine, edge = profile[0][1:]
    centre, half_width = (spine + edge) / 2, (edge - spine) / 2
    lip = oval_ring(mouth_y - .001, centre, half_width + .016, .026, 12)
    band_end = oval_ring(mouth_y + .032, centre, half_width + .014, .025, 12)
    opening = oval_ring(mouth_y - .001, centre, half_width + .004, .016, 12)
    recess = oval_ring(mouth_y + .026, centre, half_width + .004, .015, 12)
    connect_rings(fittings, lip, band_end, 0, 1)
    connect_rings(fittings, opening, lip, 0, 1)
    connect_rings(wood, recess, opening, 0, 1)
    cap(wood, recess, True)
    for y in binding_bands:
        band_rings = []
        for offset, thickness in ((-.011, .0005), (-.008, .002), (.008, .002), (.011, .0005)):
            height = y + offset
            low, high = next((a, b) for a, b in zip(profile, profile[1:]) if a[0] <= height <= b[0])
            t = (height - low[0]) / (high[0] - low[0])
            spine, edge = (a + (b - a) * t for a, b in zip(low[1:], high[1:]))
            centre, half_width = (spine + edge) / 2, (edge - spine) / 2
            band_rings.append(oval_ring(height, centre, half_width + .011 + thickness,
                                        min(.024, .014 + half_width * .18) + thickness, 12))
        for i, (lower, upper) in enumerate(zip(band_rings, band_rings[1:])):
            connect_rings(fittings, lower, upper, i / 3, (i + 1) / 3)
    return wood, fittings


def noise_field(columns, rows, rng):
    values = [[rng.uniform(-1, 1) for _ in range(columns)] for _ in range(rows)]

    def sample(u, v):
        x, y = u * columns, v * rows
        i, j = math.floor(x), math.floor(y)
        sx, sy = x - i, y - j
        sx = sx * sx * (3 - 2 * sx)
        sy = sy * sy * (3 - 2 * sy)
        upper, lower = values[j % rows], values[(j + 1) % rows]
        left, right = i % columns, (i + 1) % columns
        high = upper[left] * (1 - sx) + upper[right] * sx
        low = lower[left] * (1 - sx) + lower[right] * sx
        return high * (1 - sy) + low * sy

    return sample


def png_texture(kind):
    """Original swatches with directional grain, burnish and wear."""
    size = 64 if kind in ("brass", "metal-roughness") else 128
    randomize = random.Random(kind)
    mottling = noise_field(11, 16, randomize)
    patches = noise_field(5, 7, randomize)
    fibres = noise_field(64, 7, randomize)
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # PNG scanline filter: None
        for x in range(size):
            u, v = x / size, y / size
            noise = randomize.uniform(-1, 1)
            if kind == "steel":
                hammer_marks = 13 * mottling(u, v) + 10 * patches(u, v)
                scratches = 13 * min(0, fibres(u, v))
                tone = 169 + hammer_marks + scratches + 4 * noise + 13 * u
                rgb = (tone - 2, tone + 1, tone + 4)
            elif kind == "wood":
                warp = .024 * patches(u, v)
                grain = fibres(u + warp, v * .45)
                growth = math.sin(math.tau * (18 * u + .44 * patches(u, v)))
                tone = 17 * grain + 10 * growth + 8 * mottling(u, v) + 3 * noise
                rgb = (101 + tone, 63 + tone * .74, 37 + tone * .52)
            elif kind == "brass":
                oxide = max(0, mottling(u, v) + .33 * patches(u, v))
                burnish = 14 * abs(2 * v - 1) ** 5
                tone = burnish - 38 * oxide + 6 * noise
                rgb = (169 + tone, 120 + tone * .93, 64 + tone * .71)
            elif kind == "metal-roughness":
                roughness = 203 + 25 * mottling(u, v) + 11 * fibres(u, v) + 5 * noise
                rgb = (255, roughness, 255)
            else:
                diagonal = math.sin(math.tau * (7 * u + 9 * v))
                strands = math.sin(math.tau * (3 * u + 32 * v))
                wear = 7 * mottling(u, v) + 8 * patches(u, v)
                seam = -19 * abs(2 * v - 1) ** 9
                tone = 7 * diagonal + 7 * strands + wear + seam + 5 * noise
                rgb = (153 + tone, 114 + tone * .95, 71 + tone * .82)
            rows.extend(max(0, min(255, round(value))) for value in rgb)

    def chunk(name, data):
        return struct.pack(">I", len(data)) + name + data + struct.pack(">I", zlib.crc32(name + data))

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows, level=9)) + chunk(b"IEND", b""))


def material(name, texture, tint, metallic, roughness, roughness_texture=None):
    pbr = {
        "baseColorTexture": {"index": texture}, "baseColorFactor": [*tint, 1],
        "metallicFactor": metallic, "roughnessFactor": roughness,
    }
    if roughness_texture is not None:
        pbr["metallicRoughnessTexture"] = {"index": roughness_texture}
    return {"name": name, "pbrMetallicRoughness": pbr}


class Glb:
    def __init__(self, name, wrap_tint):
        self.data = bytearray()
        self.doc = {"asset": {"version": "2.0", "generator": "MONTRA Thai sword workshop"},
                    "scene": 0, "nodes": [], "meshes": [], "bufferViews": [], "accessors": [], "images": []}
        self.doc["scenes"] = [{"name": "Drawn sword", "nodes": [0]},
                              {"name": "Drawn sword and scabbard", "nodes": [0, 5]}]
        self.doc["materials"] = [
            material("Forged steel", 0, (.77, .83, .9), .64, .64, 4),
            material("Polished cutting bevel", 0, (1, 1, 1), .68, .35, 4),
            material("Hardwood", 1, (.82, .76, .68), 0, .58),
            material("Grip binding", 2, wrap_tint, 0, .76),
            material("Patinated brass", 3, (.90, .84, .70), .58, .54, 4),
        ]
        for kind, texture in TEXTURES.items():
            view = self.buffer_view(texture)
            self.doc["images"].append({"name": kind, "bufferView": view, "mimeType": "image/png"})
        self.doc["textures"] = [{"source": i} for i in range(len(TEXTURES))]
        self.doc["nodes"].append({"name": name, "children": [1, 2, 3, 4]})

    def buffer_view(self, data, target=None):
        self.data.extend(bytes(-len(self.data) % 4))
        view = {"buffer": 0, "byteOffset": len(self.data), "byteLength": len(data)}
        if target:
            view["target"] = target
        self.data.extend(data)
        self.doc["bufferViews"].append(view)
        return len(self.doc["bufferViews"]) - 1

    def accessor(self, values, kind, size, *, positions=False):
        components, code, target = (5126, "f", 34962) if size > 1 else (5123, "H", 34963)
        data = (value for row in values for value in row) if size > 1 else iter(values)
        view = self.buffer_view(struct.pack(f"<{len(values) * size}{code}", *data), target)
        accessor = {"bufferView": view, "componentType": components, "count": len(values), "type": kind}
        if positions:
            accessor["min"] = [min(axis) for axis in zip(*values)]
            accessor["max"] = [max(axis) for axis in zip(*values)]
        self.doc["accessors"].append(accessor)
        return len(self.doc["accessors"]) - 1

    def mesh_node(self, name, surfaces, **extras):
        primitives = []
        for surface, material_id in surfaces:
            primitives.append({"attributes": {
                "POSITION": self.accessor(surface.positions, "VEC3", 3, positions=True),
                "NORMAL": self.accessor(surface.normals, "VEC3", 3),
                "TEXCOORD_0": self.accessor(surface.uvs, "VEC2", 2),
            }, "indices": self.accessor(surface.indices, "SCALAR", 1), "material": material_id})
        self.doc["nodes"].append({"name": name, "mesh": len(self.doc["meshes"]), **extras})
        self.doc["meshes"].append({"name": name, "primitives": primitives})

    def write(self, path):
        self.data.extend(bytes(-len(self.data) % 4))
        self.doc["buffers"] = [{"byteLength": len(self.data)}]
        encoded = json.dumps(self.doc, separators=(",", ":")).encode()
        encoded += b" " * (-len(encoded) % 4)
        header = struct.pack("<4sII", b"glTF", 2, 28 + len(encoded) + len(self.data))
        path.write_bytes(header + struct.pack("<I4s", len(encoded), b"JSON") + encoded
                         + struct.pack("<I4s", len(self.data), b"BIN\x00") + self.data)


TEXTURES = {kind: png_texture(kind) for kind in ("steel", "wood", "binding", "brass", "metal-roughness")}
WRAP_TINTS = ((.95, .89, .78), (.28, .23, .18), (.23, .23, .24), (.97, .87, .71),
              (.73, .65, .53), (1, .96, .88), (.46, .36, .26), (.93, .93, .84))


def build(number, spec):
    name, grip_length, thickness, turns, rake, profile = spec
    if number in (1, 3, 5, 6, 8):
        profile = smooth_profile(profile)
    blade, bevel = blade_surfaces(profile, thickness, rake)
    handle, wrap, fittings = Surface(), Surface(), Surface()
    butt = .14 - grip_length
    grip_section(handle, [(butt, .029), (butt + .025, .031), (-.04, .033), (.11, .034), (.14, .034)])
    wrap_start = butt + (.064 if number in (1, 4, 7) else .035)
    wrap_end = .071 if number in (1, 4, 7) else .098
    wind_binding(wrap, wrap_start, wrap_end, turns, .0348)
    grip_section(fittings, [(.106, .035), (.109, .038), (.113, .039), (.116, .0366),
                            (.132, .0366), (.135, .039), (.141, .039), (.144, .033)])
    grip_section(fittings, [(butt - .009, .026), (butt - .004, .033),
                            (butt + .004, .033), (butt + .006, .0315), (butt + .022, .0315)])
    wood, mouth = scabbard_surface(profile, rake, (.40, .75) if number == 5 else (),
                                   round_start=.94 if number == 8 else None)

    glb = Glb(name, WRAP_TINTS[number - 1])
    glb.mesh_node("Blade", [(blade, 0), (bevel, 1)])
    glb.mesh_node("Handle", [(handle, 2)])
    glb.mesh_node("Handle Wrap", [(wrap, 3)])
    glb.mesh_node("Metal Fittings", [(fittings, 4)])
    glb.mesh_node("Scabbard", [(wood, 2), (mouth, 4)], translation=[.22, 0, 0])
    path = OUTPUT / f"thai-sword-{number:02}.glb"
    glb.write(path)
    print(f"{path.name}  {path.stat().st_size:,} B")


if __name__ == "__main__":
    for number, profile in enumerate(PROFILES, start=1):
        build(number, profile)

"""Blender 5.2: --background --python scripts/encode-story-trailer.py [-- --self-check]."""

import shutil
import struct
import sys
import tempfile
import wave
import zlib
from pathlib import Path

import bpy

FPS = 24
SHOTS = [("01-continuous-battle", 768)]
FRAMES = sum(count for _, count in SHOTS)
ROOT = Path(__file__).resolve().parents[1] / "assets" / "trailer-story"


def png_size(path):
    with path.open("rb") as image:
        header = image.read(24)
    assert header[:8] == b"\x89PNG\r\n\x1a\n", f"Invalid PNG: {path}"
    return struct.unpack(">II", header[16:24])


def encode(root, size=(1920, 1080)):
    root = root.resolve()
    for name, count in SHOTS:
        directory = root / "frames" / name
        expected = [directory / f"{frame:04}.png" for frame in range(1, count + 1)]
        assert sorted(directory.glob("*.png")) == expected, f"Wrong frame set: {directory}"
        assert all(png_size(path) == size for path in expected), f"Wrong dimensions: {name}"
    with wave.open(str(root / "mossvale-story-audio.wav"), "rb") as audio:
        assert (audio.getframerate(), audio.getnchannels(), audio.getsampwidth()) == (48000, 2, 2)
        assert audio.getnframes() == FRAMES * 48000 // FPS, "Audio must be exactly 32 seconds"

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Mossvale Continuous Battle — 32 seconds"
    scene.frame_start, scene.frame_end = 1, FRAMES
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.fps, scene.render.fps_base = FPS, 1
    scene.render.use_sequencer = True
    scene.render.use_compositing = False
    scene.render.film_transparent = False
    scene.render.image_settings.media_type = "VIDEO"
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.filepath = "//mossvale-story-trailer.mp4"
    scene.render.use_file_extension = True
    video = scene.render.ffmpeg
    video.format, video.codec = "MPEG4", "H264"
    video.constant_rate_factor, video.custom_constant_rate_factor = "CUSTOM", 18
    video.ffmpeg_preset, video.gopsize = "GOOD", 48
    video.audio_codec, video.audio_bitrate = "AAC", 320
    video.audio_mixrate, video.audio_channels = 48000, "STEREO"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure, scene.view_settings.gamma = 0, 1
    scene.sequencer_colorspace_settings.name = "sRGB"
    editor = scene.sequence_editor_create()
    images, start = [], 1
    for name, count in SHOTS:
        strip = editor.strips.new_image(
            name=name, filepath=str(root / "frames" / name / "0001.png"),
            channel=2, frame_start=start)
        for frame in range(2, count + 1):
            strip.elements.append(f"{frame:04}.png")
        strip.directory = f"//frames/{name}/"
        strip.frame_final_duration = count
        strip.colorspace_settings.name = "sRGB"
        strip.blend_type = "ALPHA_OVER"
        scene.timeline_markers.new(name, frame=start)
        images.append(strip)
        start += count
    sound = editor.strips.new_sound(
        name="Original story score and synced combat Foley", filepath=str(root / "mossvale-story-audio.wav"),
        channel=1, frame_start=1)
    sound.sound.filepath = "//mossvale-story-audio.wav"
    sound.frame_final_duration = FRAMES
    for strip, points in [(images[0], [(1, 0), (1 + FPS * .4, 1)]),
                          (images[-1], [(FRAMES - 12, 1), (FRAMES, 0)])]:
        for frame, alpha in points:
            strip.blend_alpha = alpha
            strip.keyframe_insert(data_path="blend_alpha", frame=frame)
    assert [int(strip.frame_final_start) for strip in images] == [1]
    assert int(images[-1].frame_final_end) == FRAMES + 1
    scene.frame_set(1)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(root / "mossvale-story-edit.blend"), relative_remap=False)
    assert Path(bpy.path.abspath(images[0].directory)).resolve() == root / "frames" / SHOTS[0][0]
    assert Path(bpy.path.abspath(sound.sound.filepath)).resolve() == root / "mossvale-story-audio.wav"
    bpy.ops.render.render(animation=True)
    output = root / "mossvale-story-trailer.mp4"
    assert output.stat().st_size > 1024, "Encoded video is empty"
    probe = editor.strips.new_movie(name="Output verification", filepath=str(output),
                                   channel=32, frame_start=1)
    assert int(probe.frame_final_duration) == FRAMES, "Encoded frame count differs"
    assert (probe.elements[0].orig_width, probe.elements[0].orig_height) == size
    editor.strips.remove(probe)
    print(f"VERIFIED: {output} — {size[0]}x{size[1]}, {FRAMES} frames, {FPS} fps, 32 seconds")


def self_check():
    # Exercise the complete edit and H.264/AAC encoder at a small resolution.
    size = (96, 54)
    with tempfile.TemporaryDirectory(prefix="mossvale-story-encode-check-") as temporary:
        root = Path(temporary)
        def chunk(kind, data):
            return (struct.pack(">I", len(data)) + kind + data +
                    struct.pack(">I", zlib.crc32(kind + data)))
        png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", *size, 8, 2, 0, 0, 0)) +
               chunk(b"IDAT", zlib.compress((b"\0" + b"\x20\x80\x40" * size[0]) * size[1])) +
               chunk(b"IEND", b""))
        for name, count in SHOTS:
            directory = root / "frames" / name
            directory.mkdir(parents=True)
            first = directory / "0001.png"
            first.write_bytes(png)
            for frame in range(2, count + 1):
                shutil.copyfile(first, directory / f"{frame:04}.png")
        with wave.open(str(root / "mossvale-story-audio.wav"), "wb") as audio:
            audio.setparams((2, 2, 48000, 0, "NONE", "not compressed"))
            audio.writeframes(b"\0" * (FRAMES * 48000 // FPS * 4))
        encode(root, size)
        scene = bpy.context.scene
        scene.sequence_editor.strips.new_movie(
            name="Encoded picture check", filepath=str(root / "mossvale-story-trailer.mp4"),
            channel=32, frame_start=1)
        scene.render.image_settings.media_type = "IMAGE"
        scene.render.image_settings.file_format = "PNG"
        for frame in (1, 288, FRAMES):
            scene.frame_set(frame)
            scene.render.filepath = str(root / f"check-{frame}.png")
            bpy.ops.render.render(write_still=True)
            picture = bpy.data.images.load(scene.render.filepath)
            red, green, blue = picture.pixels[:3]
            assert (green > red and green > blue and green > 0.1) if frame == 288 else max(red, green, blue) < 0.02
            bpy.data.images.remove(picture)
    print("SELF-CHECK PASSED")


if __name__ == "__main__":
    self_check() if "--self-check" in sys.argv else encode(ROOT)

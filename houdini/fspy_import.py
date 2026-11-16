"""Python module of the fSpy Import digital asset.

The asset is an object node that reads an fSpy project file (.fspy) and
creates a camera next to itself, wired to it as a child. The camera gets
the solved transform, focal length, aperture, resolution, principal point
(as screen window offset) and the project image as background image.
Moving, rotating or scaling the fSpy Import node moves the camera with it.

build_hda.py puts this file into the asset. The numbers here must stay in
step with src/gui/io/houdini-export.ts, which writes the same camera from
inside fSpy.
"""

import json
import os
import re
import struct

import hou


class FspyImportError(Exception):
    pass


_METERS_PER_UNIT = {
    'Millimeters': 0.001,
    'Centimeters': 0.01,
    'Meters': 1.0,
    'Kilometers': 1000.0,
    'Inches': 0.0254,
    'Feet': 0.3048,
    'Miles': 1609.344,
}

# Rotations taking each fSpy world axis to +y, the up axis of Houdini
_ROTATIONS_TO_Y_UP = (
    ((1, 0, 0), ((0, -1, 0), (1, 0, 0), (0, 0, 1))),
    ((-1, 0, 0), ((0, 1, 0), (-1, 0, 0), (0, 0, 1))),
    ((0, -1, 0), ((-1, 0, 0), (0, -1, 0), (0, 0, 1))),
    ((0, 0, 1), ((1, 0, 0), (0, 0, 1), (0, -1, 0))),
    ((0, 0, -1), ((1, 0, 0), (0, 0, -1), (0, 1, 0))),
)


def read_project(project_path):
    """Returns the project state and the bytes of the project image (or None)."""
    with open(project_path, 'rb') as project_file:
        data = project_file.read()
    if len(data) < 16 or data[:4] != b'fspy':
        raise FspyImportError('%s is not an fSpy project file.' % project_path)
    version, state_size, image_size = struct.unpack('<III', data[4:16])
    if version != 1:
        raise FspyImportError('fSpy project file version %d is not supported.' % version)
    state = json.loads(data[16:16 + state_size].decode('utf-8'))
    image = data[16 + state_size:16 + state_size + image_size] if image_size else None
    return state, image


def camera_settings(state):
    """Returns the Houdini camera parameters and transform for a project state."""
    solved = state.get('cameraParameters')
    if not solved:
        raise FspyImportError(
            'The project has no solved camera. Open it in fSpy, make sure '
            'there are no errors in the result panel and save it again.')
    settings = state['calibrationSettingsBase']
    image_width = solved['imageWidth']
    image_height = solved['imageHeight']

    # Half the size of the image in fSpy image plane coordinates,
    # where the long side of the image spans -1 to 1
    aspect_ratio = float(image_width) / image_height
    half_width = aspect_ratio if aspect_ratio <= 1 else 1.0
    half_height = 1.0 if aspect_ratio <= 1 else 1.0 / aspect_ratio

    # The long side of the sensor spans the long side of the image,
    # as for the focal length shown in fSpy
    camera_data = settings['cameraData']
    sensor_width = camera_data['customSensorWidth']
    sensor_height = camera_data['customSensorHeight']
    if camera_data.get('presetId') and camera_data.get('presetData'):
        sensor_width = camera_data['presetData']['sensorWidth']
        sensor_height = camera_data['presetData']['sensorHeight']
    sensor_long_side = sensor_width if sensor_height > 0 and sensor_width > sensor_height else sensor_height
    if not sensor_long_side > 0:
        sensor_long_side = 36.0

    # The world axis closest to the up direction of the image becomes +y
    rows = solved['cameraTransform']['rows']
    camera_up = (rows[0][1], rows[1][1], rows[2][1])
    camera_to_world = [list(row) for row in rows[:3]]
    best_alignment = camera_up[1]
    for axis, rotation in _ROTATIONS_TO_Y_UP:
        alignment = sum(a * b for a, b in zip(axis, camera_up))
        if alignment > best_alignment:
            best_alignment = alignment
            camera_to_world = [
                [sum(rotation_row[i] * rows[i][column] for i in range(3)) for column in range(4)]
                for rotation_row in rotation]

    # A reference distance with a unit gives the scene a real size
    unit_scale = 1.0
    unit = settings.get('referenceDistanceUnit')
    if settings.get('referenceDistanceAxis') and unit in _METERS_PER_UNIT:
        unit_scale = _METERS_PER_UNIT[unit] * hou.scaleFromMKS('m1')

    # hou.Matrix4 has the translation in the last row, fSpy in the last column
    transform = hou.Matrix4(
        tuple(tuple(camera_to_world[row][column] for row in range(3)) + (0.0,) for column in range(3))
        + (tuple(camera_to_world[row][3] * unit_scale for row in range(3)) + (1.0,),))

    principal_point = solved['principalPoint']
    parameters = {
        'resx': image_width,
        'resy': image_height,
        'aspect': 1,
        'focal': 0.5 * sensor_long_side * solved['relativeFocalLength'],
        'aperture': sensor_long_side * half_width,
        # Houdini moves the window, not the principal point, hence the sign
        'winx': -principal_point['x'] / (2 * half_width),
        'winy': -principal_point['y'] / (2 * half_height),
    }
    return parameters, transform


def _image_extension(image):
    if image[:4] == b'\x89PNG':
        return 'png'
    if image[:4] == b'GIF8':
        return 'gif'
    if image[:2] == b'BM':
        return 'bmp'
    if image[:4] == b'RIFF' and image[8:12] == b'WEBP':
        return 'webp'
    return 'jpg'


def extract_image(project_path, image):
    """Writes the project image next to the project file and returns its path.

    The file is named after the project file, e.g. shot.fspy.jpg, so that it
    cannot replace the photo the project was made from.
    """
    file_name = os.path.basename(project_path) + '.' + _image_extension(image)
    folders = (os.path.dirname(os.path.abspath(project_path)), hou.text.expandString('$HOUDINI_TEMP_DIR'))
    for folder in folders:
        image_path = os.path.join(folder, file_name)
        try:
            is_current = False
            if os.path.isfile(image_path):
                with open(image_path, 'rb') as image_file:
                    is_current = image_file.read() == image
            if not is_current:
                with open(image_path, 'wb') as image_file:
                    image_file.write(image)
            return image_path.replace('\\', '/')
        except OSError:
            # For example a read only folder. Try the next one.
            continue
    raise FspyImportError('Could not write the project image to %s.' % ' or '.join(folders))


def camera_of(node):
    """Returns the camera that the fSpy Import node drives, or None if there is none yet."""
    camera_path = node.evalParm('camera')
    camera = node.node(camera_path) if camera_path else None
    if camera is not None and camera.type().name() != 'cam':
        raise FspyImportError('%s is not a camera.' % camera.path())
    return camera


def load_project(node):
    """Reads the project and creates the camera, or updates the one made before.

    Returns the camera node.
    """
    project_path = node.evalParm('fspy_file')
    if not project_path:
        raise FspyImportError('Choose an fSpy project first.')
    state, image = read_project(project_path)
    parameters, transform = camera_settings(state)
    if image:
        # New cameras come with the background image switched off
        parameters['vm_bgenable'] = 1
        parameters['vm_background'] = extract_image(project_path, image)

    with hou.undos.group('Load fSpy project'):
        camera = camera_of(node)
        is_new_camera = camera is None
        if is_new_camera:
            stem = os.path.splitext(os.path.basename(project_path))[0]
            name = re.sub(r'[^A-Za-z0-9_]', '_', stem)
            if not name.lower().startswith('fspy'):
                name = 'fspy_' + name
            camera = node.parent().createNode('cam', name)
            # A child of this node, so that the transform of this node moves the camera
            camera.setInput(0, node)
            camera.moveToGoodPosition()
            node.parm('camera').set(node.relativePathTo(camera))
        camera.setParms(parameters)
        camera.setParmTransform(transform)

    if hou.isUIAvailable():
        if parameters['winx'] != 0 or parameters['winy'] != 0:
            _keep_background_in_frame()
        if is_new_camera:
            hou.ui.paneTabOfType(hou.paneTabType.SceneViewer).curViewport().setCamera(camera)
    return camera


def _keep_background_in_frame():
    """Stops the viewports from panning the background image with the screen window.

    A principal point away from the image centre becomes a screen window
    offset on the camera. By default the viewport moves the background image
    by that offset too, away from the geometry it should line up with.
    """
    for pane_tab in hou.ui.paneTabs():
        if pane_tab.type() == hou.paneTabType.SceneViewer:
            for viewport in pane_tab.viewports():
                viewport.settings().setApplyZoomToBackgroundImage(False)


def on_load(node):
    """Callback of the fSpy Project parameter and the Reload button."""
    try:
        load_project(node)
    except (FspyImportError, OSError, ValueError, KeyError) as error:
        _show_error(error)


def on_look_through(node):
    """Callback of the Look Through Camera button."""
    try:
        camera = camera_of(node)
        if camera is None:
            raise FspyImportError('There is no camera yet. Choose an fSpy project first.')
    except FspyImportError as error:
        _show_error(error)
        return
    if camera.evalParm('winx') != 0 or camera.evalParm('winy') != 0:
        _keep_background_in_frame()
    hou.ui.paneTabOfType(hou.paneTabType.SceneViewer).curViewport().setCamera(camera)


def _show_error(error):
    message = 'fSpy Import: %s' % error
    if hou.isUIAvailable():
        hou.ui.displayMessage(message, severity=hou.severityType.Error)
    else:
        raise FspyImportError(message)

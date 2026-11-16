"""Builds the fSpy Import digital asset from fspy_import.py.

Usage: hython build_hda.py [output folder]

The asset is written to the output folder (default: the folder of this
script) as fspy_import.hda, or .hdalc / .hdanc when built with an Indie or
Apprentice license. Build with the oldest Houdini version you want to use
the asset in. To install the asset, copy it to the otls folder of your
Houdini preferences.
"""

import os
import shutil
import sys
import tempfile

import hou

TYPE_NAME = 'fspy_import'
LABEL = 'fSpy Import'

here = os.path.dirname(os.path.abspath(__file__))
output_folder = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else here
extension = {
    hou.licenseCategoryType.Commercial: 'hda',
    hou.licenseCategoryType.Indie: 'hdalc',
}.get(hou.licenseCategory(), 'hdanc')
file_name = TYPE_NAME + '.' + extension
# Houdini writes backup copies next to an asset while it is edited,
# so build in a temporary folder and only copy the result
build_folder = tempfile.mkdtemp()
hda_path = os.path.join(build_folder, file_name).replace('\\', '/')

load_callback = 'hou.phm().on_load(kwargs[\'node\'])'
folder = hou.FolderParmTemplate('fspy', 'fSpy')
folder.addParmTemplate(hou.StringParmTemplate(
    'fspy_file', 'fSpy Project', 1,
    string_type=hou.stringParmType.FileReference,
    file_type=hou.fileType.Any,
    tags={'filechooser_pattern': '*.fspy', 'filechooser_mode': 'read'},
    script_callback=load_callback,
    script_callback_language=hou.scriptLanguage.Python,
    help='The fSpy project file to make a camera from. Choosing a file loads it.'))
folder.addParmTemplate(hou.ButtonParmTemplate(
    'reload', 'Reload',
    join_with_next=True,
    script_callback=load_callback,
    script_callback_language=hou.scriptLanguage.Python,
    help='Read the project again, after it was saved in fSpy. '
         'Updates the camera below, or makes a new one if there is none.'))
folder.addParmTemplate(hou.ButtonParmTemplate(
    'look_through', 'Look Through Camera',
    script_callback='hou.phm().on_look_through(kwargs[\'node\'])',
    script_callback_language=hou.scriptLanguage.Python,
    help='Look through the camera in the current viewport.'))
folder.addParmTemplate(hou.StringParmTemplate(
    'camera', 'Camera', 1,
    string_type=hou.stringParmType.NodeReference,
    tags={'opfilter': '!!OBJ/CAMERA!!', 'oprelative': '.'},
    help='The camera that this node sets up. It is filled in when the first '
         'project is loaded. Clear it to get a new camera on the next load.'))

subnet = hou.node('/obj').createNode('subnet', 'fspy_import_build')
asset = subnet.createDigitalAsset(
    name=TYPE_NAME,
    hda_file_name=hda_path,
    description=LABEL,
    min_num_inputs=0,
    max_num_inputs=1,
    ignore_external_references=True)
definition = asset.type().definition()

# The fSpy tab goes in front of the Transform and Subnet tabs of the subnet
group = asset.parmTemplateGroup()
group.insertBefore(group.entries()[0], folder)
definition.setParmTemplateGroup(group)

with open(os.path.join(here, 'fspy_import.py')) as module_file:
    definition.addSection('PythonModule', module_file.read())
definition.setExtraFileOption('PythonModule/IsPython', True)

# List the asset with the cameras in the tab menu
definition.addSection('Tools.shelf', '''<?xml version="1.0" encoding="UTF-8"?>
<shelfDocument>
  <tool name="$HDA_DEFAULT_TOOL" label="$HDA_LABEL" icon="$HDA_ICON">
    <toolMenuContext name="viewer">
      <contextNetType>OBJ</contextNetType>
    </toolMenuContext>
    <toolMenuContext name="network">
      <contextOpType>$HDA_TABLE_AND_NAME</contextOpType>
    </toolMenuContext>
    <toolSubmenu>Cameras</toolSubmenu>
    <script scriptType="python"><![CDATA[import objecttoolutils

objecttoolutils.genericTool(kwargs, '$HDA_NAME')]]></script>
  </tool>
</shelfDocument>
''')
definition.setIcon('OBJ_camera')
definition.setVersion('1.0')
definition.save(hda_path)

output_path = os.path.join(output_folder, file_name)
shutil.copyfile(hda_path, output_path)
shutil.rmtree(build_folder, ignore_errors=True)
print('Built %s' % output_path)

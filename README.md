## What is this?

fSpy is an open source, cross platform app for still image camera matching. See [fspy.io](https://fspy.io) for more info. The source code is available under the GPL license.

![fSpy screenshot](screenshot.jpg)

## Backstory

Once upon a time I wrote BLAM, a [Blender](https://blender.org) add-on for still image camera calibration that, despite its clunky UI, has gained some popularity in the Blender community. fSpy is an attempt to bring BLAM's functionality to a wider audience in the form of a stand alone app.

## Using the computed camera parameters in other applications

In theory, camera parameters computed by fSpy could be used in any application that has a notion of a 3D camera and provides some way of setting the camera parameters. If you're a Blender user, have a look at the [offical fSpy importer add-on](https://github.com/stuffmatic/fSpy-Blender). If you're using an application without a dedicated importer, you may still be able to manually copy the camera parameters from fSpy.

Houdini users can choose `File → Export → Houdini camera (Python script)`. This writes a Python script and the project image, and also copies the script to the clipboard. Paste it into Houdini's Python shell, or run it with `File → Run Script`, to get a camera in `/obj` with matching transform, focal length, aperture, resolution, principal point (as screen window offset) and background image. The scene is rotated so that the axis pointing up in the image becomes Houdini's y axis, and a reference distance with a unit is converted to Houdini units. Running the script again updates the same camera.

Houdini can also read `.fspy` project files directly, with the `fSpy Import` digital asset in the `houdini` folder of this repository. Build it with `hython houdini/build_hda.py`, using the oldest Houdini version you want to use it in, and copy the resulting `fspy_import.hda` (`.hdalc` with an Indie license) to the `otls` folder of your Houdini preferences. `fSpy Import` is then in the tab menu of object networks, under Cameras. Choose a project file on the node and it creates the same camera as the export above next to itself, with the project image written next to the project file. The camera is an ordinary camera node, wired to the `fSpy Import` node, so moving, rotating or scaling that node moves the solved camera with it. `Reload` reads the project again after it was saved in fSpy and updates the camera. Projects must have been saved by a version of fSpy that stores the solved camera in the project file.

If the principal point is not in the image centre, the camera gets a screen window offset. Both the script and the asset then switch off `Apply Zoom to Background` in the display options of the open viewports, because the background image would otherwise be moved by that offset and no longer line up with the scene.

Interested in writing an importer for your favorite application? Then the [fSpy project file format spec](https://github.com/stuffmatic/fSpy/blob/develop/project_file_format.md) is a good starting point.


## Checks and aids

The result panel has a `Checks` section that reports things worth knowing about the image and the result:

* **Cropped or edited photos.** The camera metadata (EXIF) of JPEG images is read. The solved field of view is compared with the lens and sensor in the metadata, which finds a crop of the frame. A recorded image size with other proportions than the image, editing software as the last writer, digital zoom and proportions that cameras don't produce are reported as well. An image without metadata can't be checked this way, and a centred crop can't be found without it.
* **Off-centre crops.** When the principal point is taken from a third vanishing point, its distance from the image centre is reported with the smallest full frame that would explain it. This only means something when the lines of the third vanishing point clearly converge, which the check takes into account.
* **Stability.** How much the field of view, the camera orientation and the principal point change if every handle is off by about a pixel on screen. A fragile result is flagged.
* **Line fit.** With more than two lines for a vanishing point, how far they are from meeting in one point.
* **Lens distortion.** With `Lens distortion guide` turned on, place the five points of the guide along an edge that is straight in the scene, preferably near the image border. The bow of the edge and the coefficient `k1` of a one parameter radial model are reported. The image itself is not undistorted.

The settings panel has these additions:

* **Lines per vanishing point.** Up to six lines per vanishing point instead of two. The vanishing point is then the point that fits all of them best, which makes the result less sensitive to how exactly each line is placed. Versions of fSpy without this feature use the first two lines of such a project.
* **Snap lines to edges.** When a handle of a vanishing point line is released, the line moves onto the strongest image edge within a few pixels of it.

## Building and running

The following instructions are for developers. If you just want to run the app, [download the latest executable for your platform](https://github.com/stuffmatic/fSpy/releases).

fSpy is written in [Typescript](https://www.typescriptlang.org) using [Electron](https://electronjs.org), [React](https://reactjs.org) and [Redux](https://redux.js.org). [Visual Studio Code](https://code.visualstudio.com) is recommended for a pleasant editing experience.

To install necessary dependencies, run

```
yarn
```

The `src` folder contains two subfolders `main` and `gui`, containing code for the [Electron main and renderer processes](https://electronjs.org/docs/tutorial/application-architecture) respectively.

Here's how to run the app in development mode

1. Run `yarn dev-server` in a separate terminal tab to start the dev server
2. Run `yarn build-dev` to build both the main and GUI code. This build step is needed to generate main process code used to start up the app.
3. Run `yarn electron-dev` in a separate terminal tab to start an Electron instance which uses the dev server to provide automatic reloading on GUI code changes.

⚠️ The current build process is not ideal. For example, it lacks support for live reloading on main process code changes. Changes to main process code require a manual rebuild, i.e steps 2-3, in order to show up in the app.


## Creating binaries for distribution

To create executables for distribution, run

```
yarn dist
```

which invokes [Electron builder](https://github.com/electron-userland/electron-builder).

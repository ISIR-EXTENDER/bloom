# 2026-07-10 - Robin Visual-Servoing Contract

Status: accepted for UI/ROS split contract.

Validator: Codex.

## Scope

This record covers Robin's visual-servoing UI contract in Bloom. It validates
the expected split between browser-side camera preview and ROS-side image/tag
processing from the tracked Sandbox V0.0 configuration.

This does not accept live AprilTag detections or robot motion. A sourced ROS
session still needs to prove the detector and visual-servoing nodes publish live
samples.

## Source Of Truth

The local Extender workspace documents the ROS processing path in:

```text
/home/susana/workspace/extender/extender_workspace/src/tools/apriltag_detector/Readme.md
```

Expected processing split:

- `/image_raw` and `/camera_info`: camera node to AprilTag detector;
- `/tag_detections`: AprilTag detector to visual-servoing and UI monitor;
- `/visual_servoing/velocity_command`: visual-servoing output to UI monitor;
- `/visual_servoing/error_TAGtoTAGd`: visual-servoing error to UI monitor.

The UI topic monitors should avoid raw image streams. Browser webcam widgets are
used for visual feedback; ROS image processing remains in the detector/servoing
nodes.

## Command

```bash
npm run validation:visual-servoing
```

Result: passed.

## Contract Covered

The validation command checks:

- `control_panel`, `visual_servoing`, and `visual_servoing_monitor` exist;
- `control-panel-camera` and `servo-camera` are browser webcam previews;
- `servo-camera` keeps `/image_raw` as metadata without turning it into a topic
  monitor;
- the AprilTag/RViz placeholder points at `/tag_detections`;
- enable/save controls publish `/ui/visual_servoing/on` and
  `/ui/visual_servoing/save`;
- the monitor subscribes to `/tag_detections`,
  `/visual_servoing/velocity_command`, and
  `/visual_servoing/error_TAGtoTAGd`;
- velocity and error plots read `twist.linear.x/y/z`;
- default recording/monitor policy excludes `/image_raw` and `/camera_info`.

## Remaining Acceptance

The live ROS validation record still needs:

- webcam preview on the target tablet or accepted equivalent;
- live `/tag_detections` samples from AprilTag detection;
- live `/visual_servoing/velocity_command` samples;
- live `/visual_servoing/error_TAGtoTAGd` samples;
- confirmation that camera performance issues are handled in the ROS camera or
  detector path, not by moving image processing into the Bloom frontend.

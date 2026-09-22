# 0137 — Camera frames on their own socket

Date: 2026-09-22

## Context

Robin asked for a view from the gripper while driving, in the 2026-09-22 Snake paper review: *"ajouter le
retour camera au niveau de la pince pour aider l'utilisateur"*. Bloom could preview a browser webcam or a
stream URL, and the `camera` widget's own description said it does not read a ROS image topic.

The obvious route was already closed, on purpose. `rclpy_topic_streams.py:12-16` drops any message field over
8192 elements before serialising it:

> A telemetry widget plots numbers, not pixels. Converting one 480p image costs about three quarters of a
> second on the single executor thread every other subscription shares, so a camera topic on this path stops
> `/ee_pose` and `/joint_states` updating while the arm is still moving.

A 480p `Image.data` carries 921 600 bytes and a typical `CompressedImage.data` tens of thousands, so both are
far over that cap. Putting images on the runtime socket would trade the arm's live state for a picture.

Three more facts shaped the decision:

- **The visual-servoing contract already forbids it.** `docs/validation/2026-07-10-robin-visual-servoing-contract.md:32-34`
  says the UI topic monitors avoid raw image streams and ROS image processing stays in the detector and
  servoing nodes. `scripts/visual-servoing-contract.mjs` fails CI if `/image_raw` appears in a monitor or in a
  recording policy. Sandbox keeps `topic: "/image_raw"` on a camera widget as documentation, never subscribed.
- **There is prior art in our own workspace.** `explorer_stack`'s `explorer_user_interfaces_web` does this on
  a dedicated FastAPI websocket: subscribe to `CompressedImage`, hold only the newest frame plus an index,
  block until a newer one arrives, and `send_bytes` the JPEG. The browser turns it into an object URL.
- **The other direction was already half built.** `POST /api/v1/runtime/camera-frames` publishes a browser
  frame to ROS as `CompressedImage`, and nothing in the frontend has ever called it. That is a separate
  problem, recorded here so the two are not confused.

## Decision

**Images get their own socket, and nothing on the way converts them.**

`GET /api/v1/runtime/camera?topic=…` subscribes to one `sensor_msgs/msg/CompressedImage` topic and sends the
frame bytes as they arrived. The backend never decodes, re-encodes or changes colour space; the browser's
`<img>` does the decoding it was built for.

Consequences of that shape:

- **Sensor-data QoS.** Camera drivers publish best effort. A reliable subscriber matches none of them and
  would sit silent.
- **One frame, never a queue.** The socket holds a single slot and drops the older frame. A late frame is
  worse than no frame when it is being used to judge where the gripper is.
- **Compressed only.** Accepting raw `Image` would put the conversion cost back on the backend, which is the
  thing this decision exists to avoid.
- **No control lease.** Watching is not commanding, so a locked-out session can still see, for the same
  reason it can still press STOP.
- **It says when it cannot work.** Without a ROS node the socket opens and reports `connected: false`, because
  a black rectangle looks exactly like a camera that has not started.

The `camera` widget gains a `ros-topic` source and a `topic` field, and the runtime opens one socket per such
widget on the current screen.

## Consequences

Bloom can show a robot camera for the first time. The telemetry socket is untouched, so its guard and the
reason for it still stand.

This does **not** serve visual servoing, and is not meant to. `visual_servoing` consumes `/tag_detections` and
TF, not images; `apriltag_detector` and `mediapipe_mocap` consume the images, inside ROS, on the workspace
convention `/camera/color/image_raw`. Viewing and detecting stay separate, which is what the July contract
asked for.

The camera source is per widget rather than per deployment, because the topic differs by camera: the workspace
convention for `usb_cam` and `camera_ros`, and Kinova's own `kortex_vision` topics for the integrated camera.

`POST /api/v1/runtime/camera-frames` is still unreachable from the frontend. It is the opposite direction, it
would serve visual servoing rather than viewing, and it needs its own decision: finish the browser capture or
remove the endpoint.

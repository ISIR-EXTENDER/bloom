# 0072. Pointer-Native Runtime Joystick

Status: accepted.

Bloom runtime widgets must stay reliable in scaled WYSIWYG screens, tablet browsers, and real robot teleoperation. The first joystick foundation used `nipplejs`, but end-to-end tests on the migrated petanque runtime showed a dangerous failure mode: the WebSocket/ROS pipeline was active, yet joystick drags emitted only zero vectors. This also matched legacy user feedback about pointer and joystick positions feeling offset.

We now use a small pointer-events joystick primitive owned by Bloom:

- `pointerdown`, `pointermove`, and `pointerup` are read from the actual widget zone;
- vectors are computed from `getBoundingClientRect()`, deadzoned, and normalized
  to the same signed unit disk as `extender_ui`;
- the joystick publishes while held and emits zero on release and unmount;
- the runtime artboard scales widget layouts numerically instead of using CSS `transform: scale(...)`, so interactive widgets receive real browser coordinates.

The primitive preserves joystick direction through signed `x/y` axes in
`[-1, 1]`; it does not convert axes to positive `0..1` values. Pointer positions
outside the circular travel are projected back onto the unit circle before being
emitted.

This removes one dependency from the widget renderer layer and keeps the teleop
interaction testable without mocking a third-party joystick manager. Visual
styling remains part of the Bloom design system, while robot-specific axis
semantics stay in widget settings and runtime bindings.

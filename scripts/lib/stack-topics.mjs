/**
 * The topics the ISIR stack listens to and publishes, as the scripts name them. The backend
 * allow-lists (backend/apps/bloom_api/settings.py) stay the runtime truth; the coherence check ties
 * the seeds to them, and the contracts and simulation checks read these names instead of retyping
 * them.
 */
export const STACK = {
  cameraImage: "/camera/color/image_raw/compressed",
  eePose: "/ee_pose",
  eeVelocity: "/ee_velocity",
  gripper: "/gripper_controller/commands",
  hubAnalogInput: "/hub/analogic_input",
  hubDigitalInput: "/hub/digital_input",
  hubOutput: "/hub/digital_output",
  jointStates: "/joint_states",
  jointTarget: "/joint_target_command",
  maxAngularSpeed: "/explorer_user_interfaces/rqt_armcontrol/max_angular_speed",
  maxLinearSpeed: "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed",
  mode: "/mode_request",
  petanqueResultImage: "/petanque/measure/result_image/compressed",
  petanqueState: "/petanque_state_machine/change_state",
  rosout: "/rosout",
  servoError: "/visual_servoing/error_TAGtoTAGd",
  servoManagerInput: "/visual_servoing_cartesian_command",
  servoOn: "/ui/visual_servoing/on",
  servoSave: "/ui/visual_servoing/save",
  servoVelocity: "/visual_servoing/velocity_command",
  tagDetections: "/tag_detections",
  twist: "/joystick_cartesian_command",
};

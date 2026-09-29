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
  goalMarkers: "/goal_markers",
  gripper: "/gripper_controller/commands",
  hubAnalogInput: "/hub/analogic_input",
  hubDigitalInput: "/hub/digital_input",
  hubOutput: "/hub/digital_output",
  intentScale: "/cartesian_manager/intent_scale",
  jointStates: "/joint_states",
  jointTarget: "/joint_target_command",
  maxAngularSpeed: "/explorer_user_interfaces/rqt_armcontrol/max_angular_speed",
  maxLinearSpeed: "/explorer_user_interfaces/rqt_armcontrol/max_linear_speed",
  mode: "/mode_request",
  // cartesian_manager's dynamic pose target: Go to a saved pose.
  poseTarget: "/pose_target",
  petanqueResultImage: "/petanque/measure/result_image/compressed",
  petanqueState: "/petanque_state_machine/change_state",
  // The QP controller names its command topic in code (qontrol_velocity_controller.cpp), not under its
  // controller namespace; the overload flag is under the namespace the manager configs give it.
  qontrolCommands: "/qontrol_controller/commands",
  qontrolEffortOverload: "/qontrol_explorer/effort_overload",
  rosout: "/rosout",
  servoError: "/visual_servoing/error_TAGtoTAGd",
  servoManagerInput: "/visual_servoing_cartesian_command",
  servoOn: "/ui/visual_servoing/on",
  servoSave: "/ui/visual_servoing/save",
  servoVelocity: "/visual_servoing/velocity_command",
  sharedControlConfidences: "/shared_control/confidences",
  sharedControlGoals: "/shared_control/goals",
  sharedControlSoftGoal: "/shared_control/soft_goal",
  tagDetections: "/tag_detections",
  // robot_state_publisher's tree; Bloom Debug's Command vs motion reads only the tip from it, through the backend.
  tf: "/tf",
  twist: "/joystick_cartesian_command",
};

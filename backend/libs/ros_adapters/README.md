# ROS Adapters

ROS-specific integration lives here.

This should be the only backend library that imports ROS 2 packages or knows about topics, services, and actions.

The generic API layer depends on protocols from this library, not directly on `rclpy`.
Concrete ROS implementations must keep ROS imports lazy so Bloom can run tests and local web development without a sourced
ROS environment.

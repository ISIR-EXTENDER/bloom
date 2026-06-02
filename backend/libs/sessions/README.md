# Sessions Library

Runtime UI sessions, connected clients, and active robot/app state coordination live here.

This library owns the generic real-time session contract. It does not import ROS directly; ROS topic subscriptions,
teleop publishing, and device feedback should enter through backend adapters that can be tested independently.

Current scope:

- track connected runtime sessions;
- parse runtime WebSocket messages;
- acknowledge ping, topic subscription requests, and teleop command messages.

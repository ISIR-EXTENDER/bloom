# 0047 - Builder Draft Layout History

## Status

Accepted

## Context

The builder needs undo/redo before layout editing becomes comfortable enough for real screen authoring. Pointer-based
movement and resizing can emit many intermediate updates, so history must record one meaningful edit per completed
interaction rather than one entry per pointer move.

## Decision

Bloom now keeps local draft layout history in `useBuilderScreenDraft`:

- Pointer movement and resize preview update the draft screen live.
- Pointer release commits one history entry using the starting and final widget layouts.
- Undo and redo operate on full draft screen snapshots.
- Builder toolbar actions expose Undo and Redo while disabling unavailable actions.

## Consequences

- Dragging a widget creates one undo step, not dozens.
- The same history hook can support future inspector edits and save/discard workflows.
- Persistence remains separate from draft history until the configuration API save slice is implemented.

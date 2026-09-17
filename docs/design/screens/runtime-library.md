# Screen — Runtime app library

Design option `5a` · tablet 1280×720 · desktop layout follows

Grounded in `docs/assets/screenshots/runtime-library.png` and the seven seed files at the pinned
ref. The first draft of this screen was authored from seed *filenames* and got Bloom Debug's screen
count wrong while silently dropping three apps — both caught in review. The counts below come from
the files.

## Why a list, not a card grid

The existing UI is a card grid, and the redesign started as one. A card that carries name,
description, screen count, two device badges, a lifecycle chip and a launch control needs ~140 px of
height, which fits four apps in a 1280×720 panel. The runtime already holds **seven**.

So: a compact 80 px row per app on the left, and a detail rail on the right for the selected one.
Seven rows fit at 50→658 with room to scroll if an eighth arrives, and the description — the part
that does not need to be visible for every app at once — moves to the rail.

| widget | kind | layout |
| --- | --- | --- |
| `library-apps-label` | label | 14,14 902×24 |
| `library-app-list` | app-list | 14,50 902×608 |
| `library-open-label` | label | 928,14 338×24 |
| `library-app-detail` | app-detail | 928,50 338×408 |
| `library-open` | command-button | 928,470 338×96 |
| `library-device-note` | label | 928,578 338×84 |

No STOP: the library commands nothing. STOP appears on exactly the screens that can move an arm.

## The seven apps

| app | screens | classes | lifecycle | profiles |
| --- | --- | --- | --- | --- |
| Bloom Debug | 1 | desktop only | active | none declared → Bench |
| Explorer Manager | 6 | tablet + desktop | active | operator, bench, one-switch |
| Explorer User Tests | 9 | tablet only | active | participant, facilitator |
| Kinova Manager | 6 | tablet + desktop | active | operator, bench |
| Petanque admin | 12 | tablet only | **archived** | none declared |
| Sandbox V0.0 | 6 | tablet only | active | none declared |
| Webcam visualizer | 1 | tablet + desktop | active | none declared |

Explorer and Kinova read 4 screens in the current build and 6 here — the Drive split turns one Drive
screen into Drive · Bench and Drive · Operator, and the Joystick Lab is counted.

Four of the seven declare `"profiles": []`. The rail says *this app declares no profiles, so it
opens with runtime defaults* rather than inventing roles — a library that shows a role picker for an
app with no roles is lying about its configuration.

## Lifecycle

`lifecycle: "archived"` gets the §09 unsupported treatment: `#f8f4eb` fill, `2px dashed
rgba(49,73,63,0.35)`, label `#536960`, and the word **Archived**. Not a dimmed card — dimming a
container multiplies the contrast of everything inside it, and the state needs to read as
*deliberately retired*, not *loading*.

Archived apps still open. Petanque admin is the legacy home screen and someone will need to look at
it; refusing would send them to the database.

## What this replaces

Today **Explorer User Tests** carries a *Display profile* select defaulting to **Auto**, on the card
itself, and no other app has one. The "Open as \<role\>" rail supersedes it for every app:

- The role is chosen at launch for all apps, not just the one that happened to get a select.
- `Auto` disappears. It resolved to the first profile in the file, which is an authoring accident
  rather than an intent — and on a screen about accessibility, silently picking the layout is the
  wrong default. The last role used **on this device** is marked and preselected; it never
  auto-launches.
- Migration: an existing `Auto` preference maps to "no role remembered yet", so the first launch
  after the change is an explicit choice. One extra tap, once.

## Open

- Desktop layout for this screen (the list can show all seven plus descriptions inline at 1920).
- Search or filter past ~12 apps. Seven needs neither and adding it now would be furniture.
- Where app creation lives — the library is read-only in this design and the builder owns authoring.

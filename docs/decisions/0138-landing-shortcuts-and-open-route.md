# 0138 — Landing shortcuts and the #/runtime/open route

Date: 2026-09-23

## Context

Susana, preparing the team to use Bloom without her: *"dans la landing page de Bloom, mettre des
raccourcis pour que les gens aient directement au Runtime Explorer, au Runtime Kinova... et puis
aussi peut-être un raccourci vers l'app des debugs... il faut aider aussi la prise en main de
Bloom."* Someone arriving at the landing with a robot on the bench had to know that Runtime hides a
library, and which app in it drives their arm.

At the same time the same-Wi-Fi path was verified for phones and tablets, which raised a second
need: a place on a tablet's home screen that lands on the right app, not on the landing.

## Decision

The route model gains a `libraryTarget`: `#/runtime/open/<configId>/<appId>` parses to the runtime
library with that app focused, and the landing renders three shortcuts as real `<a>` links to it —
Explorer, Kinova, Debug.

Two principles held:

- **A shortcut focuses, it never launches.** Opening a runtime app claims control and puts a robot
  behind glass; that stays the person's own press on the Open button. The route only selects the
  named app in the library.
- **They are links, not buttons.** A real `href` can be bookmarked, opened in a new tab, and pinned
  to a tablet home screen, which completes the same-Wi-Fi story.

A target the store does not have simply is not focused: a stale bookmark degrades to the plain
library, never to an error.

## Consequences

- The selection fallback chain in the library is `explicit selection ?? route target ?? most
  recent ?? first app`, and a route test holds the malformed-hash case to `DEFAULT_BLOOM_ROUTE`.
- The landing hero also shows the real Explorer Drive capture instead of a placeholder; the
  README screenshot script copies its fresh Drive shot over the landing asset so they cannot
  drift apart.

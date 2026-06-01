# Config Library

Typed configuration domain models live here.

This library describes Bloom concepts such as applications, screens, widgets, and exported configuration bundles. It should stay independent from:

- HTTP route handling
- database persistence
- ROS topics/services/actions
- frontend rendering details

## JSON IO

`json_io.py` contains file/string helpers for loading and saving configuration bundles. These helpers preserve the JSON migration bridge before database storage is introduced.

## Legacy JSON

`legacy_json.py` contains adapters for the current `extender_ui/data` JSON shapes. These adapters should preserve legacy payload details in widget settings while mapping screens and applications into Bloom domain models.

These adapters are migration-only. New Bloom configuration files should use `ConfigurationBundle` and the regular JSON IO helpers.

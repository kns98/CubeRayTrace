# Ray-Traced Room Lighting Showcase

A standalone HTML5 canvas demo that renders a simple ray-traced furnished room and demonstrates animated lighting behavior. The scene includes a cinematic camera path, progressive light dimming and brightening, manual camera controls, and adjustable render resolution for performance.

## Features

* Standalone HTML file; no external dependencies required.
* CPU-based ray tracing in JavaScript.
* Furnished room scene with walls, floor, ceiling, sofa, table, rug, plant, lamp, and screen.
* Cinematic demo camera path.
* Manual camera movement.
* Lighting showcase sequence:

  * Lights fully off
  * Ceiling light progressively brightening
  * Ceiling light fully on
  * Ceiling light dimming while floor lamp brightens
  * Mixed lighting
  * Progressive fade back to dark
* Adjustable render scale for performance tuning.
* On-screen status panel showing lighting phase and light intensity values.

## Files

```text
furniture_lighting_showcase.html
```

Open the HTML file directly in a modern browser to run the demo.

## How to Run

1. Download or copy `furniture_lighting_showcase.html`.
2. Open it in Chrome, Edge, Firefox, or another modern desktop browser.
3. The lighting demo starts automatically.

No build step, server, or package installation is required.

## Controls

| Control               | Action                                 |
| --------------------- | -------------------------------------- |
| `F`                   | Play / pause the lighting demo         |
| `T`                   | Restart the demo                       |
| `M`                   | Switch to manual camera mode           |
| `P`                   | Return to demo camera mode             |
| `W` / `A` / `S` / `D` | Move forward / left / backward / right |
| `Q` / `E`             | Move down / up                         |
| Mouse drag            | Look around manually                   |
| `R`                   | Reset the manual camera                |
| `-` / `=`             | Lower / raise render scale             |

The on-screen buttons provide the same main controls.

## Performance Notes

This demo uses CPU-based ray tracing in JavaScript, so performance depends heavily on screen resolution and device speed.

For smoother playback, lower the render scale using the on-screen dropdown or the `-` key. The default render scale is 50%, which provides a balance between visual quality and performance.

Suggested settings:

| Device Type              | Suggested Render Scale |
| ------------------------ | ---------------------- |
| Older laptop             | 25%–33%                |
| Modern laptop            | 33%–50%                |
| Desktop computer         | 50%–67%                |
| High-performance desktop | 67%–100%               |

## Customizing the Demo

You can edit the HTML file directly.

Common places to modify:

* `sceneLights`: change light position, color, and intensity.
* `evaluateLighting()`: change the timing of the on/off and dimming sequence.
* `demoPath`: change the cinematic camera path.
* `renderScale`: change the default render scale.
* Materials near the top of the script: change colors and emission values.

## Commercial Use and Licensing

This project is not automatically licensed for unrestricted commercial use.

If this demo, its source code, visual design, scene structure, or derived versions are used in a commercial product, paid client project, advertisement, training package, SaaS product, website, app, installation, exhibition, or other revenue-generating context, a commercial license should be obtained from the rights holder before use.

Commercial use may include, but is not limited to:

* Using the demo in a paid product or client deliverable.
* Embedding the code in a commercial website or application.
* Using the rendered visuals in advertising, marketing, or promotional material.
* Modifying the code and distributing the modified version commercially.
* Including the demo in paid courses, exhibitions, demos, or presentations.

For personal learning, internal experimentation, and non-commercial demonstration, permission terms should still be confirmed with the rights holder before redistribution.

## Suggested License Notice

Add a formal license file before distributing this project.

Example placeholder:

```text
Copyright (c) 2026 Kevin N Sheth

All rights reserved.

This software and associated visual output may not be used, copied, modified,
distributed, sublicensed, sold, or incorporated into commercial products or
services without prior written permission from the rights holder.

For commercial licensing, contact: [CONTACT EMAIL]
```

Replace the bracketed fields before publication.

## Disclaimer

This demo is provided as an experimental visual prototype. It is not optimized for production rendering workloads and does not include a full physically based lighting model. Review, test, and license the code appropriately before public or commercial use.

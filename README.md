# Fox Three School

An independent, browser-based training companion for DCS World, currently focused on beyond-visual-range skills. Pick your jet, then learn its radar, launch zones,
RWR and defensive moves the way DCS models them, and finish with full engagements against AI that
shoots back, debriefed like Tacview.

Built with three.js, TypeScript and Vite. The whole app builds into one self-contained HTML file.

## Run it

```
npm install
npm run dev          # http://localhost:5173 (Vite default)
```

Other scripts:

```
npm test             # simulation, data and page-logic tests (vitest)
npm run typecheck    # TypeScript strict
npm run build        # dist/index.html, single file, works offline except for web fonts
```

## What is inside

| Module | What you practise |
|---|---|
| Hangar | Pick one of ten jets and see what its radar and missiles can and cannot do in DCS. |
| Radar | The scan volume in 3D: azimuth, bars, antenna elevation, frame time, altitude coverage, the notch. |
| TWS | Guided lessons and free practice: cursor control, designation, multi-target shots, and the target's RWR. |
| Missiles | Launch zones: altitude, speed, aspect and target manoeuvre against Rmax and Rne, with flight plots. |
| Defense | You are the target: break a lock, notch and chaff at pitbull, drag a shot out, see a late defense. |
| RWR | Your jet's RWR anatomy, then a quiz on who is searching, locking and launching and what to do. |
| Sortie | 1v1, 1v2 or 2v2 against skill-scaled AI, with a replay debrief and coaching. |
| Cockpit | Kneeboard: bindings, procedures, missile and jet tables, RWR symbols, glossary, sources. |

Jets: Su-27, Su-33, J-11A, MiG-29S, F-15C (Flaming Cliffs), F/A-18C, F-16C, F-14B, JF-17, M-2000C.

## How it is built

- `src/data`: aircraft, missiles, RWRs and bindings as DCS presents them, with sources
  (`docs/research` holds the research notes behind them).
- `src/sim`: the simulation: tactical flight, radar scan, detection and track files, RWR, launch rules,
  gameplay missile model tuned to the DCS launch-zone numbers, AI pilots, scenarios.
- `src/render`: the three.js kit (stage, sky, procedural jets, Tacview-style tactical view, radar volume,
  cameras, replay).
- `src/ui`: cockpit-styled controls and panels, plus canvas cockpit displays for every radar format and RWR.
- `src/pages`: one folder per module.

`ARCHITECTURE.md` is the design contract. The missile and sensor models are game mechanics tuned to
reproduce what DCS players see, not models of real weapons; each page says what it simplifies.

## More

- `docs/README.md`: pilot's guide, developer guide, DCS accuracy notes, decisions.
- `AGENTS.md`: contributor and coding-agent instructions.
- `BACKLOG.md`: open work, prioritised.
- `CHANGELOG.md`: versions.

## Development roadmap

See [ROADMAP.md](ROADMAP.md) for discussion priorities and future additions, and [BACKLOG.md](BACKLOG.md) for the authoritative open work.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow, evidence requirements, and validation checks. Planned expansion into flight fundamentals, communications, and other DCS skills is described in [ROADMAP.md](ROADMAP.md). The current simulation uses a tactical autopilot; it is not yet a stick-and-rudder flight model.

## License

[MIT](LICENSE). Third-party assets and dependencies retain their own licenses.

# DCS practice missions

Single-player DCS World missions that go with the trainer's pages. Each folder holds a pydcs generator; the
built `.miz` files are committed to `public/missions/` so the site can offer them for download.

| Folder | Missions | Page |
|---|---|---|
| `harm/` | `Fox3_HARM_1_Ranges.miz` (safe SAM ranges), `Fox3_HARM_2_Live.miz` (live SEAD), F/A-18C, Caucasus | `#/harm` |

## Install a mission

Copy the `.miz` into `Saved Games\DCS\Missions` (or `Saved Games\DCS.openbeta\Missions`), then in DCS open
Mission, pick the file and fly.

## Rebuild

pydcs needs Python 3.12 (pydcs 0.15 fails to import on 3.13):

```bash
python -m pip install pydcs
python missions/harm/harm_training.py public/missions
```

The generators set every pylon by hand and skip the installed payload files, so they run without DCS installed.
Unit positions are on open ground checked in the Mission Editor; if you move a site, check the new spot there.

Rule 1 of `AGENTS.md` applies: missions set up gameplay situations only (where units are, what they do, what the
pilot carries).

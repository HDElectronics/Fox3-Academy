"""
Fox3 Academy copilot test mission (DCS World, Caucasus, single player).

An easy, predictable setup for checking the DCS link and the copilot:
- You: F/A-18C airborne over the Black Sea west of Batumi, 20000 ft, 350 kt, heading west,
  4 x AIM-120C, 2 x AIM-9X, centreline tank.
- Target drone: an unarmed Su-27 flying a race-track 25-40 nm ahead of you at 20000 ft. It never
  shoots and never evades: lock it, practise, shoot it.
- On request: F10 radio menu, Other, "Send armed Su-27" spawns an armed Su-27 (R-27ER, R-73,
  Average skill) 60 nm west of the start point, coming at you. It shoots halfway between its max range and
  its no-escape range, so the spike comes well before the launch. "Send new target drone" spawns a second
  drone after you have shot the first. It will lock and fire: use it to test RWR spikes and
  launches. Turn on Options > Gameplay > Immortal first if you want to keep flying after a hit.

Build (needs pydcs; Python 3.12, pydcs 0.15 fails to import on 3.13):
    python -m pip install pydcs
    python dcs-link/missions/copilot_test.py ["<Saved Games>/DCS/Missions/Fox3_Copilot_Test.miz"]
"""
import os
import sys

import dcs
from dcs import action, condition, task, triggers
from dcs.mission import Mission
from dcs.planes import FA_18C_hornet as Hornet, Su_27
from dcs.terrain import Caucasus
from dcs.payloads import PayloadDirectories
from dcs.unit import Skill

# Pylons are set by hand below, so pydcs need not read the installed payload files (pydcs 0.15 fails on
# payload files written for newer modules).
PayloadDirectories.payload_dirs = classmethod(lambda cls: iter(()))

FT = 0.3048
NM = 1852.0
KT_KMH = 1.852

ALT_M = 20000 * FT
DRONE_AWAY = (25 * NM, 40 * NM)  # race-track legs, ahead of the start point
BANDIT_AWAY = 60 * NM  # far enough that it is still well out after a few minutes flying west
FLAG_SEND_BANDIT = 1
FLAG_SEND_DRONE = 2


def build(out_path: str) -> None:
    terrain = Caucasus()
    m = Mission(terrain)
    m.start_time = m.start_time.replace(hour=10, minute=0)
    m.weather.clouds_density = 0
    m.weather.wind_at_ground.speed = 0
    m.set_description_text(
        "Fox3 Academy copilot test. Over the sea west of Batumi.\n"
        "Unarmed Su-27 target drone 25-40 nm west, flying back and forth: lock it and shoot it.\n"
        "F10 > Other > Send armed Su-27: an armed bandit spawns 60 nm west of the start and will attack you.\n"
        "F10 > Other > Send new target drone: a second unarmed drone.\n"
        "For a forgiving test, turn on Options > Gameplay > Immortal.")
    m.set_description_bluetask_text("Lock the drone. When ready, call the armed Su-27 and let it spike and launch on you.")

    usa = m.country("USA")
    russia = m.country("Russia")

    batumi = terrain.airports["Batumi"].position
    start = batumi.point_from_heading(270, 70_000)  # open sea

    # You.
    me = m.flight_group_inflight(usa, "Hornet", Hornet, start, altitude=int(ALT_M), speed=int(350 * KT_KMH), maintask=task.CAP)
    me.units[0].set_player()
    me.units[0].heading = 270
    me.add_waypoint(start.point_from_heading(270, 120_000), ALT_M, 350 * KT_KMH)
    u = me.units[0]
    u.load_pylon(Hornet.Pylon1.AIM_9X_Sidewinder_IR_AAM, 1)
    u.load_pylon(Hornet.Pylon2.LAU_115_with_1_x_LAU_127_AIM_120C_AMRAAM___Active_Radar_AAM, 2)
    u.load_pylon(Hornet.Pylon4.AIM_120C_5_AMRAAM___Active_Rdr_AAM, 4)
    u.load_pylon(Hornet.Pylon5.FPU_8A_Fuel_Tank_330_gallons, 5)
    u.load_pylon(Hornet.Pylon6.AIM_120C_5_AMRAAM___Active_Rdr_AAM, 6)
    u.load_pylon(Hornet.Pylon8.LAU_115_with_1_x_LAU_127_AIM_120C_AMRAAM___Active_Radar_AAM_, 8)
    u.load_pylon(Hornet.Pylon9.AIM_9X_Sidewinder_IR_AAM, 9)

    # Unarmed target drone: race-track between 25 and 40 nm ahead, never shoots, never evades.
    near = start.point_from_heading(270, DRONE_AWAY[0])
    far = start.point_from_heading(270, DRONE_AWAY[1])
    drone = m.flight_group_inflight(russia, "Target drone", Su_27, far, altitude=int(ALT_M), speed=int(450 * KT_KMH), maintask=task.CAP)
    drone.units[0].skill = Skill.Average
    drone.units[0].heading = 90
    drone.points[0].tasks = [
        task.OptROE(task.OptROE.Values.WeaponHold),
        task.OptReactOnThreat(task.OptReactOnThreat.Values.NoReaction),
        task.OrbitAction(int(ALT_M), int(450 * KT_KMH), task.OrbitAction.OrbitPattern.RaceTrack),
    ]
    drone.add_waypoint(near, ALT_M, 450 * KT_KMH)

    # Armed bandit, held until the pilot asks for it on the F10 menu.
    bstart = start.point_from_heading(270, BANDIT_AWAY)
    bandit = m.flight_group_inflight(russia, "Armed Su-27", Su_27, bstart, altitude=int(ALT_M), speed=int(450 * KT_KMH), maintask=task.CAP)
    bandit.late_activation = True
    b = bandit.units[0]
    b.skill = Skill.Average
    b.heading = 90
    b.load_pylon(Su_27.Pylon1.R_73__AA_11_Archer____Infra_Red, 1)
    b.load_pylon(Su_27.Pylon4.R_27ER__AA_10_Alamo_C____Semi_Act_Extended_Range, 4)
    b.load_pylon(Su_27.Pylon7.R_27ER__AA_10_Alamo_C____Semi_Act_Extended_Range, 7)
    b.load_pylon(Su_27.Pylon10.R_73__AA_11_Archer____Infra_Red, 10)
    bandit.points[0].tasks.append(task.OptROE(task.OptROE.Values.OpenFireWeaponFree))
    bandit.points[0].tasks.append(task.OptAAMissileAttackRange(task.OptAAMissileAttackRange.Values.HalfWayRMaxNoEsc))
    bandit.add_waypoint(start, ALT_M, 450 * KT_KMH)
    bandit.add_waypoint(batumi, ALT_M, 450 * KT_KMH)

    # Second drone, same race-track, held until asked for.
    drone2 = m.flight_group_inflight(russia, "Target drone 2", Su_27, far, altitude=int(ALT_M), speed=int(450 * KT_KMH), maintask=task.CAP)
    drone2.late_activation = True
    drone2.units[0].skill = Skill.Average
    drone2.units[0].heading = 90
    drone2.points[0].tasks = [
        task.OptROE(task.OptROE.Values.WeaponHold),
        task.OptReactOnThreat(task.OptReactOnThreat.Values.NoReaction),
        task.OrbitAction(int(ALT_M), int(450 * KT_KMH), task.OrbitAction.OrbitPattern.RaceTrack),
    ]
    drone2.add_waypoint(near, ALT_M, 450 * KT_KMH)

    # Triggers: briefing message, F10 radio items, activation.
    brief = triggers.TriggerOnce(comment="Briefing")
    brief.add_condition(condition.TimeAfter(1))
    brief.add_action(action.MessageToAll(m.string(
        "Fox3 copilot test. Target drone 25-40 nm west, unarmed: lock it.\n"
        "When ready: F10 > Other > Send armed Su-27. It will spike and shoot."), 30))
    brief.add_action(action.AddRadioItem(m.string("Send armed Su-27"), FLAG_SEND_BANDIT, 1))
    brief.add_action(action.AddRadioItem(m.string("Send new target drone"), FLAG_SEND_DRONE, 1))
    m.triggerrules.triggers.append(brief)

    send = triggers.TriggerOnce(comment="Send armed Su-27")
    send.add_condition(condition.FlagIsTrue(FLAG_SEND_BANDIT))
    send.add_action(action.ActivateGroup(bandit.id))
    send.add_action(action.MessageToAll(m.string("Armed Su-27 inbound from the west, hot. Expect a spike, then a launch."), 15))
    m.triggerrules.triggers.append(send)

    send2 = triggers.TriggerOnce(comment="Send new target drone")
    send2.add_condition(condition.FlagIsTrue(FLAG_SEND_DRONE))
    send2.add_action(action.ActivateGroup(drone2.id))
    send2.add_action(action.MessageToAll(m.string("New target drone on the race-track, 25-40 nm west of the start point."), 15))
    m.triggerrules.triggers.append(send2)

    m.save(out_path)
    print(f"Saved {out_path}")


if __name__ == "__main__":
    default = os.path.join(os.path.expanduser("~"), "Saved Games", "DCS", "Missions", "Fox3_Copilot_Test.miz")
    build(sys.argv[1] if len(sys.argv) > 1 else default)

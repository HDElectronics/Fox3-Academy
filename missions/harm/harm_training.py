"""
Fox3 HARM training missions for the F/A-18C (DCS World, Caucasus, single player).

Builds two missions:

  Fox3_HARM_1_Ranges.miz  Safe ranges. Every SAM radar is on (alarm state red) but holds fire, never shuts down
                          for an incoming HARM and never moves. Practise SP, TOO and PB at your own pace.
                          Range 1 (SA-6) is on at start; Range 2 (SA-8 + SA-15) and Range 3 (SA-11) come on from
                          the F10 radio menu. Each range can be reset once from F10.
  Fox3_HARM_2_Live.miz    Live SEAD. The same SA-6 and SA-11 sites, weapons free, with the default AI reaction
                          to anti-radiation missiles (they may shut the radar down). Pullback drill and real shots.

The built missions are also served by the site from public/missions/ (see missions/README.md).
Research and sources: docs/research/fa18c-harm.md. Procedures: the #/harm page.

Build (pydcs; Python 3.12, pydcs 0.15 fails to import on 3.13):
    python -m pip install pydcs
    python missions/harm/harm_training.py [output folder]     default: <Saved Games>/DCS/Missions
"""
import os
import sys

from dcs import action, condition, task, triggers, vehicles
from dcs.mission import Mission
from dcs.payloads import PayloadDirectories
from dcs.planes import FA_18C_hornet as Hornet
from dcs.terrain import Caucasus
from dcs.mapping import Point

PayloadDirectories.payload_dirs = classmethod(lambda cls: iter(()))

FT = 0.3048
NM = 1852.0
KT_KMH = 1.852
ALT_M = 25000 * FT
SPEED = 450 * KT_KMH  # true airspeed, about 0.78 M at 25000 ft

AD = vehicles.AirDefence

# Ground positions (x north, y east, metres). Coast is near y 625 km at this latitude.
START = (-300_000, 560_000)          # over the sea, 50 nm west of Range 1
FENCE = (-300_000, 622_000)          # coast in
R1_STR = (-298_926, 654_610)         # Range 1: SA-6 Straight Flush (placed in the Mission Editor)
R2_SA8 = (-318_391, 667_990)         # Range 2: SA-8
R2_SA15 = (-311_343, 675_197)        # Range 2: SA-15
R3_SR = (-293_667, 692_794)          # Range 3: SA-11 Snow Drift


class OptEvasionOfARM(task.Option):
    """AI option 31 (Mission Editor: "Evasion of ARM"). Default on: AD units try to counter ARM attacks."""
    Key = 31


def pt(m, xy):
    return Point(xy[0], xy[1], m.terrain)


def sam_options(g, live: bool):
    t = [
        task.OptAlarmState(2),            # red: radars on all the time
        task.OptDisparseUnderFire(0),     # never drive away
        task.OptROE(task.OptROE.Values.OpenFire if live else task.OptROE.Values.WeaponHold),
    ]
    if not live:
        t.append(OptEvasionOfARM(False))  # keep emitting while a HARM is inbound
    g.points[0].tasks.extend(t)


def site(m, country, name, units, live, late=False):
    """units: list of (type, (x, y), heading)."""
    (t0, p0, h0) = units[0]
    g = m.vehicle_group(country, name, t0, pt(m, p0), heading=h0)
    for i, (t, p, h) in enumerate(units[1:], start=2):
        u = m.vehicle(f"{name} #{i}", t)
        u.position = pt(m, p)
        u.heading = h
        g.add_unit(u)
    g.units[0].name = f"{name} #1"
    g.late_activation = late
    sam_options(g, live)
    return g


def off(p, dx, dy):
    return (p[0] + dx, p[1] + dy)


def sa6(m, c, name, live, late=False):
    return site(m, c, name, [
        (AD.Kub_1S91_str, R1_STR, 270),
        (AD.Kub_2P25_ln, off(R1_STR, 150, -120), 270),
        (AD.Kub_2P25_ln, off(R1_STR, -150, -120), 270),
    ], live, late)


def r2(m, c, name, late=False):
    a = site(m, c, f"{name} SA-8", [(AD.Osa_9A33_ln, R2_SA8, 300)], False, late)
    b = site(m, c, f"{name} SA-15", [(AD.Tor_9A331, R2_SA15, 300)], False, late)
    return a, b


def sa11(m, c, name, live, late=False):
    return site(m, c, name, [
        (AD.SA_11_Buk_SR_9S18M1, R3_SR, 270),
        (AD.SA_11_Buk_CC_9S470M1, off(R3_SR, 0, 80), 270),
        (AD.SA_11_Buk_LN_9A310M1, off(R3_SR, 200, -180), 270),
        (AD.SA_11_Buk_LN_9A310M1, off(R3_SR, -200, -180), 270),
    ], live, late)


def player(m, usa):
    terrain = m.terrain
    me = m.flight_group_inflight(usa, "Weasel 1", Hornet, pt(m, START), altitude=int(ALT_M), speed=int(SPEED), maintask=task.SEAD)
    u = me.units[0]
    u.set_player()
    u.heading = 90
    u.name = "Weasel 1-1"
    u.load_pylon(Hornet.Pylon1.AIM_9X_Sidewinder_IR_AAM, 1)
    u.load_pylon(Hornet.Pylon2.AGM_88C_HARM___High_Speed_Anti_Radiation_Missile_, 2)
    u.load_pylon(Hornet.Pylon3.AGM_88C_HARM___High_Speed_Anti_Radiation_Missile_, 3)
    u.load_pylon(Hornet.Pylon5.FPU_8A_Fuel_Tank_330_gallons, 5)
    u.load_pylon(Hornet.Pylon7.AGM_88C_HARM___High_Speed_Anti_Radiation_Missile_, 7)
    u.load_pylon(Hornet.Pylon8.AGM_88C_HARM___High_Speed_Anti_Radiation_Missile_, 8)
    u.load_pylon(Hornet.Pylon9.AIM_9X_Sidewinder_IR_AAM, 9)
    for name, p in (("FENCE", FENCE), ("R1 SA-6", R1_STR), ("R2 SA-8/15", ((R2_SA8[0] + R2_SA15[0]) / 2, (R2_SA8[1] + R2_SA15[1]) / 2)), ("R3 SA-11", R3_SR)):
        w = me.add_waypoint(pt(m, p), ALT_M, SPEED)
        w.name = name
    me.land_at(terrain.airports["Kobuleti"])
    return me


def message(m, comment, cond, text, seconds=20, extra=()):
    t = triggers.TriggerOnce(comment=comment)
    t.add_condition(cond)
    for a in extra:
        t.add_action(a)
    t.add_action(action.MessageToAll(m.string(text), seconds))
    m.triggerrules.triggers.append(t)


def base_mission():
    m = Mission(Caucasus())
    m.start_time = m.start_time.replace(month=6, day=15, hour=10, minute=0)
    m.weather.clouds_density = 0
    m.weather.wind_at_ground.speed = 0
    m.weather.wind_at_2000.speed = 0
    m.weather.wind_at_8000.speed = 0
    return m


ROUTE = ("Route: WP1 FENCE (coast in), WP2 R1 SA-6 radar, WP3 R2 SA-8/SA-15, WP4 R3 SA-11 Snow Drift, "
         "WP5 Kobuleti. Waypoints 2 and 4 sit exactly on the radars for PB shots.")

# Flags
F_R2, F_R3, F_RESET1, F_RESET2, F_RESET3, F_BRIEF = 1, 2, 3, 4, 5, 6


def build_ranges(path):
    m = base_mission()
    usa, russia = m.country("USA"), m.country("Russia")
    brief = (
        "FOX3 HARM TRAINING 1 - SAFE RANGES\n"
        "You: Weasel 1, F/A-18C, 25000 ft, 450 kt, heading east, 4 x AGM-88C, 2 x AIM-9X, centreline tank.\n"
        "All SAMs here hold fire, keep their radars on and never shut down for a HARM. No enemy aircraft.\n\n"
        "Range 1 (on now): SA-6, RWR 6, class H1, PB code 108. Drill: SP shot, then TOO.\n"
        "Range 2 (F10): SA-8 (RWR 8, H1, code 117) and SA-15 (RWR 15, H2, code 119). Drill: TOO with the class filter.\n"
        "Range 3 (F10): SA-11, Snow Drift search radar (RWR SD, H2, code 107). Drill: PB on WP4.\n"
        "F10 > Other also resets each range once, and repeats this briefing.\n\n" + ROUTE)
    m.set_description_text(brief)
    m.set_description_bluetask_text("Kill the Range 1 SA-6 radar in SP, the Range 2 SA-15 in TOO, and the Range 3 Snow Drift in PB.")
    player(m, usa)

    r1 = sa6(m, russia, "Range 1 SA-6", live=False)
    r2a, r2b = r2(m, russia, "Range 2", late=True)
    r3 = sa11(m, russia, "Range 3 SA-11", live=False, late=True)
    r1b = sa6(m, russia, "Range 1 reset SA-6", live=False, late=True)
    r2ra, r2rb = r2(m, russia, "Range 2 reset", late=True)
    r3b = sa11(m, russia, "Range 3 reset SA-11", live=False, late=True)

    start = triggers.TriggerOnce(comment="Briefing and radio menu")
    start.add_condition(condition.TimeAfter(2))
    for label, flag in (("Range 2 ON (SA-8 + SA-15)", F_R2), ("Range 3 ON (SA-11)", F_R3), ("Reset Range 1", F_RESET1),
                        ("Reset Range 2", F_RESET2), ("Reset Range 3", F_RESET3), ("Repeat briefing", F_BRIEF)):
        start.add_action(action.AddRadioItem(m.string(label), flag, 1))
    start.add_action(action.MessageToAll(m.string(
        "Weasel 1, Fox3 range control. Range 1 SA-6 is hot and holding fire, bearing 090, 50 nm.\n"
        "Master Arm ARM, A/G, select HARM on the stores page. Ranges 2 and 3 are on the F10 menu."), 40))
    m.triggerrules.triggers.append(start)

    brief_again = triggers.TriggerContinious(comment="Repeat briefing")
    brief_again.add_condition(condition.FlagIsTrue(F_BRIEF))
    brief_again.add_action(action.ClearFlag(F_BRIEF))
    brief_again.add_action(action.MessageToAll(m.string(brief), 60))
    m.triggerrules.triggers.append(brief_again)

    def on(flag, groups, text, comment):
        t = triggers.TriggerOnce(comment=comment)
        t.add_condition(condition.FlagIsTrue(flag))
        for g in groups:
            t.add_action(action.ActivateGroup(g.id))
        t.add_action(action.MessageToAll(m.string(text), 20))
        m.triggerrules.triggers.append(t)

    on(F_R2, (r2a, r2b), "Range 2 hot: SA-8 and SA-15, 5 nm apart, south-east of Range 1, holding fire. Use TOO and the class filter.", "Range 2 on")
    on(F_R3, (r3,), "Range 3 hot: SA-11 at WP4, holding fire. PB: code 107 for the Snow Drift.", "Range 3 on")
    on(F_RESET1, (r1b,), "Range 1 reset: a fresh SA-6 at WP2.", "Reset Range 1")
    on(F_RESET2, (r2ra, r2rb), "Range 2 reset: fresh SA-8 and SA-15.", "Reset Range 2")
    on(F_RESET3, (r3b,), "Range 3 reset: a fresh SA-11 at WP4.", "Reset Range 3")

    for g, text in ((r1, "Range 1: Straight Flush destroyed. Good hit."),
                    (r1b, "Range 1 reset: Straight Flush destroyed."),
                    (r2a, "Range 2: SA-8 destroyed."), (r2b, "Range 2: SA-15 destroyed."),
                    (r2ra, "Range 2 reset: SA-8 destroyed."), (r2rb, "Range 2 reset: SA-15 destroyed."),
                    (r3, "Range 3: Snow Drift destroyed. Good PB shot."), (r3b, "Range 3 reset: Snow Drift destroyed.")):
        message(m, f"Kill {g.name}", condition.UnitDead(g.units[0].id), text)

    m.save(path)
    print("Saved", path)


def build_live(path):
    m = base_mission()
    usa, russia = m.country("USA"), m.country("Russia")
    brief = (
        "FOX3 HARM TRAINING 2 - LIVE SEAD\n"
        "Same jet, route and sites as mission 1, but the SAMs are live: they lock, shoot, and may shut their radar\n"
        "down when a HARM comes in (DCS default AI). No enemy aircraft. Turn on Options > Gameplay > Immortal for\n"
        "your first tries.\n\n"
        "SA-6 at WP2 (RWR 6, code 108): shoot it in TOO from outside its range, or fly the Pullback drill:\n"
        "unbox HRM OVRD, let it lock you, pickle when HARM shows without an X, then defend.\n"
        "SA-11 at WP4 (RWR SD, code 107): PB shot from stand-off.\n\n" + ROUTE)
    m.set_description_text(brief)
    m.set_description_bluetask_text("Kill both SAM radars and RTB to Kobuleti.")
    player(m, usa)
    r1 = sa6(m, russia, "SA-6", live=True)
    r3 = sa11(m, russia, "SA-11", live=True)

    start = triggers.TriggerOnce(comment="Briefing")
    start.add_condition(condition.TimeAfter(2))
    start.add_action(action.AddRadioItem(m.string("Repeat briefing"), F_BRIEF, 1))
    start.add_action(action.MessageToAll(m.string(
        "Weasel 1, the SAMs are live. SA-6 at WP2, SA-11 at WP4. Expect spikes. Good hunting."), 30))
    m.triggerrules.triggers.append(start)

    brief_again = triggers.TriggerContinious(comment="Repeat briefing")
    brief_again.add_condition(condition.FlagIsTrue(F_BRIEF))
    brief_again.add_action(action.ClearFlag(F_BRIEF))
    brief_again.add_action(action.MessageToAll(m.string(brief), 60))
    m.triggerrules.triggers.append(brief_again)

    message(m, "Kill SA-6", condition.UnitDead(r1.units[0].id), "SA-6 Straight Flush destroyed.")
    message(m, "Kill SA-11", condition.UnitDead(r3.units[0].id), "SA-11 Snow Drift destroyed.")
    m.save(path)
    print("Saved", path)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser("~"), "Saved Games", "DCS", "Missions")
    build_ranges(os.path.join(out, "Fox3_HARM_1_Ranges.miz"))
    build_live(os.path.join(out, "Fox3_HARM_2_Live.miz"))

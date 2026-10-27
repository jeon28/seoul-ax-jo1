"""이송 후보 계산 (수량은 이 스크립트만 계산한다).

사용법:
  python plan.py <balance.csv> <schedule.csv> <space.csv> <type_teu.csv> <출력폴더>

스페이스는 모선 전체 TEU 하나이며 모든 타입이 공유한다 (space.csv: vessel,voyage,space).
  우선순위: 빠른 ETD 모선 → (특수 컨테이너 RF/OT/FR이 일본 내 Surplus가 있으면 Dry보다 먼저) → 타입 우선순위(type_teu.csv의 priority, 작을수록 먼저) → 기항 순서상 먼저 나오는 부족 포트.
단위는 TEU. 이송 수량(qty)은 컨테이너 개수이고, 스페이스 점유는 qty × 타입별 TEU 환산값.
환산값은 type_teu.csv 우선, 없으면 타입명 앞의 길이(20=1, 40=2)로만 추정, 그 밖(45, 22 등 코드 포함)은 중단하고 사람에게 확인.

규칙
  - 과부족은 타입별로 따로 계산한다. net>0 = Surplus, net<0 = Deficit.
  - 모선 기항 순서상 Surplus 포트가 Deficit 포트보다 먼저일 때만 이송 가능.
  - 스페이스는 구간(레그)별 점유로 계산: i→j 이송은 i..j-1 구간을 모두 점유한다.
  - 모선은 가장 이른 ETD 순, Deficit 포트는 기항 순서로 처리한다.
  - 같은 Deficit에 쓸 Surplus 포트가 여럿이면, 다른 (모선, 부족 포트) 조합으로 쓸 수 있는 경우가 적은 포트의 잉여를 먼저 쓴다
    (다른 모선이 닿지 못하는 포트의 잉여를 아껴 두지 않기 위해). 같으면 가까운 앞 포트부터.
  - 같은 모선 안에서 포트가 두 번 나오면 첫 기항만 사용하고 경고한다.

출력: plan.csv, flags.csv (스페이스 플래그는 타입·모선별 1줄), space_events.csv (구간 조합별 상세)
"""
import csv
import os
import re
import sys
from collections import defaultdict
from fractions import Fraction


def load(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def teu_factors(path, types):
    table = {r["type"].upper(): Fraction(r["teu"]) for r in load(path)}
    out = {}
    for t in types:
        if t in table:
            out[t] = table[t]
            continue
        m = re.match(r"(20|40)", t)
        if not m:
            sys.exit(f"타입 '{t}'의 TEU 환산값을 모름 → {path}에 추가하거나 사람에게 확인하세요.")
        out[t] = {"20": Fraction(1), "40": Fraction(2)}[m.group(1)]
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    if len(sys.argv) != 6:
        sys.exit(__doc__)
    bal_p, sch_p, spc_p, teu_p, out_dir = sys.argv[1:]
    os.makedirs(out_dir, exist_ok=True)
    bal, sch, spc = load(bal_p), load(sch_p), load(spc_p)

    net = defaultdict(dict)  # type -> port -> net
    for r in bal:
        net[r["type"]][r["port"]] = net[r["type"]].get(r["port"], 0) + int(r["net"])

    vessels = defaultdict(list)  # (vessel,voyage) -> [(seq,port,etd,cutoff)]
    for r in sch:
        vessels[(r["vessel"], r["voyage"])].append((int(r["seq"]), r["port"], r["etd"], r["cutoff"]))
    flags, calls = [], {}
    for key, lst in vessels.items():
        lst.sort()
        seen, uniq = set(), []
        for seq, port, etd, cut in lst:
            if port in seen:
                flags.append(["-", "DUP_PORT", f"{key[0]} {key[1]}", f"{port} 중복 기항, 첫 기항만 사용"])
                continue
            seen.add(port)
            uniq.append((port, etd, cut))
        for n, (port, _, cut) in enumerate(uniq):
            if cut:
                continue
            if n == len(uniq) - 1:  # 마지막 기항지는 선적 포트가 될 수 없다
                flags.append(["-", "CUTOFF_MISSING_NOIMPACT", f"{key[0]} {key[1]}",
                              f"{port} Cut-off 없음 (마지막 기항지라 이번 이송안에는 영향 없음, 원본 확인)"])
            else:
                flags.append(["-", "CUTOFF_MISSING", f"{key[0]} {key[1]}",
                              f"{port} Cut-off 없음 → 이 포트에서 선적하는 이송은 배정하지 않음, 원본 확인 필요"])
        calls[key] = uniq
    order = sorted(calls, key=lambda k: (min((e for _, e, _ in calls[k] if e), default="9999"), k))

    factor = teu_factors(teu_p, set(net))
    cap = {}  # 모선 -> 구간별 남은 TEU (모든 타입이 하나의 풀을 공유)
    for r in spc:
        k = (r["vessel"], r["voyage"])
        if k not in calls:
            flags.append(["-", "SPACE_UNKNOWN_VESSEL", f"{k[0]} {k[1]}", "스케줄에 없는 모선"])
            continue
        cap[k] = [Fraction(r["space"])] * max(len(calls[k]) - 1, 0)
    for k in order:
        if k not in cap:
            flags.append(["-", "SPACE_MISSING", f"{k[0]} {k[1]}", "잔여 스페이스 없음 → 이 모선은 배정하지 않음"])

    prio = {r["type"].upper(): int(r.get("priority") or 99) for r in load(teu_p)}
    suffix_prio = {"GP": 3, "DC": 3, "HC": 3, "RF": 4, "RE": 4, "OT": 5, "UT": 5, "PC": 6, "FR": 6}  # 표에 없는 타입: Dry 계열은 표의 Dry 뒤, RF, OT 순

    def prio_of(t):
        if t in prio:
            return prio[t]
        flags.append([t, "TYPE_PRIORITY_UNSET", t, "type_teu.csv에 우선순위가 없어 접미사로 추정 → 확인 필요"])
        return suffix_prio.get(t[-2:], 99)

    special = {r["type"].upper() for r in load(teu_p) if (r.get("special") or "").upper() == "Y"}

    def is_special(t):
        return t in special or (t not in prio and t[-2:] in ("RE", "UT", "PC", "RF", "OT", "FR"))

    # 특수 컨테이너(RF/OT/FR)는 일본 내에 이송 가능한 Surplus가 있으면 Dry보다 먼저 스페이스를 쓴다.
    types = sorted(net, key=lambda t: (0 if is_special(t) and any(v > 0 for v in net[t].values()) else 1,
                                       prio_of(t), t))
    surplus = {t: {p: v for p, v in net[t].items() if v > 0} for t in types}
    deficit = {t: {p: -v for p, v in net[t].items() if v < 0} for t in types}
    # 포트 잉여의 "쓸 수 있는 곳" 수: (타입, 선적 포트) -> 그 잉여로 채울 수 있는 (모선, 부족 포트) 조합 수.
    opts = defaultdict(int)
    for k2 in order:
        if k2 not in cap:
            continue
        pl2 = calls[k2]
        for t in types:
            for j2, (pj2, _, _) in enumerate(pl2):
                if deficit[t].get(pj2, 0) <= 0:
                    continue
                for i2 in range(j2):
                    if surplus[t].get(pl2[i2][0], 0) > 0 and pl2[i2][2]:
                        opts[(t, pl2[i2][0])] += 1
    plan = []
    events = defaultdict(list)  # (타입, 모선) -> 스페이스 부족 이벤트
    blocked = defaultdict(list)  # (모선, 선적 포트) -> Cut-off 없어 제외된 후보
    for k in order:
        legs = cap.get(k)
        if legs is None:
            continue
        pl = calls[k]
        for t in types:  # 타입 우선순위: 앞 타입이 모선 스페이스를 먼저 가져간다
            f = factor[t]
            for j, (pj, _, _) in enumerate(pl):
                if deficit[t].get(pj, 0) <= 0:
                    continue
                for i in sorted(range(j), key=lambda x: (opts[(t, pl[x][0])], -x)):
                    pi = pl[i][0]
                    if surplus[t].get(pi, 0) <= 0 or deficit[t].get(pj, 0) <= 0:
                        continue
                    want = min(surplus[t][pi], deficit[t][pj])
                    if not pl[i][2]:  # 선적 포트 Cut-off 없음 → 배정하지 않고 사람 확인
                        blocked[(k, pi)].append((t, pj, want))
                        continue
                    room = min(legs[i:j])  # TEU
                    q = min(want, int(room // f))
                    if q < want:
                        events[(t, k)].append((pi, pj, want, q, room))
                    if q > 0:
                        for x in range(i, j):
                            legs[x] -= q * f
                        surplus[t][pi] -= q
                        deficit[t][pj] -= q
                        plan.append((k, pl[i][0], t, pi, pj, q, pl[i][1], pl[i][2], q * f))
    for (t, k), ev in events.items():  # 스페이스 플래그는 타입·모선별로 한 줄로 묶는다
        ex = "; ".join(f"{pi}→{pj} 필요 {want} 중 {q}" for pi, pj, want, q, _ in ev[:3])
        more = f" 외 {len(ev) - 3}건" if len(ev) > 3 else ""
        done = sum(r[5] for r in plan if r[0] == k and r[2] == t)
        flags.append([t, "SPACE_SHORT", f"{k[0]} {k[1]}",
                      f"스페이스 부족으로 {len(ev)}개 구간 조합 축소/제외 (이 타입 배정 {done}개, 1개={float(factor[t]):g} TEU). 예: {ex}{more}"])
    for (k, pi), lst in blocked.items():
        ex = "; ".join(f"{t} {pi}→{pj} {want}개" for t, pj, want in lst[:3])
        more = f" 외 {len(lst) - 3}건" if len(lst) > 3 else ""
        flags.append(["-", "CUTOFF_BLOCKED", f"{k[0]} {k[1]} {pi}",
                      f"Cut-off 없어 선적 후보 {len(lst)}건 배정 제외. 예: {ex}{more} → 최신 Cut-off 확인 후 다시 계산"])
    reach = {p for k in calls for p, _, _ in calls[k]}
    for t in types:
        for p, d in deficit[t].items():
            if d <= 0:
                continue
            if p not in reach:
                flags.append([t, "NO_VESSEL", p, f"Deficit {d}, 내일 모선 기항 없음"])
            elif sum(surplus[t].values()) == 0:
                flags.append([t, "NO_SURPLUS", p, f"Deficit {d} 남음, 역내 Surplus 소진 → 부산 공급 검토"])
            else:
                flags.append([t, "UNRESOLVED", p,
                              f"Deficit {d} 남음 (Surplus는 남았으나 기항 순서·스페이스로 이송 불가)"])
        for p, s in surplus[t].items():
            if s > 0:
                flags.append([t, "SURPLUS_LEFT", p, f"Surplus {s} 남음 (정보)"])


    with open(os.path.join(out_dir, "plan.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["vessel", "voyage", "type", "from", "to", "qty", "etd", "cutoff", "teu"])
        for k, _, t, pi, pj, q, etd, cut, teu in plan:
            w.writerow([k[0], k[1], t, pi, pj, q, etd, cut, f"{float(teu):g}"])
    with open(os.path.join(out_dir, "flags.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["type", "flag", "target", "detail"])
        w.writerows(flags)
    with open(os.path.join(out_dir, "space_events.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["type", "vessel", "voyage", "from", "to", "need", "assigned", "room_teu"])
        for (t, k), ev in events.items():
            for pi, pj, want, q, room in ev:
                w.writerow([t, k[0], k[1], pi, pj, want, q, f"{float(room):g}"])
    print(f"이송안 {len(plan)}건, 플래그 {len(flags)}건 → {out_dir}")


if __name__ == "__main__":
    main()

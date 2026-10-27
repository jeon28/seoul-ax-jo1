"""이송안을 입력과 독립적으로 재검산하고 한 장짜리 보고서를 만든다.

사용법:
  python verify.py <balance.csv> <schedule.csv> <space.csv> <plan.csv> <flags.csv> <type_teu.csv> <report.md> [원본합계.csv] [--queried-at "2026-10-27 09:00"]

원본 합계 파일 (선택, 이름 자유. 사람이 시스템 수치를 옮겨 적은 것): type,onhand,required
검사
  1. 타입별 보유·필요 합계가 원본합계와 일치하는가 (파일 있을 때)
  2. 출발 포트별 이송 합계 <= Surplus, 도착 포트별 <= Deficit
  3. 모선·구간별 점유(전 타입 합, TEU = 개수 × 타입별 환산값) <= 모선 잔여 스페이스(TEU), 출발 포트가 도착 포트보다 먼저 기항
"""
import csv
import re
import sys
from fractions import Fraction
from collections import defaultdict


def load(p):
    with open(p, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def factor_of(table, t):
    if t in table:
        return table[t]
    m = re.match(r"(20|40)", t)
    if not m:
        sys.exit(f"타입 '{t}'의 TEU 환산값을 모름")
    return {"20": Fraction(1), "40": Fraction(2)}[m.group(1)]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    args, queried = sys.argv[1:], ""
    if "--queried-at" in args:
        i = args.index("--queried-at")
        queried = " ".join(args[i + 1:i + 2])
        del args[i:i + 2]
    if len(args) not in (7, 8):
        sys.exit(__doc__)
    bal_p, sch_p, spc_p, plan_p, flag_p, teu_p, out_p = args[:7]
    src_p = args[7] if len(args) == 8 else None
    table = {r["type"].upper(): Fraction(r["teu"]) for r in load(teu_p)}
    bal, sch, spc, plan, flags = map(load, (bal_p, sch_p, spc_p, plan_p, flag_p))
    results = []  # (이름, 통과여부, 상세)

    tot = defaultdict(lambda: [0, 0])
    net = defaultdict(int)
    for r in bal:
        tot[r["type"]][0] += int(r["onhand"])
        tot[r["type"]][1] += int(r["required"])
        net[(r["type"], r["port"])] += int(r["net"])
    if src_p:
        for r in load(src_p):
            t = r["type"].upper()
            got = tot.get(t, [0, 0])
            ok = got == [int(r["onhand"]), int(r["required"])]
            results.append((f"원본 합계 대조 {t}", ok, f"변환 {got} / 원본 [{r['onhand']}, {r['required']}]"))
    else:
        results.append(("원본 합계 대조", None, "원본 합계 파일 없음 → 사람이 시스템 수치와 직접 대조"))

    out_q, in_q = defaultdict(int), defaultdict(int)
    order = defaultdict(dict)
    for r in sch:
        order[(r["vessel"], r["voyage"])].setdefault(r["port"], int(r["seq"]))
    occ = defaultdict(Fraction)
    bad = []
    for r in plan:
        q, t = int(r["qty"]), r["type"]
        out_q[(t, r["from"])] += q
        in_q[(t, r["to"])] += q
        k = (r["vessel"], r["voyage"])
        a, b = order[k].get(r["from"]), order[k].get(r["to"])
        if a is None or b is None or a >= b:
            bad.append(f"{k} {r['from']}→{r['to']} 기항 순서 위반")
            continue
        ports = sorted(order[k], key=order[k].get)
        for x in range(ports.index(r["from"]), ports.index(r["to"])):
            occ[(k, x)] += q * factor_of(table, t)
    over_s = [f"{t} {p}: 이송 {q} > Surplus {net[(t, p)]}" for (t, p), q in out_q.items() if q > max(net[(t, p)], 0)]
    over_d = [f"{t} {p}: 입고 {q} > Deficit {-net[(t, p)]}" for (t, p), q in in_q.items() if q > max(-net[(t, p)], 0)]
    cap = {(r["vessel"], r["voyage"]): Fraction(r["space"]) for r in spc}
    over_c = [f"{k[0]} {k[1]} 구간{x}: 점유 {float(v):g} TEU > 스페이스 {float(cap.get(k, 0)):g} TEU"
              for (k, x), v in occ.items() if v > cap.get(k, 0)]
    results.append(("기항 순서", not bad, "; ".join(bad) or "위반 없음"))
    nocut = [f"{r['vessel']} {r['voyage']} {r['from']}→{r['to']}" for r in plan if not r["cutoff"]]
    results.append(("선적 포트 Cut-off 있음", not nocut, "; ".join(nocut) or "이상 없음"))
    results.append(("Surplus 초과 이송 없음", not over_s, "; ".join(over_s) or "이상 없음"))
    results.append(("Deficit 초과 입고 없음", not over_d, "; ".join(over_d) or "이상 없음"))
    results.append(("모선 스페이스 초과 없음", not over_c, "; ".join(over_c) or "이상 없음"))

    status = lambda ok: "확인 필요" if ok is None else ("통과" if ok else "실패")
    passed = all(ok is not False for _, ok, _ in results)
    ftypes = defaultdict(int)
    for f in flags:
        if f["flag"] != "SURPLUS_LEFT":
            ftypes[f["flag"]] += 1

    L = ["# 일본 공이송 이송안 (초안)", "",
         "> 초안입니다. 최종 확정은 사람이 합니다.", ""]
    if not passed:
        L += ["> **⚠ 수량 검증 실패 — 이 이송안은 사용하지 마세요.** 아래 '수량 검증' 표에서 실패 항목을 확인하세요.", ""]
    L += [
         f"데이터 조회 시각: {queried or '미입력 (확인 필요)'}", "",
         "## 이송안" + ("" if passed else " (검증 실패 — 사용 금지)"), "", "| 모선 | 항차 | 타입 | 출발 | 도착 | 수량(개) | TEU | ETD | Cut-off |", "|---|---|---|---|---|---:|---:|---|---|"]
    for r in plan:
        L.append(f"| {r['vessel']} | {r['voyage']} | {r['type']} | {r['from']} | {r['to']} | {r['qty']} | {r['teu']} | {r['etd'] or '?'} | {r['cutoff'] or '?'} |")
    if not plan:
        L.append("| (이송안 없음) | | | | | | | | |")
    L += ["", "## 수량 검증", "", "| 검사 | 결과 | 상세 |", "|---|---|---|"]
    L += [f"| {n} | {status(ok)} | {d} |" for n, ok, d in results]
    L += ["", f"**수량 검증 종합: {'실패' if not passed else ('통과 (확인 필요 항목 있음)' if any(ok is None for _, ok, _ in results) else '통과')}** (스크립트 재검산, '확인 필요'는 사람 대조 대기)", "",
          "## 예외 플래그", ""]
    if ftypes:
        L.append("건수: " + ", ".join(f"{k} {v}" for k, v in ftypes.items()))
        L += ["", "| 타입 | 유형 | 대상 | 내용 |", "|---|---|---|---|"]
        L += [f"| {f['type']} | {f['flag']} | {f['target']} | {f['detail']} |" for f in flags if f["flag"] != "SURPLUS_LEFT"]
    else:
        L.append("없음")
    left = [f for f in flags if f["flag"] == "SURPLUS_LEFT"]
    L += ["", "## 남은 잉여 (정보, 플래그 건수에는 넣지 않음)", ""]
    if left:
        L += ["| 타입 | 포트 | 내용 |", "|---|---|---|"]
        L += [f"| {f['type']} | {f['target']} | {f['detail']} |" for f in left]
    else:
        L.append("없음")
    L += ["", "## 사람이 원본과 대조할 체크리스트", ""]
    seen = set()
    for r in plan:
        key = (r["vessel"], r["voyage"])
        if key in seen:
            continue
        seen.add(key)
        L.append(f"- [ ] {r['vessel']} / {r['voyage']} — ETD {r['etd'] or '?'}, Cut-off {r['cutoff'] or '?'} 를 최신 스케줄과 대조")
    L += ["- [ ] 지역·타입별 보유/필요 합계를 시스템 수치와 대조",
          f"- [ ] 조회 시각({queried or '미입력'})이 기준 시점과 맞는지 확인",
          "- [ ] 대리점 발송 메일은 사람이 검토 후 발송"]
    with open(out_p, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print(f"수량 검증 {'통과' if passed else '실패'} → {out_p}")
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()

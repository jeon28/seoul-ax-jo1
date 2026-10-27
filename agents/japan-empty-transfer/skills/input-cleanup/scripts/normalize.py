"""시스템 CSV를 표준 형식으로 변환한다.

사용법:
  python normalize.py balance  <입력.csv> <출력.csv>   # 포트·타입별 보유/필요
  python normalize.py schedule <입력.csv> <출력.csv>   # 모선 기항 순서
  python normalize.py space    <입력.csv> <출력.csv>   # 모선 전체 잔여 스페이스(TEU)

표준 형식
  balance : port,type,onhand,required,net        (net = onhand - required, +Surplus / -Deficit)
  schedule: vessel,voyage,seq,port,etd,cutoff
  space   : vessel,voyage,space                  (모선 전체 잔여 스페이스, 단위 TEU, 소수 허용)

헤더가 알려진 이름과 맞지 않으면 추측하지 않고 오류로 멈춘다.
"""
import csv
import re
import sys

ALIASES = {
    "port": ["port", "포트", "항구", "지역", "디포", "depot", "location"],
    "type": ["type", "타입", "컨테이너타입", "cntr type", "size/type"],
    "size": ["size", "사이즈", "길이", "feet", "length"],
    "onhand": ["onhand", "보유", "보유수량", "재고", "empty", "mty", "stock"],
    "required": ["required", "필요", "필요수량", "부킹", "booking", "demand"],
    "vessel": ["vessel", "모선", "선박", "선박명", "vsl"],
    "voyage": ["voyage", "항차", "voy"],
    "seq": ["seq", "순서", "기항순서", "call seq"],
    "etd": ["etd", "출항", "출항일"],
    "cutoff": ["cutoff", "cut-off", "cut off", "선적마감", "마감"],
    "space": ["space", "스페이스", "잔여스페이스", "잔여", "available", "remaining"],
}
TYPE_RE = re.compile(r"(22|42|45)(GP|RE|UT|PC)")
# 시스템 코드: 22GP=20DC, 42GP=40DC, 45GP=40HC(40'HQ), 22RE/45RE=RF, 22UT/42UT=OT, 22PC/42PC=FR(플랫랙)
TYPE_ALIAS = {"20DC": "22GP", "20GP": "22GP", "40DC": "42GP", "40GP": "42GP",
              "40HC": "45GP", "40HQ": "45GP"}


def canon_type(raw, size=""):
    """20'DC / 40'HQ / 40HC 같은 표기를 시스템 코드(22GP, 45GP 등)로 통일한다. HQ는 HC로 본다."""
    t = re.sub(r"[\s'\"]|FEET|FT", "", raw.upper())
    t = re.sub(r"HQ$", "HC", t)
    if not re.match(r"\d", t):
        digits = re.sub(r"\D", "", size)
        t = digits + t
    return TYPE_ALIAS.get(t, t)
SCHEMAS = {
    "balance": (["port", "type", "onhand", "required"], ["size"]),
    "schedule": (["vessel", "voyage", "seq", "port"], ["etd", "cutoff"]),
    "space": (["vessel", "voyage", "space"], []),
}


def read_rows(path):
    for enc in ("utf-8-sig", "cp949"):
        try:
            with open(path, newline="", encoding=enc) as f:
                return list(csv.reader(f))
        except UnicodeDecodeError:
            continue
    sys.exit(f"인코딩을 읽을 수 없음: {path}")


def map_header(header, need, optional):
    norm = [h.strip().lower() for h in header]
    mapping, missing = {}, []
    for key in need + optional:
        idx = next((i for i, h in enumerate(norm) if h in ALIASES[key]), None)
        if idx is None:
            if key in need:
                missing.append(key)
        else:
            mapping[key] = idx
    if missing:
        sys.exit(f"필수 열을 찾지 못함: {missing}\n입력 헤더: {header}\n→ 열 이름을 사람에게 확인하세요.")
    return mapping


def to_int(v, row_no, col):
    try:
        return int(float(v.strip().replace(",", "")))
    except ValueError:
        sys.exit(f"{row_no}행 '{col}' 값이 숫자가 아님: {v!r}")


def to_num(v, row_no, col):
    try:
        x = float(v.strip().replace(",", ""))
    except ValueError:
        sys.exit(f"{row_no}행 '{col}' 값이 숫자가 아님: {v!r}")
    return int(x) if x == int(x) else x


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    if len(sys.argv) != 4 or sys.argv[1] not in SCHEMAS:
        sys.exit(__doc__)
    kind, src, dst = sys.argv[1:]
    rows = read_rows(src)
    need, optional = SCHEMAS[kind]
    m = map_header(rows[0], need, optional)
    out, warns = [], []
    for n, r in enumerate(rows[1:], start=2):
        if not any(c.strip() for c in r):
            continue
        g = lambda k: r[m[k]].strip() if k in m and m[k] < len(r) else ""
        if kind == "balance":
            t = canon_type(g("type"), g("size"))
            if not TYPE_RE.fullmatch(t):
                warns.append(f"{n}행 표준 외 타입 '{t}' (그대로 사용, TEU 환산을 모르면 계산이 멈춤)")
            on, req = to_int(g("onhand"), n, "onhand"), to_int(g("required"), n, "required")
            out.append([g("port"), t, on, req, on - req])
        elif kind == "schedule":
            out.append([g("vessel"), g("voyage"), to_int(g("seq"), n, "seq"), g("port"), g("etd"), g("cutoff")])
        else:
            out.append([g("vessel"), g("voyage"), to_num(g("space"), n, "space")])
    cols = {
        "balance": ["port", "type", "onhand", "required", "net"],
        "schedule": ["vessel", "voyage", "seq", "port", "etd", "cutoff"],
        "space": ["vessel", "voyage", "space"],
    }[kind]
    with open(dst, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        w.writerows(out)
    print(f"{kind}: {len(out)}행 → {dst}")
    if kind == "balance":
        tot = {}
        for _, t, on, req, net in out:
            a = tot.setdefault(t, [0, 0, 0])
            a[0] += on; a[1] += req; a[2] += net
        for t, (on, req, net) in sorted(tot.items()):
            print(f"  {t}: 보유 {on} / 필요 {req} / net {net:+d}")
    for w_ in warns:
        print("경고:", w_)


if __name__ == "__main__":
    main()

// 회신 초안 문구 틀(승인안 · 거절안). 글만 만든다: 메일을 보내는 기능은 없고, 화면에서는 복사해 Outlook 에 붙여 넣는다.
// 이름은 가린 상태라 선박명 · 부킹번호 · 담당자 서명은 [대괄호] 자리표시로 남긴다. 사람이 원 메일을 보고 채운다.

export const HOLD_MARK = '// 보류, 사용자 추가 확인 요함//';

const LINE = '-------------------------------------------------';
export const SIGNATURE = `Best regards\n[담당자 이름]\n\n${LINE}\n[회사명] Operation Team\n- Tel : [전화번호]\n- E-mail : [이메일]\n${LINE}`;

const dedupe = (a) => [...new Set(a)];

/** 조건부 품목이 붙는 승인안 문장: "UN 1381 is accepted only under the condition below: …" */
function conditionBlock(x) {
  const held = (x.cargos || []).filter((c) => c.status === 'hold' && c.conditionEn);
  if (!held.length) return '';
  const un = dedupe(held.map((c) => c.un)).join(', ');
  const cond = dedupe(held.map((c) => c.conditionEn)).join('\n  ');
  return `\n* UN ${un} is accepted only under the condition below:\n  ${cond}\n`;
}

export function approveText(x) {
  return (
    'Dear partner\n\n' +
    'We would accept your DG application subject to your slot allocation and provided that the DG cargo is properly packed, labeled and documented in accordance with IMO regulations and the laws or regulations in force at the port of shipment, the port of discharge and any scheduled port of call. Please note that it is the box operator\'s responsibility to check and ensure whether the DG cargo obtains all the necessary approvals required by IMO regulations and the above-mentioned laws or regulations prior the DG cargo being loaded on board our vessel, in failing which the box operator shall indemnity and hold the vessel operator harmless in respect of any liability, loss, damage and expenses of whatsoever nature which the vessel operator may sustain by reason of such failure.\n\n' +
    '* Any extra cost may occur when it re-handle at any port because of lack of base cargo or restricted space for DG cargo, it should be under the box operator\'s account.\n' +
    '* All application not followed by our prohibited item list will be cancelled even we accept as below.\n' +
    conditionBlock(x) +
    '\n' +
    SIGNATURE
  );
}

export function rejectText(x) {
  const lines = (x.cargos || []).map((c, i) => {
    const result = c.status === 'hold'
      ? `UN No. ${c.un} can be accepted only ${c.conditionEn || 'under the condition of our Prohibited DG List remark.'} The condition is not confirmed in your application.`
      : c.status === 'ok'
        ? `UN No. ${c.un} is not restricted by our Prohibited DG List, but this application cannot be accepted because of the other cargo.`
        : `UN No. ${c.un} is listed in our Prohibited DG List (${x.listName}).`;
    return `Cargo : ${i + 1}\tUN No : ${c.un || '-'}\tClass : ${c.cls || '-'}\tResult : ${result}`;
  });
  return (
    'Dear partner\n\nWe regret to inform you that your DG application is rejected. Please see details below.\n\n- Reject Remark -\n' +
    lines.join('\n') +
    '\n\n' +
    (x.status === 'hold' ? 'If the condition is met, please re-apply with the confirmation and we will review again.\n\n' : '') +
    'BOOKING REFERENCE NUMBER : [부킹번호 — 원 메일에서 복사]\n' +
    `VESSEL/VOYAGE : [선박명] / ${x.voyage || '[항차]'}  (${x.vessel})\n` +
    `POL/POD : ${x.route}\n\n` +
    SIGNATURE
  );
}

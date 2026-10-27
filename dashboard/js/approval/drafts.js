// 회신 초안 문구 틀(승인 · 거절 · 보완 요청). 글만 만든다: 메일을 보내는 기능은 없고, 화면에서는 복사해 Outlook 에 붙여 넣는다.
// 이름은 가린 상태라 부킹번호 · 선박명 · 담당자 서명은 [대괄호] 자리표시로 남긴다. 사람이 원 메일을 보고 채운다.
// 「직접 확인」(draft: 'none') 건은 초안을 만들지 않는다 — 애매하면 승인 쪽이 아니라 사람 쪽으로 넘긴다.
import { SIGNATURE, HOLD_MARK, approveText as dgApproveText } from '../dgdesk/drafts.js';

export { HOLD_MARK };

const REF = (x) =>
  'BOOKING REFERENCE NUMBER : [부킹번호 — 원 메일에서 복사]\n' +
  `VESSEL/VOYAGE : [선박명] / ${x.voyage || '[항차]'}  (${x.vessel})\n` +
  `POL/POD : ${x.route}\n`;

/** 승인 초안: DG 는 공유본 승인안 문구를 그대로 쓴다(이병선 DG 승인 데스크와 같은 문장) */
export function approveText(x) {
  if (x.type === 'DG') return dgApproveText(x);
  const what = x.type === 'OOG' ? 'OOG' : 'Flexibag';
  const cond = x.type === 'OOG'
    ? 'provided that the cargo is lashed and secured as per the lashing plan and the dimensions and weight are as declared in your application.'
    : 'provided that the Flexibag is filled within the declared weight and handled in accordance with the COA certificate.';
  return (
    'Dear partner\n\n' +
    `We would accept your ${what} application subject to your slot allocation, ${cond}\n\n` +
    '* Any extra cost may occur when it re-handle at any port because of the cargo condition or restricted space, it should be under the box operator\'s account.\n' +
    '* If the actual cargo differs from the documents submitted, the acceptance will be cancelled.\n\n' +
    REF(x) + '\n' +
    SIGNATURE
  );
}

/** 거절 초안: 규정 위반 근거(영문)만 적는다 */
export function rejectText(x) {
  const why = x.findings.filter((f) => f.kind === 'violation').map((f, i) => `${i + 1}) ${f.en || f.ko}`);
  return (
    'Dear partner\n\n' +
    `We regret to inform you that your ${x.type === 'FLEXIBAG' ? 'Flexibag' : x.type} application is rejected. Please see details below.\n\n` +
    '- Reject Remark -\n' +
    (why.length ? why.join('\n') : '[거절 사유를 적어 주세요]') +
    '\n\n' +
    REF(x) + '\n' +
    SIGNATURE
  );
}

/** 보완 요청 초안: 빠진 서류와 서로 다른 값을 적고 다시 보내 달라고 한다(승인도 거절도 아님) */
export function supplementText(x) {
  const lines = x.findings.filter((f) => f.kind === 'missing' || f.kind === 'conflict').map((f) => `- ${f.en || f.ko}`);
  return (
    'Dear partner\n\n' +
    'Thank you for your application. We are not able to proceed yet because of the following. Please send the missing or corrected documents and we will review again.\n\n' +
    lines.join('\n') +
    '\n\n' +
    REF(x) + '\n' +
    SIGNATURE
  );
}

export const DRAFT_LABEL = {
  approve: '승인 초안',
  reject: '거절 초안',
  supplement: '보완 요청 초안',
  none: '초안 없음 — 직접 확인',
};

/** 이 건에서 보여 줄 초안 탭 [키, 이름] 목록. 직접 확인(none)이면 빈 목록 */
export function draftTabs(x) {
  if (x.draft === 'approve') return [['approve', '승인 회신']];
  if (x.draft === 'reject') return [['reject', '거절 회신']];
  if (x.draft === 'supplement') return [['supplement', '보완 요청']];
  return [];
}

export const draftText = { approve: approveText, reject: rejectText, supplement: supplementText };

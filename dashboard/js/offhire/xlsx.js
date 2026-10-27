// 엑셀 읽기(SheetJS)를 이 메뉴가 열릴 때만 불러온다. 엑셀 내용은 브라우저 안에서만 읽고 어디로도 보내지 않는다.
const URL_XLSX = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let loading;

export function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = URL_XLSX;
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => {
      loading = null;
      reject(new Error('엑셀 읽기 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'));
    };
    document.head.append(s);
  });
  return loading;
}

// 첫 시트를 배열의 배열로 읽는다(날짜 칸은 Date 로, 빈 칸은 '').
export async function readFirstSheet(buf) {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
}

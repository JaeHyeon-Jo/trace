# Trace — 지나간 시간 기록 ⏳

[한국어](#한국어) · [English](#english)

---

## 한국어

마지막으로 한 일의 날짜를 기록하고, **얼마나 지났는지 / 다음 주기까지 며칠 남았는지** 를 한 눈에 확인하는 가벼운 트래커.

**🌐 데모:** https://jaehyeon-jo.github.io/trace/

### 주요 기능

- 📅 일과 날짜로 기록 추가, 선택적으로 이상적인 반복 주기 (일/주/월) 설정
- ⏱ 경과 일수 (D+) 와 다음 주기까지 남은 일수 표시
- 📊 주기 초과 시 빨간 경고, 진행도 그라데이션 배경
- 🔄 정렬: 지난일 / 남은일자 기준, 오름/내림차순
- 📈 항목별 기록 간격 히스토리 그래프 (Chart.js)
- 💾 **JSON 백업 / 복원** — 도움말 모달에서 내보내기·가져오기
- 📱 **PWA 지원** — 홈 화면에 설치, 오프라인 동작

### 데이터 저장

브라우저의 **localStorage** 에만 저장됩니다. 서버나 클라우드로 전송하는 일이 전혀 없습니다.

- 장점: 즉시 동작, 외부 의존성 없음, 개인정보 외부 유출 0
- 약점: 브라우저 데이터 삭제 시 사라짐 / 기기 간 자동 동기화 없음
- 대응: **도움말 → 백업/복원** 에서 JSON 으로 내보내기. 다른 기기에서 가져오기로 복원

### 로컬 실행

```bash
python3 -m http.server 8000
# http://localhost:8000 접속
```

> Service Worker 가 동작하려면 `file://` 가 아닌 HTTP 서버를 통해 열어야 합니다.

### 기술

- 빌드 도구 없는 단일 HTML 파일
- Vanilla JavaScript
- [Chart.js 3.9.1](https://www.chartjs.org/) (CDN)

### 라이선스

[MIT](LICENSE)

---

## English

A lightweight tracker for recording **when you last did something** and seeing how long it has been — or how many days are left until the next ideal cycle.

**🌐 Demo:** https://jaehyeon-jo.github.io/trace/

### Features

- 📅 Log activities with name + date, with optional ideal cycle (day / week / month)
- ⏱ Shows elapsed days (D+) and days remaining until next cycle
- 📊 Red warning when overdue, progress gradient background
- 🔄 Sort by elapsed or remaining days, asc / desc
- 📈 Per-item interval history chart (Chart.js)
- 💾 **JSON backup / restore** via the help modal
- 📱 **PWA** — installable, offline-capable

### Data storage

All data lives in the browser's **localStorage**. Nothing is sent to any server.

- Pros: instant, zero external dependency, your data never leaves the device
- Cons: cleared if you wipe browser data; no automatic sync across devices
- Workaround: use **Help → Backup / Restore** to export JSON and re-import on another device

### Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

> The Service Worker requires HTTP (not `file://`).

### Tech

- Single HTML file, no build step
- Vanilla JavaScript
- [Chart.js 3.9.1](https://www.chartjs.org/) via CDN

### License

[MIT](LICENSE)

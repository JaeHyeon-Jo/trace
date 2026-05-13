# D+Day — 지나간 시간 기록 ⏳

[한국어](#한국어) · [English](#english)

---

## 한국어

마지막으로 한 일의 날짜를 기록하고, **며칠 지났는지 / 다음 주기까지 며칠 남았는지** 를 한 눈에 확인하는 가벼운 트래커. 디데이(D-Day)가 미래까지 남은 일수라면, D+Day는 그 반대 — 지나간 일수를 셉니다.

**🌐 데모:** https://d-plus-day.web.app

### 주요 기능

- 📅 일과 날짜로 기록 추가, 선택적으로 이상적인 반복 주기 (일/주/월) 설정
- ⏱ 경과 일수 (D+) 와 다음 주기까지 남은 일수 표시
- 📊 주기 초과 시 빨간 경고, 진행도 그라데이션 배경
- 🔄 정렬: 지난일 / 남은일자 기준, 오름/내림차순
- 📈 항목별 기록 간격 히스토리 그래프 (Chart.js)
- ☁️ **기기간 자동 동기화** (Firebase, Google 로그인)
- 💾 **JSON 백업 / 복원** — 도움말 모달에서 내보내기·가져오기
- 📱 **PWA 지원** — 홈 화면에 설치, 오프라인 동작

### 데이터 저장

기본은 브라우저의 **localStorage** — 즉시 동작, 외부 의존성 없음. Google 로그인 시 **Firebase Firestore** 로 자동 백업 및 다중 기기 동기화. 비로그인 상태에서도 모든 기능은 정상 동작합니다.

### 기기간 동기화 설정 (호스팅하는 사람용)

동기화 기능은 옵션이며, Firebase 프로젝트를 직접 연결해야 활성화됩니다. 설정 안 해도 앱은 정상 동작 (localStorage 전용).

1. **Firebase 프로젝트 생성**
   - https://console.firebase.google.com 에서 프로젝트 만들기

2. **Authentication 활성화**
   - Authentication → Sign-in method → **Google** provider 활성화
   - Authentication → Settings → Authorized domains 에 배포 도메인 추가 (예: `jaehyeon-jo.github.io`, `localhost`)

3. **Firestore Database 생성**
   - Build → Firestore Database → Create database → **Production mode**
   - 위치는 가까운 지역 (asia-northeast3 = 서울) 권장

4. **Firestore 보안 규칙 적용**
   - Firestore → Rules 탭에서 [firestore.rules](firestore.rules) 의 내용을 붙여넣고 Publish

5. **Web 앱 등록 → 설정 복사**
   - Project settings → Your apps → Web (`</>`) 아이콘으로 앱 추가
   - 표시되는 `firebaseConfig` 객체를 복사
   - [firebase-config.example.js](firebase-config.example.js) 를 `firebase-config.js` 로 복사 후 값 교체
   - `firebase-config.js` 는 `.gitignore` 에 포함됨 (각 배포 환경마다 별도 설정)

6. **배포 후 로그인**
   - 좌상단 🔐 로그인 버튼 → Google 계정 선택
   - ✅ 표시되면 동기화 활성화됨

#### 충돌 해결

같은 항목을 여러 기기에서 동시에 수정하면 **last-write-wins** — 가장 최근 `updatedAt` 이 이깁니다. 일반적인 사용 패턴 (한 사람이 여러 기기에서 사용) 에서는 거의 충돌이 발생하지 않습니다.

#### 삭제 방식

삭제된 항목은 즉시 사라지지 않고 `deletedAt` tombstone 으로 표시되어 다른 기기에도 삭제가 전파됩니다. UI 에는 노출되지 않습니다.

### 로컬 실행

```bash
python3 -m http.server 8000
# http://localhost:8000 접속
```

> Service Worker 와 ES module import 가 동작하려면 `file://` 가 아닌 HTTP 서버를 통해 열어야 합니다.

### 배포 (Firebase Hosting)

GitHub Pages 대신 **Firebase Hosting** 을 사용합니다. 이유:
- 호스팅 도메인 (`*.web.app`) 과 Firebase Auth 도메인 (`*.firebaseapp.com`) 이 같은 `firebaseapp.com` 컨텍스트라서 **Safari/iOS 의 ITP 차단을 우회**할 수 있음 (GitHub Pages 는 third-party 로 잡혀서 사파리에서 로그인 실패)
- HTTPS 자동, 글로벌 CDN, 무료 한도 넉넉

**첫 셋업 (1 회):**

```bash
# 1) Firebase CLI 설치 (Node 필요)
npm install -g firebase-tools
# 또는 (Mac)
brew install firebase-cli

# 2) 로그인
firebase login

# 3) 배포
firebase deploy --only hosting
```

설정 파일 ([firebase.json](firebase.json), [.firebaserc](.firebaserc)) 은 이미 리포에 포함되어 있어 `firebase init` 을 새로 실행할 필요 없습니다.

**배포 후:**
- 사이트는 `https://d-plus-day.web.app` 와 `https://d-plus-day.firebaseapp.com` 양쪽에서 접근 가능
- 두 도메인은 Firebase 가 자동으로 Authorized domains 에 등록 → 별도 추가 불필요
- 이후 변경 시 `firebase deploy --only hosting` 한 줄로 재배포

### 기술

- 빌드 도구 없는 정적 파일 (index.html + sync.js + service-worker.js)
- Vanilla JavaScript + ES Modules (`<script type="module">`)
- [Chart.js 3.9.1](https://www.chartjs.org/) (CDN)
- [Firebase 10.x](https://firebase.google.com/) Auth + Firestore (ES module CDN, 옵션)

### 라이선스

[MIT](LICENSE)

---

## English

A lightweight tracker for recording **when you last did something** and seeing how long it has been — or how many days remain until the next ideal cycle. While D-Day counts down to a future date, D+Day counts the days that have already passed.

**🌐 Demo:** https://d-plus-day.web.app

### Features

- 📅 Log activities with name + date, with optional ideal cycle (day / week / month)
- ⏱ Shows elapsed days (D+) and days remaining until next cycle
- 📊 Red warning when overdue, progress gradient background
- 🔄 Sort by elapsed or remaining days, asc / desc
- 📈 Per-item interval history chart (Chart.js)
- ☁️ **Automatic cross-device sync** (Firebase, sign in with Google)
- 💾 **JSON backup / restore** via the help modal
- 📱 **PWA** — installable, offline-capable

### Data storage

Defaults to browser **localStorage** — instant, no dependencies. Sign in with Google to also back up to **Firebase Firestore** and sync across devices. Everything works without sign-in.

### Cross-device sync setup (for the person hosting)

Sync is optional. The app runs fine in localStorage-only mode if you skip this.

1. Create a Firebase project at https://console.firebase.google.com
2. **Authentication** → enable **Google** provider, add your domain to Authorized domains (e.g. `jaehyeon-jo.github.io`, `localhost`)
3. **Firestore Database** → create in production mode
4. Paste the contents of [firestore.rules](firestore.rules) into the Rules tab and publish
5. Project settings → register a Web app → copy the `firebaseConfig` → save it as `firebase-config.js` (template at [firebase-config.example.js](firebase-config.example.js); already gitignored)
6. Open the app, click 🔐 in the top-left, sign in with Google

#### Conflict resolution

Last-write-wins per activity, compared by `updatedAt`. Realistic single-user multi-device patterns rarely conflict.

#### Deletion

Deletes are tombstoned with `deletedAt` so the deletion propagates instead of being resurrected by another device.

### Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

> Service Worker and ES module imports require HTTP (not `file://`).

### Deploy (Firebase Hosting)

We use **Firebase Hosting** instead of GitHub Pages so that the hosting origin (`*.web.app`) shares the `firebaseapp.com` context as the Firebase Auth domain — this avoids Safari/iOS ITP blocking sign-in (GitHub Pages is treated as third-party).

```bash
npm install -g firebase-tools   # or: brew install firebase-cli
firebase login
firebase deploy --only hosting
```

The hosting config ([firebase.json](firebase.json), [.firebaserc](.firebaserc)) is already committed — no `firebase init` needed.

After deploy the site is live at `https://d-plus-day.web.app` and `https://d-plus-day.firebaseapp.com`. Both domains are auto-added to Authorized domains.

### Tech

- Static files, no build step (index.html + sync.js + service-worker.js)
- Vanilla JavaScript + ES modules
- [Chart.js 3.9.1](https://www.chartjs.org/) via CDN
- [Firebase 10.x](https://firebase.google.com/) Auth + Firestore (optional, ES module CDN)

### License

[MIT](LICENSE)

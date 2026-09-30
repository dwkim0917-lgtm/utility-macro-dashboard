# 아침 텔레그램 브리핑

매일 08:30 Asia/Seoul, 주말 포함. Codex 스레드 heartbeat가 실행한다. 로컬 PC와 Codex 앱이 실행 가능하고 인터넷에 연결돼 있어야 한다. 꺼진 PC에서 정시 발송을 보장하지 않는다.

- 원천 갱신: 기존 Windows 08:05 공개 수집. 통합 Codex 예약은 08:30에 브리핑을 먼저 보내고 보완 수집을 진행한다. 당일 기록이 없으면 예약 실행에서 collector.mjs를 먼저 실행한다. 실패한 원천은 최신값으로 가장하지 않는다.
- 생성: `node morning-brief.mjs` (미리보기만, 발송 안 함).
- 발송: `node morning-brief.mjs --send`. 검증된 기존 DW_RESEARCH_BOT·개인 수신자만 사용한다. data/telegram-config.json에는 기존 전달 스크립트 경로만 있으며 비밀값이 없다. config.powershell의 검증된 PowerShell 7을 사용한다. Windows PowerShell 5는 상속 모듈 경로 때문에 암호화 명령을 찾지 못할 수 있다. 기존 Windows DPAPI 파일을 재사용하고 토큰을 복사하지 않는다.
- 주요 8개: JKM선물, Newcastle, 원/달러, 한국3년, KAU26, REC + 신규/수정·중요도·일간 가산점으로 2개. 전체 27개를 점검하고 미수집·오래된 자료를 별도 표시한다. 가격 변화 %와 금리 차 %p를 구분. 일간 계열 7일 변화는 실제 과거 관측점(목표일 전 최대4일 허용) 대비, 영업일5개와 다르다.
- 초기 알림은 최신 스냅샷이며 당일 변화라고 표현하지 않는다. 이후 신규 표시는 마지막 성공 발송의 날짜·값·원천과 비교한다. 동일 날짜 수정값도 구분한다. 종목 실적 설명은 조건부 경로이며 주가 예측이나 고정 레깅 결론이 아니다.
- data/morning-brief.txt와 .json에서 미리보기 확인. 최대3950자로 Telegram 한 건 발송.
- data/telegram-state.json에 날짜별 sending/sent/needs-review, message_id, 직전 성공 snapshot을 기록한다. 파일 잠금 및 기존 전달 스크립트의 콘텐츠 해시 기록으로 중복을 방지한다. 네트워크 단절·실패·프로세스 종료는 결과 불확실할 수 있어 자동 재전송 금지. 운영자가 Telegram 실제 대화와 기존 ledger를 확인한 후에만 해당 날짜 상태를 복구한다. 잠금 삭제도 실행 프로세스가 없는지 먼저 확인한다.
- 스탁이지 https://stockeasy.intellio.kr/ 는 참고 링크. 공개 소개와 홈페이지 확인만 수행했다. 검증된 수치 API 또는 이용 가능한 내보내기 연결 없이 자동 데이터 원천으로 표기하지 않는다.
- 테스트: `node --test tests/*.test.mjs`. 전송을 포함하는 실환경 검증은 승인된 개인 대화에 최초 브리핑 한 건 발송해 message_id를 확인한다.

2026-09-18 실전 최초 브리핑 발송 성공: message_id=3503. 초기 PowerShell 5 명령 탐색 실패는 API 호출 이전임과 ledger/pending 부재를 확인 후 복구했다.

2026-09-21: 조기 heartbeat 실행에 대비해 morning-brief --send는 한국시간 08:30 이전 발송을 거부한다. 조기 실행이면 node queue-morning-once.mjs를 숨김 단일 프로세스로 실행할 수 있다. 날짜별 telegram-queue-YYYY-MM-DD.json에서 대기 PID·예정시각·성공 message_id를 확인한다. 반복 예약이 아닌 당일 1회 대기이며, 잠금/대기 기록의 자동 삭제·중복 실행은 하지 않는다.


# 유틸리티 매크로 대시보드

로컬 주소: http://127.0.0.1:8765/

`대시보드 열기.cmd`를 실행하면 대시보드를 엽니다.

- [최신 데이터 현황](LATEST_STATUS.md): 지표별 최신 관측일·값·확보 범위와 미연결 항목
- [운영 및 원천 안내](OPERATIONS.md): BigFinance 기관 로그인, 공개 원천, 수집·검증·분석 절차
- [텔레그램 운영](TELEGRAM.md): 매일 08:30 알림, 중복 방지, 실패 복구
- [실적·주가 연관성 보고서](RELATIONSHIP_REVIEW.md): 종목별 근거 및 시차 비교

## 폴더 안내

|위치|내용|
|---|---|
|`dist/`|차트·종목별 영향·민감도·시차 분석 화면|
|`data/observations.json`|원출처와 관측일을 보존한 전체 데이터|
|`data/monitor-status.json`|현재 원천 확인·오류·로그인·발송 상태|
|`data/bigfinance-verified-2026-09-21.json`|기관 차트 최근 2개월 검증 입력 10건|
|`data/relationship-analysis.json`|완료 월 기준 주가 시차 분석|
|`data/relationship-summary.csv`|기간·종목·지표별 비교 요약|
|`data/relationship-tests.csv`|전체 시차 계산 결과|
|`data/impact-evidence.json`|실적 영향의 근거 및 수치 사례|
|`data/telegram-brief-날짜.txt`|날짜별 발송 본문|
|`logs/`|수집·분석·알림 실행 기록|
|`tests/`|파서·계산·알림 검증|
|`_backup_260921/`|기존 백업. 운영 파일과 별도 보존|

## 실행 명령

```powershell
node collector.mjs
node refresh-analysis.mjs
node morning-brief.mjs
```

마지막 명령은 미리보기만 만듭니다. `--send`를 붙이면 실제 Telegram 전송을 시도하므로 운영 지침과 당일 전송 기록을 먼저 확인합니다.

`catalog.mjs`는 지표 정의, `macro-impacts.mjs`는 조건부 방향성, `sensitivity-data.mjs`는 수동 검증 정량 민감도입니다. 가격 갱신이 기업 공시·민감도 근거까지 자동 검증하는 것은 아닙니다. 원문 확인 없이 민감도를 바꾸지 않습니다.

관측일은 오늘 날짜로 덮어쓰지 않습니다. 미수집값은 0이나 추정치로 채우지 않습니다. 기존 탐색·수집 보조 스크립트와 백업은 유지합니다.

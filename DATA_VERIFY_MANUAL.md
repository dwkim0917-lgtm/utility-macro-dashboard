# 데이터 최신화·교차검증 매뉴얼 (루프 1회 = 아래 0~8단계)

작성 2026-10-10. 목적: 대시보드 전 지표가 **원천의 최신 관측값**을 **거래일·발표월 날짜 그대로** 보여주는지 매회 확인하고, 독립 출처와 대조해 오류를 고친다.

## 0. 시작 전 점검
- `git pull --rebase origin main`. 같은 저장소에서 다른 세션이 동시에 커밋한다. 데이터는 반드시 `store.mjs`의 `mutate`(쓰기 잠금) 또는 `import-observations.mjs`로만 쓴다.
- `data/write.lock`이 있고 `node collector.mjs` 프로세스가 돌고 있으면 끝날 때까지 기다린다. 프로세스가 없는데 잠금만 남았으면 제거.

## 1. 공개 원천 수집
- `node collector.mjs` → 마지막 run의 실패 작업 확인. 실패 시 기존값 유지, 보간 금지.

## 2. 자동 점검
- `node verify-latest.mjs` → 지표별 최신일·값·지연(STALE)·미래날짜(FUTURE)·교차(X✓/X✗) 출력, `data/verify-latest.json` 저장.
- X✗: 같은 날짜 값이 허용오차 초과. 원인을 3단계 출처로 판정 후 정정.
- FUTURE: 수집일을 날짜로 쓴 버그 의심(2026-10-10 12개월물 사례). 거래소 현지 거래일(`timestamp+gmtoffset`)로 고친다.

## 3. Investing.com 4계열 (클라우드·서버 fetch 차단 → 앱 브라우저 패널로 판독)
| id | 페이지 | source 라벨 | 2차 대조 |
|---|---|---|---|
| jkm_futures | kr.investing.com/commodities/lng-japan-korea-marker-platts-futures-historical-data | `Investing.com · JKMc1 종가` | Yahoo `JKM=F` (값 동일) |
| ttf | kr.investing.com/commodities/ice-dutch-ttf-gas-c1-futures-historical-data | `Investing.com · TFMBMc1 종가` | Yahoo `TTF=F` |
| coal | za.investing.com/commodities/newcastle-coal-futures-historical-data | `Investing.com · NCFMc1 종가` | barchart.com/futures/quotes/LQ*0 (ICE 정산가) |
| kr3y | kr.investing.com/rates-bonds/south-korea-3-year-bond-yield-historical-data | `Investing.com · 한국 3년 국채 종가` | 금융투자협회 최종호가 보도치(0.2~2bp 차이는 기준 차이) |
- 표의 `날짜 | 종가`만 읽는다. **당일 미확정(장중) 값 금지**, 이미 저장된 최근 3거래일도 다시 읽어 장중값이 저장됐으면 종가로 정정(10/5 TTF 74.19→73.513, 석탄 150.1→150.00 사례).
- 일요일 TTF 행은 거래일 정의 확인 전 제외. 한국 공휴일(10/3·10/9 등) 국고채 행 없음이 정상.
- 저장: `data/manual-verified-YYYY-MM-DD.json`(배열: id,date,value,source,url) → `node import-observations.mjs <파일>`.

## 4. BigFinance(epic Finance) 5계열 — 월간, 로그인 필요
- **비밀번호를 입력·저장·복사하지 않는다.** 사용자가 앱 브라우저 패널에서 *기업 사용자*로 직접 로그인. env 파일 등 저장된 자격증명은 쓰지 않는다.
- 로그인 판정: 패널 페이지에서 `fetch('/api/user/me')` 200 = 유효, 204 = 무효(헤더의 '로그아웃' 표시는 믿지 않음). 동일 계정이 다른 곳(다른 세션·Codex·Chrome)에서 로그인하면 끊긴다.
- 무효면 데이터 손대지 말고 "재로그인 필요"만 기록.
| id | URL(industry?type=categories&…) | 툴팁 계열 |
|---|---|---|
| purchase | code=6&subCode=12&dataCode=1 | 합계 |
| tariff | code=6&subCode=8&dataCode=1 | 전력 판매 단가 계 |
| consumption | code=6&subCode=6&dataCode=1 | 전력 판매량 계(MWh ÷1000 → GWh) |
| gas_sales | code=6&subCode=22&dataCode=1 | 총계(천톤) |
| dubai | code=19&subCode=100&dataCode=2 | 국제유가(두바이) |
- 판독: `g.highcharts-series-0 .highcharts-point` 마지막 4개에 mouseover/mousemove 후 `.highcharts-tooltip` 텍스트(예 `2026.07.01합계143.09YoY5.99`). 새 월이 있으면 import, 기존 2개월은 값 동일 확인. 기록 `data/bigfinance-verified-YYYY-MM-DD.json`, `data/monitor-status.json` note 갱신.
- 원천 발표 시차: 한전 전력통계속보 약 2개월, 가스공사·두바이 약 1~1.5개월. 원천에 새 월이 없으면 지연이 정상.

## 5. 1차 원천 표본 확인 (주 1회 이상)
- SMP: new.kpx.or.kr 월별/일별 vs `smp`, `smp_daily`.
- WCI: Drewry 원문 최신 평가일·값 vs `wci`.
- SCFI: opencontainer 재게시 지연 확인(중국 연휴 후 재개).
- 원/달러: FRED(주 1회 발표, 1주 지연 정상) ↔ Investing USD/KRW 종가. **Yahoo `KRW=X`는 일봉 날짜가 하루 어긋나 대조에 쓰지 않음.**
- FRED Brent 현물(DCOILBRENTEU)은 선물 대비 괴리가 클 수 있음(2026-10-02 135.5 vs 선물 102). 값은 FRED와 일치하면 유지, 판단은 `brent_b1` 선물 사용.

## 6. 테스트·배포
- `npm test` 전부 통과 → `git add -A data <수정 코드>` → 커밋 → `git pull --rebase -X theirs origin main` → `git push`.
- Actions `daily.yml` 성공 확인 후 공개 `api/data.json`에서 갱신 계열의 최신일·값 재확인.

## 7. 연동 산출물
- BigFinance 새 월(한전 8·9월 등)이 들어오면 `../전력가스/3Q26_프리뷰_전력가스_초안_20261010.md` 2장 매크로 표와 엑셀 `3Q 매크로` 시트 갱신.

## 8. 기록
- `OPERATIONS.md` 하단에 날짜별 한 줄: 반영 행 수, 정정 내역, 실패·대기 원천.

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

## 2-1. 데이터 감사 (2026-10-13~, Actions에서도 매 평일 실행)
- `node audit-data.mjs` → `DATA_AUDIT.md`(전 지표 표) + `data/audit-latest.json`(카드의 ‘검증 ✓/△/✗’ 표시).
- 점검: 주기별 날짜 규칙(월간=1일, 시장 계열 주말 금지, 미래·중복 금지, 장중 미확정 금지) · 화면 표시값=저장 최신값 · 깨진 출처 · 지연 · 되돌림 스파이크 · 2차 출처(Yahoo 같은 날짜, FRED·IMF 같은 월) · 파생 재계산.
- ✗ 오류가 나오면 그날 루프에서 원인 확인 후 수정. 일괄 보정은 `node repair-data.mjs`(Yahoo 확정 종가 재수집·주말 행 제거·깨진 출처 정리, 재실행 안전, 로그 `data/repair-log-<날짜>.json`).
- 현물↔선물(FRED Brent·WTI 현물 vs 최근월 선물) 괴리는 정의 차이라 △로 표시. 판단은 선물 계열 사용.

## 2-2. 공식 원천 우선순위 (2026-10-14~)
| 지표 | 1순위(자동) | 과거·보조 | 비고 |
|---|---|---|---|
| WTI·Brent·Henry Hub·구리·FEI·CPO 선물 | Yahoo 확정 일봉 | **CME 확정 정산가로 매일 감사(허용 0.1%)** | CME는 최근 5거래일만 제공 |
| JKM·TTF 선물 | **CME 확정 정산가(자동 수집)** | Investing(과거 이력) | 수기 입력 불필요. 장중 수기값이 남지 않게 함 |
| 국고채 3년·회사채 AA− 3년 | **한국은행 ECOS(금투협 최종호가)** | Investing(2010년 이전) | 2010년~ 적재 완료 |
| 원/달러 | **한국은행 ECOS 매매기준율(서울)** | FRED 뉴욕 정오(2010년 이전) | 이전 FRED 기준과 일 최대 약 1.5% 차이 |
| 한전 판매단가·구입단가·판매량 | BigFinance(한전 전력통계속보, 로그인) | — | 자동 대안은 전력데이터개방포털·공공데이터포털 API 키 발급 필요 |
- ECOS 키: 공개 sample 키(요청당 10행)로 동작. `ECOS_API_KEY` 환경변수가 있으면 큰 창으로 조회.
- 출처 우선순위 규칙은 `store.seriesRows` 하나로 화면·민감도·파생·한전 E·주가 시차가 공유.

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
- 원전 이용률: `nuclear`는 한수원 **연간 확정치**(연말 날짜, 최신 점=직전 연도 평균)라 최근값이 아니다. 최근 상황은 `nuclear_live`(한수원 메인 운영현황, 발전량÷설비용량, 수집 시점 스냅숏)와 `nuclear_units`(운전 호기 수)로 본다. 2026-10-12부터 누적, 과거 소급 불가.
- FRED Brent 현물(DCOILBRENTEU)은 선물 대비 괴리가 클 수 있음(2026-10-02 135.5 vs 선물 102). 값은 FRED와 일치하면 유지, 판단은 `brent_b1` 선물 사용.

## 5-1. 2026-10-13 추가 계열 점검 (평일 루프에 포함)
| 계열 | 원천(자동) | 점검 |
|---|---|---|
| fuel_lng·fuel_coal·fuel_nuc·lng_heat | KPX EPSIS 연료비용(월, 2001~) | 매월 초 전월치 반영 여부. EPSIS 화면 연료비단가 표와 1개월 대조 |
| settle_nuc·settle_coal·settle_lng | KPX EPSIS 정산단가(월, 2002~) | 약 1.5개월 지연 정상 |
| spark_spread·dark_spread | 자체 산출(SMP − 연료비단가) | SMP·연료비단가 같은 월만 계산. 음(−)이면 민감도 화면 경고 |
| copper(HG=F)·iron_ore(TIO=F) | Yahoo 일간 | Investing 구리·철광석 종가 주 1회 대조 |
| nickel·uranium·jlng·jgb10y·us_retail·us_gen·usdjpy | FRED | 월간은 2~3개월 지연 정상 |
| jepx | JEPX 스팟 CSV(30분→일평균) | 익일 인도분이 오늘 날짜로 들어올 수 있음(전일 경매 확정치) |
| pjm_west·pjm_spark | EIA 도매전력(ICE, 약 2주 지연) | 연초 EIA 연도 파일명이 바뀌면 수집 오류 → `global-source.mjs`의 파일명 확인 |
| pjm_cap | PJM BRA 수기 표 | 새 경매 결과 발표 시 `pjmCapacityRows()`에 1행 추가(발표월 날짜) |
| 해외 주가 18종목 | Yahoo(현지 거래일) → `stock-prices-global.json` | 시장지수(1306.T·^GSPC) 누락 시 기존 파일 유지 |
- 해외 주가 시차는 `analyze-links.py global` → `relationship-analysis-global.json`(TOPIX ETF·S&P500 통제). `refresh-analysis.mjs`가 국내·해외를 함께 갱신.
- 민감도·주가 시차 화면 상단 ‘오늘 확인할 것’: 갱신 시각이 30시간을 넘으면 빨간 ‘갱신 지연’. 이 경우 Actions 로그부터 확인.
- 과거 이력 재적재: `node backfill-global.mjs`(Yahoo 2010~, JEPX 2016~, EIA 2017~; 재실행 안전).

## 6. 테스트·배포
- `npm test` 전부 통과 → `git add -A data <수정 코드>` → 커밋 → `git pull --rebase -X theirs origin main` → `git push`.
- Actions `daily.yml` 성공 확인 후 공개 `api/data.json`에서 갱신 계열의 최신일·값 재확인.

## 7. 연동 산출물
- BigFinance 새 월(한전 8·9월 등)이 들어오면 `../전력가스/3Q26_프리뷰_전력가스_초안_20261010.md` 2장 매크로 표와 엑셀 `3Q 매크로` 시트 갱신.

## 8. 기록
- `OPERATIONS.md` 하단에 날짜별 한 줄: 반영 행 수, 정정 내역, 실패·대기 원천.

# 人類圖排盤

網頁版排盤工具：輸入出生日期、時間與地點，計算個性與設計兩組共 26 個星體啟動，推導類型、內在權威、人生角色、定義型態與輪迴交叉，並以自行繪製的 SVG 人體圖呈現。介面為繁體中文。

Next.js 16（App Router, Cache Components）+ TypeScript strict + Tailwind CSS v4。星曆計算在伺服器端以 Swiss Ephemeris（`sweph`，Moshier 模式）執行。

## 開發環境

需要 Node.js 20 以上（Docker 映像使用 Node 22 LTS）。`sweph` 是原生模組：常見平台有預編譯檔，否則安裝時會以 node-gyp 編譯，需要 `python3`、`make`、`g++`（macOS 為 Xcode Command Line Tools）。

```bash
npm install
npx tsx scripts/build-places.ts   # 產生 src/data/places.zh-TW.json（下載 GeoNames，需 curl 與 unzip）
npm run dev                       # http://localhost:3000
```

## 指令

| 指令                              | 用途                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run dev`                     | 開發伺服器                                                                               |
| `npm run build` / `npm start`     | 正式建置／啟動                                                                           |
| `npm test`                        | vitest 單元測試（`tests/`）                                                              |
| `npm run typecheck`               | `tsc --noEmit`                                                                           |
| `npm run lint`                    | ESLint                                                                                   |
| `npx tsx scripts/build-places.ts` | 從 GeoNames（cities15000 + alternateNamesV2）重建地名索引，下載快取在 `.cache/geonames/` |

## 結構

- `src/lib/hd/` — 純計算層（不依賴 React / Next / I/O），對外入口 `computeChart()`。
- `src/app/api/chart` — `POST /api/chart`；`src/app/api/places` — `GET /api/places?q=`。
- `src/components/BodyGraph/` — 人體圖 SVG；所有座標在 `layout.ts`。
- `src/app/page.tsx`（輸入頁）、`src/app/chart/page.tsx`（結果頁）。結果以 `sessionStorage` 傳遞，不放在網址。
- `src/lib/supabase/`（Supabase client、proxy、`Database` 型別）、`src/lib/auth/`、`src/lib/charts/`（資料列 ↔ 型別對應，純函式並有測試）、`supabase/migrations/`。

## 會員功能（Supabase）

登入後可把命盤存到帳號：「我的」（自己的，可多筆）與「好友」（自行輸入朋友的出生資料，朋友不需要帳號）。不登入時排盤功能與以前完全相同。

- 前端直接以 publishable key 連線 Supabase；資料表 `public.charts` 以 RLS 限制只能存取本人的資料（anon 無任何權限）。不使用 service-role key。
- `src/proxy.ts`（Next 16 的 middleware）負責更新 session cookie，並把未登入的 `/charts` 請求導向 `/login?next=…`。
- 頁面：`/login`（登入／註冊／忘記密碼）、`/auth/callback`（PKCE code 交換）、`/auth/error`、`/reset-password`、`/charts`、`/charts/new`；結果頁有「儲存到帳號」。目前以電子郵件註冊；Google 尚未啟用時，登入頁不顯示 Google 按鈕。

### 環境變數（`.env.local`）

| 變數                                   | 說明                                                              |
| -------------------------------------- | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | `https://<project-ref>.supabase.co`                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys 的 publishable key（或舊版 anon key） |
| `NEXT_PUBLIC_SITE_URL`                 | 網站網址，用於驗證信與 OAuth 的回跳，例如 `http://localhost:3000` |

`NEXT_PUBLIC_*` 會在 **建置時** 寫進前端程式；Docker 建置時也要提供（例如 `--build-arg` 或建置前放好 `.env.local`）。缺少前兩個變數時，會員功能自動隱藏，排盤照常運作。

### 建立資料表

在 Supabase Dashboard → **SQL Editor** 貼上並執行 `supabase/migrations/20261102000000_charts.sql`（或使用 Supabase CLI：`supabase link` 後 `supabase db push`）。腳本可重複執行。

### URL Configuration

Supabase Dashboard → **Authentication → URL Configuration**：

- **Site URL**：正式網址（開發時可設 `http://localhost:3000`）。
- **Redirect URLs** 加入：`http://localhost:3000/auth/callback`，以及正式網址的 `https://<你的網域>/auth/callback`（可用 `https://<你的網域>/**`）。

驗證信、重設密碼信與之後的 Google 綁定都會回到 `/auth/callback?next=…`；不在清單內的網址會被 Supabase 改導回 Site URL。電子郵件驗證為必要，註冊後需點信中連結；請在送出申請的同一個瀏覽器開啟連結（PKCE）。

### 之後啟用 Google（可選）

先用電子郵件註冊的會員，之後可在已登入狀態下從右上角帳號選單「連結 Google 帳號」。登入頁的 Google 按鈕也只在 Provider 開啟後才出現。

1. Google Cloud Console → APIs & Services → **OAuth consent screen** 設定應用程式名稱與支援信箱。
2. **Credentials → Create credentials → OAuth client ID**，類型選 _Web application_：
   - Authorized JavaScript origins：`http://localhost:3000`、正式網址。
   - Authorized redirect URIs：`https://<project-ref>.supabase.co/auth/v1/callback`（Supabase 的 callback，不是本站的）。
3. Supabase Dashboard → **Authentication → Sign In / Providers → Google**：啟用，貼上 Client ID 與 Client Secret，儲存。
4. 同一頁開啟 **Enable Manual Linking**，否則已存在的 email 帳號無法綁定 Google。

## Docker

```bash
npx tsx scripts/build-places.ts   # 映像建置需要已產生的地名 JSON
docker build -t hd-chart .
docker run -p 3000:3000 hd-chart
```

映像為多階段建置（Node 22 LTS，建置階段含 node-gyp 工具鏈），以 `next start` 執行完整的 `node_modules`；未使用 `output: 'standalone'`，因為尚未驗證 standalone 追蹤會帶上 `sweph` 的原生檔。

## 授權（上線前待決定）

`sweph` / Swiss Ephemeris 採 **AGPL-3.0 或付費商業授權**。透過網路提供服務即須公開整個程式的原始碼（AGPL），或向 Astrodienst 購買授權，或改用 MIT 授權的 `astronomy-engine`（需重跑參考命盤驗收）。**此決定尚未做出**（規格書 §13.1），本專案目前未附授權檔。

地名資料來自 [GeoNames](https://www.geonames.org/)，CC BY 4.0，頁尾已標示出處。

## 參考命盤

`tests/fixtures/reference-charts.json` 的預期值須由專案負責人從現有排盤工具人工取得並提供（規格書 §12.2），不得由程式或 AI 產生。驗收標準：類型、權威、人生角色、定義型態、通道與 26 筆閘門／爻 100% 一致。

## 隱私

排盤 API 不儲存出生資料，日誌只記錄錯誤代碼；未登入時前端只用 `sessionStorage` 暫存；不使用第三方分析工具。登入會員後，只有在使用者按下「儲存到帳號」（或在 `/charts/new` 新增）時，出生資料與命盤摘要才會存入 Supabase `public.charts`，僅本人可讀寫，可隨時刪除；刪除帳號時一併刪除（`on delete cascade`）。

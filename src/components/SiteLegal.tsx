import Link from 'next/link';
import type { ReactNode } from 'react';

function Ext({ href, children }: { href: string; children: ReactNode }) {
    return (
        <a className="underline hover:text-fg" href={href} rel="noopener noreferrer">
            {children}
        </a>
    );
}

export function PrivacySummary() {
    return (
        <p>
            出生資料僅用於即時計算，日誌不記錄出生資料。未登入時，結果只暫存在這個分頁；登入後只有你主動儲存才會寫入帳號。本站不使用第三方分析工具。
        </p>
    );
}

export function NodeModeCopy() {
    return (
        <p>
            月亮交點有兩種算法：真交點（預設）包含月球軌道的短週期擺動，平交點則取平均位置。兩者可能相差超過
            1°，足以改變人類圖的爻甚至閘門，也會改變星盤北交點的位置。人類圖結果頁可切換比較；星盤北交點採用排盤當下的設定。
        </p>
    );
}

export function SourceList() {
    return (
        <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>
                地名資料來自 <Ext href="https://www.geonames.org/">GeoNames</Ext>，以{' '}
                <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext> 授權使用。
            </li>
            <li>
                星曆計算：Swiss Ephemeris（Moshier 模式，© Astrodienst AG），經由 sweph
                套件使用，供人類圖星體啟動與西洋本命星盤（回歸黃道、地心座標；宮位預設普拉西度制，極區改用波菲利制或整宮制）。Swiss
                Ephemeris 採 AGPL-3.0 或商業授權。
                {/* TODO(§13.1): once the licensing decision is made, link the AGPL source code here
                  (or remove this note if a commercial licence is bought). */}
            </li>
            <li>
                人體圖與星盤輪盤為本站自行繪製的幾何圖形；閘門、通道、中心與黃道星座的對照為體系的公開事實。
            </li>
            <li>
                紫微斗數排盤使用開源套件 <Ext href="https://iztro.com/">iztro</Ext>
                （MIT）。有出生地經度時會先換成真太陽時再定時辰；派別為 iztro 預設通行版本。
            </li>
            <li>
                八字排盤使用開源套件{' '}
                <Ext href="https://github.com/6tail/lunar-javascript">lunar-javascript</Ext>
                （MIT）。與紫微斗數相同，有經度時會先換成真太陽時再定時辰；起運採晚子時（sect 2）。
            </li>
        </ul>
    );
}

export function PrivacyArticle() {
    return (
        <div className="flex flex-col gap-8 text-sm leading-relaxed text-muted">
            <section className="flex flex-col gap-2">
                <h2 className="font-serif text-lg font-medium text-accent">即時計算</h2>
                <p>
                    出生資料只送到本站排盤
                    API，用來同時計算人類圖、紫微斗數、八字與西洋本命星盤。伺服器不保存請求內容；錯誤日誌只記錄錯誤代碼，不含出生資料。地名搜尋只傳送你輸入的城市關鍵字，查詢本站內建的
                    GeoNames 索引。
                </p>
            </section>
            <section className="flex flex-col gap-2">
                <h2 className="font-serif text-lg font-medium text-accent">這個分頁裡的暫存</h2>
                <p>
                    未登入時，計算結果只暫存在這個分頁的
                    sessionStorage，關閉分頁即消失；出生資料不會出現在網址中。
                </p>
            </section>
            <section className="flex flex-col gap-2">
                <h2 className="font-serif text-lg font-medium text-accent">帳號與儲存</h2>
                <p>
                    登入後，本站會使用會員工作階段 cookie（Supabase
                    Auth）。只有在你按下「儲存到帳號」，或在命盤列表新增命盤時，才會把出生資料與命盤摘要存進你的帳號（僅你本人可讀取，包含你為好友建立的命盤）。可隨時刪除單筆命盤；刪除帳號時一併刪除。
                </p>
            </section>
            <section className="flex flex-col gap-2">
                <h2 className="font-serif text-lg font-medium text-accent">複製到外部服務</h2>
                <p>
                    本站不使用第三方分析工具。結果頁的「提供給 AI 的提示詞」含出生資料；若你複製到
                    ChatGPT、Claude 等外部服務，後續如何使用由該服務的政策決定。
                </p>
            </section>
            <section className="flex flex-col gap-2">
                <h2 className="font-serif text-lg font-medium text-accent">交點模式</h2>
                <NodeModeCopy />
            </section>
            <section className="flex flex-col gap-2">
                <h2 className="font-serif text-lg font-medium text-accent">資料來源與授權</h2>
                <SourceList />
            </section>
        </div>
    );
}

export function PrivacyPageLink({ children }: { children: ReactNode }) {
    return (
        <Link href="/privacy" className="underline hover:text-fg">
            {children}
        </Link>
    );
}

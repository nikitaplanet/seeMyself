// Spec §11.2 item 6 and §13 — attributions, ephemeris source, node-mode explanation and privacy note.

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-border bg-surface-2 text-sm leading-relaxed text-muted">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-2">
        <section aria-labelledby="footer-privacy">
          <h2 id="footer-privacy" className="mb-1 font-semibold text-fg">
            隱私說明
          </h2>
          <p>
            出生資料僅用於即時計算，日誌不記錄出生資料。計算結果只暫存在這個分頁的
            sessionStorage，關閉分頁即消失；出生資料不會出現在網址中。登入會員後，只有在你按下「儲存到帳號」時，
            才會把出生資料與命盤摘要存進你的帳號（僅你本人可讀取），並可隨時刪除。本站不使用第三方分析工具。
          </p>
        </section>
        <section aria-labelledby="footer-node">
          <h2 id="footer-node" className="mb-1 font-semibold text-fg">
            交點模式
          </h2>
          <p>
            月亮交點有兩種算法：真交點（預設）包含月球軌道的短週期擺動，平交點則取平均位置。兩者可能相差超過
            1°，足以改變爻甚至閘門；結果頁可切換比較。
          </p>
        </section>
        <section aria-labelledby="footer-sources" className="sm:col-span-2">
          <h2 id="footer-sources" className="mb-1 font-semibold text-fg">
            資料來源與授權
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              地名資料來自{' '}
              <a
                className="underline hover:text-fg"
                href="https://www.geonames.org/"
                rel="noopener noreferrer"
              >
                GeoNames
              </a>
              ，以{' '}
              <a
                className="underline hover:text-fg"
                href="https://creativecommons.org/licenses/by/4.0/"
                rel="noopener noreferrer"
              >
                CC BY 4.0
              </a>{' '}
              授權使用。
            </li>
            <li>
              星曆計算：Swiss Ephemeris（Moshier 模式，© Astrodienst AG），經由
              sweph 套件使用；Swiss Ephemeris 採 AGPL-3.0 或商業授權。
              {/* TODO(§13.1): once the licensing decision is made, link the AGPL source code here
                  (or remove this note if a commercial licence is bought). */}
            </li>
            <li>
              人體圖為本站自行繪製的幾何圖形；閘門、通道與中心的對照為體系的公開事實。
            </li>
            <li>
              紫微斗數排盤使用開源套件{' '}
              <a
                className="underline hover:text-fg"
                href="https://iztro.com/"
                rel="noopener noreferrer"
              >
                iztro
              </a>
              （MIT）。有出生地經度時會先換成真太陽時再定時辰；派別為 iztro
              預設通行版本。
            </li>
            <li>
              八字排盤使用開源套件{' '}
              <a
                className="underline hover:text-fg"
                href="https://github.com/6tail/lunar-javascript"
                rel="noopener noreferrer"
              >
                lunar-javascript
              </a>
              （MIT）。與紫微斗數相同，有經度時會先換成真太陽時再定時辰；起運採晚子時（sect 2）。
            </li>
          </ul>
        </section>
      </div>
    </footer>
  );
}

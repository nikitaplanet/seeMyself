import { NodeModeCopy, PrivacyPageLink, PrivacySummary, SourceList } from './SiteLegal';

// Spec §11.2 item 6 and §13 — attributions, ephemeris source, node-mode explanation and privacy note.

export function SiteFooter() {
    return (
        <footer className="border-t border-border/60 bg-surface-2 text-sm leading-relaxed text-muted">
            <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2">
                <section aria-labelledby="footer-privacy" className="flex flex-col gap-1">
                    <h2
                        id="footer-privacy"
                        className="font-serif text-base font-medium text-accent"
                    >
                        隱私說明
                    </h2>
                    <PrivacySummary />
                    <p>
                        <PrivacyPageLink>閱讀完整隱私說明</PrivacyPageLink>
                    </p>
                </section>
                <section aria-labelledby="footer-node" className="flex flex-col gap-1">
                    <h2 id="footer-node" className="font-serif text-base font-medium text-accent">
                        交點模式
                    </h2>
                    <NodeModeCopy />
                </section>
                <section
                    aria-labelledby="footer-sources"
                    className="flex flex-col gap-1 sm:col-span-2"
                >
                    <h2
                        id="footer-sources"
                        className="font-serif text-base font-medium text-accent"
                    >
                        資料來源與授權
                    </h2>
                    <SourceList />
                </section>
            </div>
        </footer>
    );
}

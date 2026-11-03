import {
  displayBrightness,
  displayPalaceName,
  type ZiweiScope,
} from '@/lib/ziwei/labels';
import {
  PALACE_GRID_AREA,
  type ZiweiChart,
  type ZiweiFlowStar,
  type ZiweiHoroscopeScope,
  type ZiweiPalace,
  type ZiweiStar,
} from '@/lib/ziwei/types';

const MUTAGEN_CLASS: Record<string, string> = {
  祿: 'ziwei-lu',
  权: 'ziwei-quan',
  權: 'ziwei-quan',
  科: 'ziwei-ke',
  忌: 'ziwei-ji',
};

export type MonthStart = 'yearlySoul' | 'doujun';

function scopeBundle(
  chart: ZiweiChart,
  scope: ZiweiScope,
  monthStart: MonthStart,
): {
  names: string[] | null;
  stars: ZiweiFlowStar[];
  suiqian12: string[];
  jiangqian12: string[];
  soulIndex: number;
} {
  const h = chart.horoscope;
  const natalSoul = chart.palaces.find(p => p.isSoulPalace)?.index ?? -1;
  if (scope === 'origin') {
    return {
      names: null,
      stars: [],
      suiqian12: [],
      jiangqian12: [],
      soulIndex: natalSoul,
    };
  }
  const pick = (
    item: ZiweiHoroscopeScope,
    extras?: { suiqian12?: string[]; jiangqian12?: string[] },
  ) => ({
    names: item.palaceNames,
    stars: item.stars,
    suiqian12: extras?.suiqian12 ?? [],
    jiangqian12: extras?.jiangqian12 ?? [],
    soulIndex: item.index,
  });
  if (scope === 'yearly') return pick(h.yearly, h.yearly);
  if (scope === 'monthly') {
    return monthStart === 'yearlySoul'
      ? {
          names: h.monthlyFromYearly.palaceNames,
          stars: h.monthly.stars,
          suiqian12: [],
          jiangqian12: [],
          soulIndex: h.monthlyFromYearly.index,
        }
      : pick(h.monthly);
  }
  if (scope === 'daily') {
    return monthStart === 'yearlySoul'
      ? {
          names: h.dailyFromYearly.palaceNames,
          stars: h.daily.stars,
          suiqian12: [],
          jiangqian12: [],
          soulIndex: h.dailyFromYearly.index,
        }
      : pick(h.daily);
  }
  return monthStart === 'yearlySoul'
    ? {
        names: h.hourlyFromYearly.palaceNames,
        stars: h.hourly.stars,
        suiqian12: [],
        jiangqian12: [],
        soulIndex: h.hourlyFromYearly.index,
      }
    : pick(h.hourly);
}

function StarLine({
  star,
  strong,
  showBrightness,
}: {
  star: ZiweiStar;
  strong: boolean;
  showBrightness: boolean;
}) {
  const mutagenClass = star.mutagen ? MUTAGEN_CLASS[star.mutagen] : '';
  const brightness = showBrightness ? displayBrightness(star.brightness) : '';
  const tough = star.type === 'tough';
  return (
    <span
      className={`inline-flex items-baseline gap-px ${strong ? 'font-semibold' : ''} ${tough ? 'ziwei-tough' : ''}`}
    >
      <span>{star.name}</span>
      {brightness ? (
        <span className="text-[0.65rem] font-normal">{brightness}</span>
      ) : null}
      {star.mutagen ? (
        <span
          className={`text-[0.65rem] font-semibold ${mutagenClass}`}
          aria-label={`四化${star.mutagen}`}
        >
          {star.mutagen}
        </span>
      ) : null}
    </span>
  );
}

function PalaceCell({
  palace,
  overlayName,
  flowStars,
  gods,
  nominalAge,
  isScopeSoul,
  selected,
  onSelect,
}: {
  palace: ZiweiPalace;
  overlayName: string | null;
  flowStars: ZiweiFlowStar[];
  gods: string[];
  nominalAge: number;
  isScopeSoul: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const title = overlayName
    ? displayPalaceName(overlayName)
    : palace.displayName;
  const extras = [
    ...palace.adjectiveStars.map(s => s.name),
    palace.changsheng12,
    palace.boshi12,
    ...gods,
    ...flowStars.map(s => s.name),
  ].filter(n => n);

  const bg = palace.isSoulPalace
    ? 'ziwei-palace-soul'
    : isScopeSoul && !palace.isSoulPalace
      ? 'ziwei-palace-scope'
      : 'bg-surface';

  return (
    <article
      className={`flex min-h-0 flex-col gap-0.5 overflow-hidden border border-border p-1.5 text-[11px] leading-snug sm:p-2 sm:text-xs ${bg} ${selected ? 'ring-2 ring-accent ring-inset' : ''}`}
      style={{ gridArea: PALACE_GRID_AREA[palace.index] }}
    >
      <header className="flex items-baseline justify-between gap-1">
        <h3 className="font-semibold">
          <span className="font-normal">
            {palace.heavenlyStem}
            {palace.earthlyBranch}
          </span>{' '}
          <button
            type="button"
            className="cursor-pointer font-semibold text-accent underline-offset-2 hover:underline"
            aria-pressed={selected}
            onClick={onSelect}
          >
            【{title}】
          </button>
        </h3>
      </header>
      {palace.decadal ? (
        <p className="text-muted">
          大限:{palace.decadal.range[0]}-{palace.decadal.range[1]}
        </p>
      ) : null}
      {palace.ages.length > 0 ? (
        <p className="text-muted">
          小限:
          {palace.ages.slice(0, 7).map(age => (
            <span
              key={age}
              className={
                age === nominalAge ? 'font-semibold text-accent' : undefined
              }
            >
              {age === palace.ages[0] ? '' : ' '}
              {age}
            </span>
          ))}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
        {palace.majorStars.map(s => (
          <StarLine key={`m-${s.name}`} star={s} strong showBrightness />
        ))}
        {palace.minorStars.map(s => (
          <StarLine
            key={`n-${s.name}`}
            star={s}
            strong
            showBrightness={false}
          />
        ))}
      </div>
      {extras.length > 0 ? (
        <p className="mt-auto pt-1 text-[0.65rem] leading-tight text-muted">
          {extras.join(',')}
        </p>
      ) : null}
    </article>
  );
}

export function ZiweiBoard({
  chart,
  scope,
  monthStart,
  selectedIndex,
  onSelectPalace,
}: {
  chart: ZiweiChart;
  scope: ZiweiScope;
  monthStart: MonthStart;
  selectedIndex: number;
  onSelectPalace: (index: number) => void;
}) {
  const bundle = scopeBundle(chart, scope, monthStart);
  return (
    <div
      className="ziwei-board surface-card grid w-full gap-px overflow-hidden bg-border"
      style={{
        gridTemplateColumns: '1fr 1fr 1fr 1fr',
        gridTemplateRows:
          'minmax(9rem, auto) minmax(9rem, auto) minmax(9rem, auto) minmax(9rem, auto)',
      }}
      role="img"
      aria-label="紫微斗數十二宮命盤"
    >
      {chart.palaces.map(p => (
        <PalaceCell
          key={p.index}
          palace={p}
          overlayName={bundle.names ? (bundle.names[p.index] ?? null) : null}
          flowStars={bundle.stars.filter(s => s.index === p.index)}
          gods={[
            bundle.suiqian12[p.index] ?? '',
            bundle.jiangqian12[p.index] ?? '',
          ].filter(Boolean)}
          nominalAge={chart.horoscope.nominalAge}
          isScopeSoul={bundle.soulIndex === p.index}
          selected={selectedIndex === p.index}
          onSelect={() => onSelectPalace(p.index)}
        />
      ))}
      <div
        className="flex flex-col justify-center gap-1 bg-surface-2 p-3 text-left text-sm leading-relaxed"
        style={{ gridArea: '2 / 2 / 4 / 4' }}
      >
        <p>
          陽曆：{chart.solarDateLabel}　{chart.yinYangGender}
        </p>
        <p>農曆：{chart.lunarDateLabel}</p>
        <p>干支：{chart.chineseDateLabel}</p>
        <p>五行局：{chart.fiveElementsLabel}</p>
        <p>
          生年四化：
          {chart.mutagens.map(m => `${m.star}化${m.mutagen}`).join('，')}
        </p>
        <p>
          命主：{chart.soul}，身主：{chart.body}
        </p>
      </div>
    </div>
  );
}

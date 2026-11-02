import { Solar } from 'lunar-javascript';
import type { BirthInput } from '../hd/types';
import { toZiweiTiming } from '../ziwei/time';
import { boneVerse, boneWeightQian, formatBone } from './chenggu';
import {
  branchNotesOf,
  PILLAR_KEYS,
  PILLAR_LABELS,
  stemNotesOf,
  tenGodOf,
  toTW,
  WX_GOD_GROUP,
  wxOfGan,
  wxOfZhi,
  ziZuoOf,
} from './labels';
import { natalDeXiu, naYinWx, shenshaOf } from './shensha';
import { classifyStrength, geJuOf, siLingOf, wuXingScores, yongShenText } from './strength';
import type { BaziChart, BaziDaYun, BaziHiddenStem, BaziPillar } from './types';

function splitDate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function splitTime(hhmm: string): { h: number; min: number } {
  const [h, min] = hhmm.split(':').map(Number);
  return { h, min };
}

export function computeBazi(input: BirthInput, timeUnknown = false): BaziChart {
  const gender = input.gender;
  if (gender !== 'male' && gender !== 'female') {
    throw new Error('八字排盤需要性別。');
  }
  const timing = toZiweiTiming({
    date: input.date,
    time: timeUnknown ? '12:00' : input.time,
    timezone: input.timezone,
    lon: input.place?.lon,
    timeUnknown,
    disambiguation: input.options?.disambiguation,
  });
  const clock = timeUnknown ? '12:00' : input.time;
  const used = timing.usedTrueSolar ? timing.trueSolarTime : clock;
  const { y, m, d } = splitDate(timing.solarDate);
  const { h, min } = splitTime(used);
  const solar = Solar.fromYmdHms(y, m, d, h, min, 0);
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();
  ec.setSect(2);

  const gans = [ec.getYearGan(), ec.getMonthGan(), ec.getDayGan(), ec.getTimeGan()];
  const zhis = [ec.getYearZhi(), ec.getMonthZhi(), ec.getDayZhi(), ec.getTimeZhi()];
  const hides = [
    ec.getYearHideGan(),
    ec.getMonthHideGan(),
    ec.getDayHideGan(),
    ec.getTimeHideGan(),
  ];
  const tenZhi = [
    ec.getYearShiShenZhi(),
    ec.getMonthShiShenZhi(),
    ec.getDayShiShenZhi(),
    ec.getTimeShiShenZhi(),
  ];
  const diShi = [ec.getYearDiShi(), ec.getMonthDiShi(), ec.getDayDiShi(), ec.getTimeDiShi()].map(
    toTW,
  );
  const naYin = [ec.getYearNaYin(), ec.getMonthNaYin(), ec.getDayNaYin(), ec.getTimeNaYin()].map(
    toTW,
  );
  const xunKong = [
    ec.getYearXunKong(),
    ec.getMonthXunKong(),
    ec.getDayXunKong(),
    ec.getTimeXunKong(),
  ];
  const ganTen = [
    toTW(ec.getYearShiShenGan()),
    toTW(ec.getMonthShiShenGan()),
    gender === 'female' ? '元女' : '元男',
    toTW(ec.getTimeShiShenGan()),
  ];
  const dayGan = gans[2];
  const dayWx = wxOfGan(dayGan);
  const yearNaYinWx = naYinWx(naYin[0]);
  const deXiu = natalDeXiu(dayGan, zhis[1]);

  const pillars: BaziPillar[] = PILLAR_KEYS.map((key, i) => {
    const hidden: BaziHiddenStem[] = (hides[i] ?? []).map((gan, hi) => ({
      gan,
      tenGod: toTW(tenZhi[i]?.[hi] ?? tenGodOf(dayGan, gan)),
    }));
    return {
      key,
      label: PILLAR_LABELS[key],
      gan: gans[i],
      zhi: zhis[i],
      ganTenGod: ganTen[i],
      hidden,
      diShi: diShi[i],
      ziZuo: ziZuoOf(gans[i], zhis[i]),
      xunKong: xunKong[i],
      naYin: naYin[i],
      shensha: shenshaOf({
        dayGan,
        yearZhi: zhis[0],
        yearNaYinWx,
        pillarKey: key,
        pillarGan: gans[i],
        pillarZhi: zhis[i],
        pillarGanZhi: `${gans[i]}${zhis[i]}`,
        deXiu,
      }),
    };
  });

  const yun = ec.getYun(gender === 'male' ? 1 : 0, 2);
  const startSolar = yun.getStartSolar();
  const daYun: BaziDaYun[] = yun
    .getDaYun()
    .filter((d) => d.getGanZhi())
    .slice(0, 9)
    .map((d) => {
      const gz = d.getGanZhi();
      const gan = gz.slice(0, 1);
      const zhi = gz.slice(1, 2);
      return {
        ganZhi: gz,
        gan,
        zhi,
        tenGod: tenGodOf(dayGan, gan),
        diShi: ziZuoOf(dayGan, zhi),
        startYear: d.getStartYear(),
        endYear: d.getEndYear(),
        startAge: d.getStartAge(),
        endAge: d.getEndAge(),
        years: d.getLiuNian().slice(0, 10).map((n) => ({
          ganZhi: n.getGanZhi(),
          year: n.getYear(),
        })),
      };
    });

  const scores = wuXingScores(gans, zhis, hides, zhis[1], dayWx);
  // Keep percents adding to 100 after rounding.
  const drift = 100 - scores.reduce((s, x) => s + x.percent, 0);
  if (drift !== 0) {
    const max = scores.reduce((a, b) => (a.percent >= b.percent ? a : b));
    max.percent += drift;
  }
  const classified = classifyStrength(scores, dayWx);
  const monthHidden = pillars[1].hidden;
  const geJu = toTW(geJuOf(monthHidden, pillars[1].ganTenGod));
  const yueStage = scores.find((s) => s.wx === dayWx)?.stage ?? '囚';
  const helpWx = (wx: ReturnType<typeof wxOfGan>) => {
    const g = WX_GOD_GROUP[dayWx][wx];
    return g === '比劫' || g === '印梟';
  };
  const di = zhis.some((z) => helpWx(wxOfZhi(z))) ? '得地' : '失地';
  const stemHelp = gans.filter((g) => helpWx(wxOfGan(g))).length;
  const shi = stemHelp > gans.length - stemHelp ? '得勢' : '失勢';
  const yong = yongShenText({
    dayGan,
    dayWx,
    monthZhi: zhis[1],
    geJu,
    strength: classified.strength,
    monthStageName: yueStage,
    di,
    shi,
  });

  const prevJie = lunar.getPrevJieQi();
  const jieSolar = prevJie.getSolar();
  const jieParts = jieSolar.toYmdHms().slice(0, 10).split('-').map(Number);
  const jieUtc = Date.UTC(jieParts[0], jieParts[1] - 1, jieParts[2]);
  const birthUtc = Date.UTC(y, m - 1, d);
  const dayOfLing = Math.floor((birthUtc - jieUtc) / 86400000) + 1;

  const qian = boneWeightQian(
    `${gans[0]}${zhis[0]}`,
    Math.abs(lunar.getMonth()) || 1,
    lunar.getDay(),
    zhis[3],
  );
  const bone = formatBone(qian);
  const verse = boneVerse(qian, gender);

  const yinYang = '甲丙戊庚壬'.includes(dayGan) ? '陽' : '陰';
  const hourLabel = timing.usedTrueSolar
    ? `${Number(timing.trueSolarTime.slice(0, 2))}時`
    : `${h}時`;

  return {
    gender,
    timeUnknown,
    solarLabel: `${y}年${m}月${d}日${hourLabel}`,
    lunarLabel: `${gans[0]}${zhis[0]}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}日${zhis[3]}時`,
    ganZhiLabel: `${gans[0]}${zhis[0]} ${gans[1]}${zhis[1]} ${gans[2]}${zhis[2]} ${gans[3]}${zhis[3]}`,
    genderLabel: gender === 'female' ? '坤造　女' : '乾造　男',
    yinYang,
    shengXiao: toTW(lunar.getYearShengXiao()),
    xingZuo: toTW(solar.getXingZuo()),
    jieQi: toTW(prevJie.getName()),
    season: toTW(lunar.getSeason()),
    dayMaster: `${dayGan}${dayWx}`,
    dayMasterWx: dayWx,
    siLing: siLingOf(zhis[1], dayOfLing),
    geJu,
    strength: classified.strength,
    wangShuai: classified.wangShuai,
    mingGong: ec.getMingGong(),
    shenGong: ec.getShenGong(),
    taiYuan: ec.getTaiYuan(),
    taiXi: ec.getTaiXi(),
    yunStartLabel: formatYunStart(startSolar.toYmdHms()),
    yunStartNote: `出生${yun.getStartYear()}年${yun.getStartMonth()}月${yun.getStartDay()}天後起運`,
    yunForward: yun.isForward(),
    pillars,
    stemNotes: stemNotesOf(gans),
    branchNotes: branchNotesOf(zhis),
    daYun,
    wuXing: scores,
    helpers: classified.helpers,
    drainers: classified.drainers,
    yongShenSummary: yong.summary,
    yongShenBody: yong.body,
    tiaoHou: yong.tiaoHou,
    xiShen: yong.xiShen,
    yongShen: yong.yongShen,
    jiShen: yong.jiShen,
    boneLiang: bone.liang,
    boneQian: bone.qian,
    boneVerse: verse.verse,
    boneNote: verse.note,
  };
}

function formatYunStart(iso: string): string {
  const [date, time] = iso.split(' ');
  const [yy, mm, dd] = date.split('-');
  return `${yy}年${Number(mm)}月${Number(dd)}日 ${time ?? '00:00:00'}`;
}

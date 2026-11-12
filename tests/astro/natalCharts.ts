import type { BirthInput } from '@/lib/hd/types';

// Thirty real birth moments spread across decades, seasons, hours and places, used by the
// natal distinctiveness tests. Three have an unknown birth time.
const TPE = { name: '臺北市', lat: 25.04776, lon: 121.53185, countryCode: 'TW' };
const KHH = { name: '高雄市', lat: 22.6273, lon: 120.3014, countryCode: 'TW' };
const TXG = { name: '臺中市', lat: 24.1477, lon: 120.6736, countryCode: 'TW' };
const NYC = { name: 'New York', lat: 40.7128, lon: -74.006, countryCode: 'US' };
const LON = { name: 'London', lat: 51.5074, lon: -0.1278, countryCode: 'GB' };
const TYO = { name: '東京', lat: 35.6762, lon: 139.6503, countryCode: 'JP' };

function b(date: string, time: string, timezone: string, place: BirthInput['place']): BirthInput {
    return { date, time, timezone, place };
}

export const VARIED_CHARTS: Array<[string, BirthInput, boolean]> = [
    ['1993-06-21 臺北', b('1993-06-21', '11:18', 'Asia/Taipei', TPE), false],
    ['1946-06-14 紐約', b('1946-06-14', '10:54', 'America/New_York', NYC), false],
    ['1952-01-09 倫敦', b('1952-01-09', '03:40', 'Europe/London', LON), false],
    ['1958-08-29 紐約', b('1958-08-29', '19:05', 'America/New_York', NYC), false],
    ['1964-03-15 臺中', b('1964-03-15', '07:30', 'Asia/Taipei', TXG), false],
    ['1969-10-02 東京', b('1969-10-02', '22:15', 'Asia/Tokyo', TYO), false],
    ['1975-12-24 高雄', b('1975-12-24', '13:50', 'Asia/Taipei', KHH), false],
    ['1979-05-08 倫敦', b('1979-05-08', '05:20', 'Europe/London', LON), false],
    ['1983-02-17 臺北', b('1983-02-17', '16:45', 'Asia/Taipei', TPE), false],
    ['1986-07-30 東京', b('1986-07-30', '09:10', 'Asia/Tokyo', TYO), false],
    ['1990-11-11 臺中', b('1990-11-11', '01:25', 'Asia/Taipei', TXG), false],
    ['1993-06-30 高雄', b('1993-06-30', '20:40', 'Asia/Taipei', KHH), false],
    ['1997-09-19 紐約', b('1997-09-19', '14:05', 'America/New_York', NYC), false],
    ['2000-04-01 臺北', b('2000-04-01', '06:55', 'Asia/Taipei', TPE), false],
    ['2003-01-27 倫敦', b('2003-01-27', '23:30', 'Europe/London', LON), false],
    ['2006-08-12 臺中', b('2006-08-12', '12:00', 'Asia/Taipei', TXG), false],
    ['2010-10-23 東京', b('2010-10-23', '17:35', 'Asia/Tokyo', TYO), false],
    ['2014-03-03 高雄', b('2014-03-03', '04:15', 'Asia/Taipei', KHH), false],
    ['1949-04-12 臺北', b('1949-04-12', '08:20', 'Asia/Taipei', TPE), false],
    ['1955-07-07 倫敦', b('1955-07-07', '15:10', 'Europe/London', LON), false],
    ['1961-11-28 紐約', b('1961-11-28', '02:45', 'America/New_York', NYC), false],
    ['1967-02-04 東京', b('1967-02-04', '11:30', 'Asia/Tokyo', TYO), false],
    ['1973-09-09 臺中', b('1973-09-09', '18:00', 'Asia/Taipei', TXG), false],
    ['1981-06-02 高雄', b('1981-06-02', '05:50', 'Asia/Taipei', KHH), false],
    ['1995-12-15 倫敦', b('1995-12-15', '21:40', 'Europe/London', LON), false],
    ['2001-08-26 紐約', b('2001-08-26', '10:05', 'America/New_York', NYC), false],
    ['2008-05-18 東京', b('2008-05-18', '00:35', 'Asia/Tokyo', TYO), false],
    ['1984-01-30 臺北（時間不詳）', b('1984-01-30', '12:00', 'Asia/Taipei', TPE), true],
    ['1988-11-03 高雄（時間不詳）', b('1988-11-03', '12:00', 'Asia/Taipei', KHH), true],
    ['1972-05-20 臺北（時間不詳）', b('1972-05-20', '12:00', 'Asia/Taipei', TPE), true],
];
